#!/usr/bin/env python3
"""Batch runner for Gemma local ChordPro pipeline.

Input (same as the Minha Porção pilot):
  storage/chordpro_staging/<material_id>/_ocr_debug/_crops/crop_pXX_{left|right}_<n>.png
  → produced by batch.py --crops --debug (crops.py), NOT the full PDF page.

For each crop with a matching *.chordpro (by hymn number), runs gemma_local_pipeline
and writes to out/gemma_local_batch/<material_id>/<chordpro_stem>/final.chordpro

Examples:
  python3 gemma_local_batch.py --dry-run
  python3 gemma_local_batch.py --limit 3
  python3 gemma_local_batch.py --material bfbddf5a-eccf-4c4a-90fc-5baf55aba7d0
  python3 gemma_local_batch.py --resume --limit 50
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from gemma_local_pipeline import MODEL, run_pipeline  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "storage" / "chordpro_staging"
OUT_ROOT = HERE / "out" / "gemma_local_batch"

CROP_RE = re.compile(r"^crop_p\d+_(?:left|right)_(\d+)\.png$", re.I)
HEADER_RE = re.compile(r"^\{[a-zA-Z][^}]*\}\s*$")
NUM_FROM_CP = re.compile(r"^\d+-(\d+)-")


def hymn_num_from_chordpro(name: str) -> str | None:
    m = NUM_FROM_CP.match(name)
    return m.group(1) if m else None


def extract_headers(chordpro: Path) -> str:
    lines: list[str] = []
    for ln in chordpro.read_text(encoding="utf-8", errors="replace").splitlines():
        if HEADER_RE.match(ln.strip()):
            lines.append(ln.strip())
            continue
        if lines and not ln.strip():
            break
        if lines and not HEADER_RE.match(ln.strip()):
            break
    # keep only useful meta for pipeline
    keep = ("title", "subtitle", "key", "rhythm", "artist")
    filtered = []
    for ln in lines:
        low = ln.lower()
        if any(low.startswith("{" + k) for k in keep):
            filtered.append(ln)
    return ("\n".join(filtered) + "\n") if filtered else "{title: unknown}\n"


def discover_jobs(staging: Path, material: str | None = None) -> list[dict]:
    jobs: list[dict] = []
    dirs = sorted(staging.iterdir())
    for d in dirs:
        if not d.is_dir():
            continue
        if material and not (d.name == material or d.name.startswith(material)):
            continue
        crops_dir = d / "_ocr_debug" / "_crops"
        if not crops_dir.is_dir():
            continue
        by_num: dict[str, Path] = {}
        for cp in sorted(d.glob("*.chordpro")):
            num = hymn_num_from_chordpro(cp.name)
            if num:
                by_num[num] = cp
        for crop in sorted(crops_dir.glob("crop_*.png")):
            m = CROP_RE.match(crop.name)
            if not m:
                continue
            num = m.group(1)
            cp = by_num.get(num)
            if not cp:
                continue
            jobs.append(
                {
                    "material_id": d.name,
                    "hymn_number": num,
                    "crop": crop,
                    "chordpro": cp,
                    "stem": cp.stem,
                }
            )
    return jobs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--staging", type=Path, default=STAGING)
    ap.add_argument("--out-root", type=Path, default=OUT_ROOT)
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--limit", type=int, default=0, help="max jobs (0=all)")
    ap.add_argument("--material", default=None, help="filter material id / prefix")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--resume", action="store_true", help="skip if final.chordpro exists")
    ap.add_argument("--chords-llm", action="store_true")
    args = ap.parse_args()

    jobs = discover_jobs(args.staging, args.material)
    if args.limit > 0:
        jobs = jobs[: args.limit]

    print(f"jobs={len(jobs)} model={args.model} staging={args.staging}")
    if args.dry_run:
        from gemma_local_pipeline import find_cross_column_continuations

        for j in jobs[:20]:
            cross = find_cross_column_continuations(j["crop"].parent, j["hymn_number"], j["crop"])
            flag = f"  +cross({len(cross)})" if cross else ""
            print(f"  {j['material_id'][:8]}…  #{j['hymn_number']}  {j['stem']}  ← {j['crop'].name}{flag}")
        if len(jobs) > 20:
            print(f"  … +{len(jobs) - 20} more")
        return

    done = fail = skip = 0
    t_all = time.time()
    manifest = []
    for i, j in enumerate(jobs, 1):
        out_dir = args.out_root / j["material_id"] / j["stem"]
        final = out_dir / "final.chordpro"
        if args.resume and final.exists() and final.stat().st_size > 40:
            skip += 1
            print(f"[{i}/{len(jobs)}] skip {j['stem']}", flush=True)
            continue
        headers = extract_headers(j["chordpro"])
        print(f"[{i}/{len(jobs)}] {j['stem']} …", flush=True)
        t0 = time.time()
        try:
            run_pipeline(
                j["crop"],
                out_dir,
                headers,
                args.model,
                chords_llm=args.chords_llm,
            )
            elapsed = round(time.time() - t0, 1)
            done += 1
            manifest.append({**{k: str(v) if isinstance(v, Path) else v for k, v in j.items()}, "ok": True, "elapsed_s": elapsed, "out": str(final)})
        except Exception as e:
            fail += 1
            elapsed = round(time.time() - t0, 1)
            print(f"  FAIL {e}", flush=True)
            manifest.append({**{k: str(v) if isinstance(v, Path) else v for k, v in j.items()}, "ok": False, "error": str(e), "elapsed_s": elapsed})

    args.out_root.mkdir(parents=True, exist_ok=True)
    man_path = args.out_root / "manifest.json"
    man_path.write_text(json.dumps({"done": done, "fail": fail, "skip": skip, "jobs": manifest}, indent=2) + "\n", encoding="utf-8")
    print(f"✓ done={done} fail={fail} skip={skip} total_s={round(time.time() - t_all, 1)} → {man_path}")


if __name__ == "__main__":
    main()
