#!/usr/bin/env python3
"""Local sample QA for chordpro_staging (no upload).

Scores chord validity + lyric density / OCR-junk signals used in phase-1 refine.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "storage" / "chordpro_staging"

CHORD_OK = re.compile(
    r"^([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M)?\d{0,2}(?:/#?[A-G](?:#|b)?)?|bis|N\.?C\.?|%)$",
    re.I,
)
BRACKET_RE = re.compile(r"\[([^\]\n]+)\]")
SHRED_RE = re.compile(r"(jn|ej|aj|ij|oj|uj|l[ae]x)", re.I)


def _lyric_text(line: str) -> str:
    t = BRACKET_RE.sub("", line)
    return re.sub(r"[-_=|]+", " ", t).strip()


def score_file(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    brackets = BRACKET_RE.findall(text)
    bad = [t for t in brackets if not CHORD_OK.match(t.strip())]
    body_lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("{")]
    mixedish = sum(
        1
        for ln in body_lines
        if BRACKET_RE.search(ln) and re.search(r"[a-zA-ZÀ-ÿ]{4,}", BRACKET_RE.sub("", ln))
    )
    stubs = sum(1 for ln in body_lines if 0 < len(_lyric_text(ln)) <= 2)
    lyric_chars = sum(len(re.sub(r"\s+", "", _lyric_text(ln))) for ln in body_lines)
    density = round(lyric_chars / len(body_lines), 1) if body_lines else 0.0
    words = re.findall(r"[A-Za-zÀ-ÿ]{4,}", text)
    shred_pct = round(100 * sum(1 for w in words if SHRED_RE.search(w)) / len(words), 1) if words else 0.0
    flags: list[str] = []
    if bad:
        flags.append("bad_chords")
    if len(body_lines) < 3:
        flags.append("too_short")
    if len(body_lines) > 50:
        flags.append("too_long")
    if body_lines and stubs / len(body_lines) > 0.3 and len(body_lines) >= 8:
        flags.append("stubs")
    if len(body_lines) >= 10 and density < 9:
        flags.append("low_density")
    if text.count("|") >= 5:
        flags.append("pipes")
    if shred_pct > 25:
        flags.append("shreds")
    if len(re.findall(r"[A-Za-zÀ-ÿ]\s*-\s+[A-Za-zÀ-ÿ]|[A-Za-zÀ-ÿ]\s+-\s*[A-Za-zÀ-ÿ]", text)) >= 2:
        flags.append("syllables")
    if "**" in text or re.search(r"\\[A-G]", text):
        flags.append("markdown")
    if len(brackets) < 2:
        flags.append("no_chords")
    return {
        "file": path.name,
        "brackets": len(brackets),
        "bad": len(bad),
        "bad_pct": round(100 * len(bad) / len(brackets), 1) if brackets else 0.0,
        "body_lines": len(body_lines),
        "inline_chord_lines": mixedish,
        "density": density,
        "stub_pct": round(100 * stubs / len(body_lines), 1) if body_lines else 0.0,
        "shred_pct": shred_pct,
        "flags": flags,
        "ok": not flags,
        "bad_samples": bad[:8],
    }


def score_dir(pdf_dir: Path) -> dict:
    src = {}
    sp = pdf_dir / "_source.json"
    if sp.exists():
        src = json.loads(sp.read_text(encoding="utf-8"))
    files = [score_file(p) for p in sorted(pdf_dir.glob("*.chordpro"))]
    brackets = sum(f["brackets"] for f in files)
    bad = sum(f["bad"] for f in files)
    ok_n = sum(1 for f in files if f["ok"])
    return {
        "material_id": pdf_dir.name,
        "praise_name": src.get("praise_name"),
        "songs": len(files),
        "catalog_songs": src.get("catalog_songs"),
        "needs_review": src.get("needs_review"),
        "brackets": brackets,
        "bad": bad,
        "bad_pct": round(100 * bad / brackets, 1) if brackets else 0.0,
        "ok_songs": ok_n,
        "fail_songs": len(files) - ok_n,
        "files": files,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ids", nargs="*", help="material_id prefixes or full ids")
    ap.add_argument("--limit", type=int, default=12)
    ap.add_argument("--all-files", action="store_true", help="print every song, not only fails")
    args = ap.parse_args()

    dirs: list[Path] = []
    if args.ids:
        for want in args.ids:
            matched = [d for d in STAGING.iterdir() if d.is_dir() and d.name.startswith(want)]
            dirs.extend(matched)
    else:
        dirs = [d for d in sorted(STAGING.iterdir()) if d.is_dir() and (d / "_source.json").exists()][
            : args.limit
        ]

    rows = [score_dir(d) for d in dirs]
    rows.sort(key=lambda r: (-r["fail_songs"], -r["bad_pct"], -r["bad"]))
    total_ok = sum(r["ok_songs"] for r in rows)
    total = sum(r["songs"] for r in rows)
    print(f"SUMMARY  ok={total_ok}/{total}  materials={len(rows)}")
    for r in rows:
        print(
            f"  fail={r['fail_songs']}/{r['songs']}  bad_chords={r['bad_pct']:5.1f}%  "
            f"cat={r.get('catalog_songs')}  {r['praise_name']!s:.40}  {r['material_id'][:8]}"
        )
        for f in r["files"]:
            if f["flags"] or args.all_files:
                print(
                    f"         {f['file']}: ok={f['ok']} dens={f['density']} "
                    f"flags={f['flags'] or '-'} bad={f['bad_samples'] or '-'}"
                )


if __name__ == "__main__":
    main()
