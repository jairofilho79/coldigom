#!/usr/bin/env python3
"""Orchestrate PDF → ChordPro pipeline."""
from __future__ import annotations

import argparse
import json
import random
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from inventory import CHORD_KINDS, DEFAULT_OUT as MANIFEST_DEFAULT, iter_chord_pdfs  # noqa: E402
from crops import build_cropped_songs  # noqa: E402
from ocr import ocr_many  # noqa: E402
from preprocess import preprocess_pdf  # noqa: E402
from segment import load_catalog, segment_all  # noqa: E402
from to_chordpro import write_songs  # noqa: E402

STAGING = ROOT / "storage" / "chordpro_staging"
PRAISES = ROOT / "storage" / "assets" / "praises"


def load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        return list(iter_chord_pdfs(PRAISES))
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def process_one(row: dict, *, debug: bool, dpi: float, crops: bool = True) -> dict:
    pdf = Path(row["pdf_abs"])
    mid = row["material_id"]
    out_dir = STAGING / mid
    out_dir.mkdir(parents=True, exist_ok=True)
    debug_dir = out_dir / "_ocr_debug"
    pre_dir = debug_dir if debug else out_dir / "_tmp_pre"

    praise_dir = PRAISES / row["praise_id"]
    catalog = load_catalog(praise_dir)

    images = preprocess_pdf(pdf, pre_dir, dpi=dpi, split=True)
    ocrs = ocr_many(images)
    if debug:
        for o in ocrs:
            if o.source:
                (debug_dir / (o.source.stem + ".txt")).write_text(o.text, encoding="utf-8")

    used_crops = False
    crop_files: list[str] = []
    if crops and catalog:
        crop_dir = debug_dir / "_crops" if debug else out_dir / "_tmp_crops"
        songs, song_crops = build_cropped_songs(images, ocrs, catalog, crop_dir)
        if songs and any(s.body_lines for s in songs):
            used_crops = True
            crop_files = [c.path.name for c in song_crops]
            if debug:
                for c in song_crops:
                    if c.ocr and c.ocr.source:
                        (crop_dir / (c.path.stem + ".txt")).write_text(c.ocr.text, encoding="utf-8")
            if not debug and crop_dir.exists():
                for p in crop_dir.glob("*"):
                    p.unlink()
                crop_dir.rmdir()
        else:
            songs = segment_all(
                ocrs,
                fallback_title=row.get("praise_name") or "",
                catalog=catalog or None,
            )
    else:
        songs = segment_all(
            ocrs,
            fallback_title=row.get("praise_name") or "",
            catalog=catalog or None,
        )

    paths = write_songs(songs, out_dir)

    catalog_nums = [e.number for e in catalog]
    got_nums = [s.number for s in songs if s.number]
    needs_review = bool(catalog) and (
        len(songs) != len(catalog) or set(catalog_nums) != set(got_nums)
    )

    source = {
        "praise_id": row["praise_id"],
        "praise_name": row["praise_name"],
        "material_id": mid,
        "material_kind": row["material_kind"],
        "kind_label": row.get("kind_label"),
        "pdf_path": row.get("pdf_path"),
        "chord_material_ids": row.get("chord_material_ids") or [],
        "catalog_songs": len(catalog),
        "catalog_numbers": catalog_nums,
        "songs": len(paths),
        "used_crops": used_crops,
        "crop_files": crop_files,
        "needs_review": needs_review,
        "outputs": [p.name for p in paths],
    }
    (out_dir / "_source.json").write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding="utf-8")

    if not debug and pre_dir.exists():
        for p in pre_dir.glob("*"):
            p.unlink()
        try:
            pre_dir.rmdir()
        except OSError:
            pass

    return source


def purge_legacy_txt(rows: list[dict], *, only_processed: set[str] | None = None) -> int:
    """Delete proprietary .txt for chord materials whose source PDF was processed."""
    n = 0
    for row in rows:
        mid = row["material_id"]
        if only_processed is not None and mid not in only_processed:
            continue
        praise_dir = PRAISES / row["praise_id"]
        if not praise_dir.is_dir():
            continue
        candidates = [praise_dir / f"{mid}.txt"]
        for cid in row.get("chord_material_ids") or []:
            candidates.append(praise_dir / f"{cid}.txt")
        for p in candidates:
            if p.exists():
                p.unlink()
                n += 1
    return n


def pick_pilot(rows: list[dict], n: int, seed: int = 42) -> list[dict]:
    """Diverse pilot: mix kinds + prefer multi-song via metadata_from_chords when present."""
    import yaml

    by_kind: dict[str, list[dict]] = {k: [] for k in CHORD_KINDS}
    scored: list[tuple[int, dict]] = []
    for r in rows:
        if not r.get("pdf_exists"):
            continue
        by_kind.setdefault(r["material_kind"], []).append(r)
        songs_hint = 1
        mfc = PRAISES / r["praise_id"] / "metadata_from_chords.yml"
        if mfc.exists():
            data = yaml.safe_load(mfc.read_text() or "") or []
            if isinstance(data, list) and data:
                songs_hint = len(data)
        scored.append((songs_hint, r))

    random.seed(seed)
    picked: list[dict] = []
    for target in (1, 2, 3, 4):
        bucket = [r for h, r in scored if h == target]
        random.shuffle(bucket)
        for r in bucket[: max(3, n // 8)]:
            if r not in picked:
                picked.append(r)

    for kind, lst in by_kind.items():
        if lst and not any(p["material_kind"] == kind for p in picked):
            picked.append(random.choice(lst))

    pool = [r for r in rows if r.get("pdf_exists")]
    random.shuffle(picked)
    while len(picked) < n and pool:
        cand = random.choice(pool)
        if cand not in picked:
            picked.append(cand)
    return picked[:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest", type=Path, default=MANIFEST_DEFAULT)
    ap.add_argument("--pilot", type=int, default=0, help="Process N diverse PDFs")
    ap.add_argument("--all", action="store_true", help="Process entire manifest")
    ap.add_argument("--limit", type=int, default=0, help="Cap after selection")
    ap.add_argument("--ids", nargs="*", help="Specific material_id(s)")
    ap.add_argument("--dpi", type=float, default=350)
    ap.add_argument("--debug", action="store_true", help="Keep OCR PNGs/txt")
    ap.add_argument("--crops", action=argparse.BooleanOptionalAction, default=True, help="Crop+re-OCR per catalog song")
    ap.add_argument("--purge-legacy-txt", action="store_true")
    ap.add_argument("--purge-only", action="store_true", help="Only purge txt, no OCR")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rows = load_manifest(args.manifest)
    existing = [r for r in rows if r.get("pdf_exists")]

    if args.purge_only:
        n = purge_legacy_txt(existing)
        print(f"purged {n} legacy txt files")
        return

    selected: list[dict]
    if args.ids:
        want = list(args.ids)
        selected = [
            r
            for r in existing
            if r["material_id"] in want or any(r["material_id"].startswith(w) for w in want)
        ]
    elif args.pilot:
        selected = pick_pilot(existing, args.pilot, seed=args.seed)
        args.debug = True  # pilot keeps debug artifacts
    elif args.all:
        selected = existing
    else:
        ap.error("pass --pilot N, --all, or --ids ...")
        return

    if args.limit:
        selected = selected[: args.limit]

    ok = fail = 0
    processed: set[str] = set()
    log_path = HERE / "out" / "batch_log.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log:
        for i, row in enumerate(selected, 1):
            mid = row["material_id"]
            print(f"[{i}/{len(selected)}] {row.get('praise_name','')[:50]} ({mid[:8]}…)")
            try:
                src = process_one(row, debug=args.debug, dpi=args.dpi, crops=args.crops)
                processed.add(mid)
                ok += 1
                log.write(json.dumps({"ok": True, **src}, ensure_ascii=False) + "\n")
                print(f"  → {src['songs']} songs" + (" (crops)" if src.get("used_crops") else ""))
            except Exception as e:
                fail += 1
                log.write(
                    json.dumps(
                        {"ok": False, "material_id": mid, "error": str(e)},
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                print(f"  FAIL: {e}")
                traceback.print_exc()

    print(f"done ok={ok} fail={fail}")

    if args.purge_legacy_txt:
        # only purge for successfully processed PDFs (safe); --all with purge uses processed set
        n = purge_legacy_txt(existing, only_processed=processed if processed else None)
        print(f"purged {n} legacy txt files")


if __name__ == "__main__":
    main()
