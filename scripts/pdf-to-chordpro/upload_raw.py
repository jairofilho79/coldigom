#!/usr/bin/env python3
"""Upload chordpro_staging/*.chordpro → D1 raw_chordpros table."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "storage" / "chordpro_staging"
OUT_DIR = Path(__file__).resolve().parent / "out"

TITLE_RE = re.compile(r"^\{title:\s*(.+)\}\s*$", re.I)
SUBTITLE_RE = re.compile(r"^\{subtitle:\s*(.+)\}\s*$", re.I)


def stable_id(pdf_material_id: str, filename: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"coldigom/raw-chordpro/{pdf_material_id}/{filename}"))


def sql_str(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def parse_headers(content: str) -> tuple[str | None, str | None]:
    title = subtitle = None
    for line in content.splitlines()[:20]:
        m = TITLE_RE.match(line.strip())
        if m:
            title = m.group(1).strip()
            continue
        m = SUBTITLE_RE.match(line.strip())
        if m:
            subtitle = m.group(1).strip()
    return title, subtitle


def collect_rows(staging: Path) -> list[dict]:
    rows = []
    for pdf_dir in sorted(staging.iterdir()):
        if not pdf_dir.is_dir():
            continue
        src_path = pdf_dir / "_source.json"
        if not src_path.exists():
            continue
        src = json.loads(src_path.read_text(encoding="utf-8"))
        pdf_id = src.get("material_id") or pdf_dir.name
        for cp in sorted(pdf_dir.glob("*.chordpro")):
            content = cp.read_text(encoding="utf-8", errors="replace")
            title, subtitle = parse_headers(content)
            rows.append({
                "id": stable_id(pdf_id, cp.name),
                "source_pdf_material_id": pdf_id,
                "praise_id": src.get("praise_id"),
                "praise_name": src.get("praise_name"),
                "kind_label": src.get("kind_label"),
                "source_filename": cp.name,
                "title": title,
                "subtitle": subtitle,
                "content": content,
                "debug_batch": None,
            })
    return rows


def collect_fase2_rows(report_path: Path, staging: Path) -> list[dict]:
    """50 human_review songs with debug_batch=fase2 (ids prefixed to avoid collisions)."""
    report = json.loads(report_path.read_text(encoding="utf-8"))
    items = report.get("human_review") or []
    rows = []
    for item in items:
        rel = Path(item["path"])
        path = rel if rel.is_absolute() else ROOT / rel
        mid = path.parent.name
        song = item.get("song") or path.name
        src_path = staging / mid / "_source.json"
        src = json.loads(src_path.read_text(encoding="utf-8")) if src_path.exists() else {}
        pdf_id = src.get("material_id") or mid
        if path.exists():
            content = path.read_text(encoding="utf-8", errors="replace")
        else:
            flags = ",".join(item.get("flags") or ["missing"])
            content = (
                f"{{title: {song}}}\n"
                f"{{subtitle: FASE2 MISSING — {flags}}}\n\n"
                f"# Arquivo ausente no staging (auto_fail). material={mid}\n"
            )
        title, subtitle = parse_headers(content)
        flags = ",".join(item.get("flags") or [])
        # ponytail: reuse kind_label for QA verdict (shown in Raw ChordPro UI)
        if item.get("auto_ok"):
            qa_label = "auto_ok"
        else:
            qa_label = f"auto_fail: {flags}" if flags else "auto_fail"
        material_kind = src.get("kind_label")
        rows.append({
            "id": stable_id(f"fase2/{pdf_id}", song),
            "source_pdf_material_id": pdf_id,
            "praise_id": src.get("praise_id"),
            "praise_name": src.get("praise_name"),
            "kind_label": f"{qa_label} · {material_kind}" if material_kind else qa_label,
            "source_filename": song,
            "title": title,
            "subtitle": subtitle,
            "content": content,
            "debug_batch": "fase2",
        })
    return rows


def write_sql_chunks(rows: list[dict], out_dir: Path, rows_per_file: int = 300, prefix: str = "raw_chordpros") -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    files: list[Path] = []
    insert_batch = 40
    for chunk_start in range(0, len(rows), rows_per_file):
        chunk = rows[chunk_start : chunk_start + rows_per_file]
        part = out_dir / f"{prefix}_{chunk_start // rows_per_file:03d}.sql"
        with part.open("w", encoding="utf-8") as f:
            for i in range(0, len(chunk), insert_batch):
                batch = chunk[i : i + insert_batch]
                f.write(
                    "INSERT OR REPLACE INTO raw_chordpros "
                    "(id, source_pdf_material_id, praise_id, praise_name, kind_label, "
                    "source_filename, title, subtitle, content, validated, debug_batch, updated_at) VALUES\n"
                )
                vals = [
                    f"({sql_str(r['id'])}, {sql_str(r['source_pdf_material_id'])}, "
                    f"{sql_str(r.get('praise_id'))}, {sql_str(r.get('praise_name'))}, "
                    f"{sql_str(r.get('kind_label'))}, {sql_str(r['source_filename'])}, "
                    f"{sql_str(r.get('title'))}, {sql_str(r.get('subtitle'))}, "
                    f"{sql_str(r['content'])}, 0, {sql_str(r.get('debug_batch'))}, datetime('now'))"
                    for r in batch
                ]
                f.write(",\n".join(vals) + ";\n")
        files.append(part)
    print(f"wrote {len(rows)} rows in {len(files)} file(s)")
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--staging", type=Path, default=STAGING)
    ap.add_argument("--fase2", action="store_true", help="upload phase2 human_review pack (debug_batch=fase2)")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--local", action="store_true")
    args = ap.parse_args()

    if args.fase2:
        report = OUT_DIR / "phase2_report.json"
        rows = collect_fase2_rows(report, args.staging)
        prefix = "raw_chordpros_fase2"
    else:
        rows = collect_rows(args.staging)
        prefix = "raw_chordpros"

    if not rows:
        print("no .chordpro files found", file=sys.stderr)
        sys.exit(1)

    files = write_sql_chunks(rows, OUT_DIR, prefix=prefix)

    if args.execute:
        remote = [] if args.local else ["--remote"]
        for sql_file in files:
            cmd = ["wrangler", "d1", "execute", "coldigom", *remote, f"--file={sql_file}"]
            print("running:", " ".join(cmd))
            subprocess.check_call(cmd, cwd=ROOT / "api")


if __name__ == "__main__":
    main()
