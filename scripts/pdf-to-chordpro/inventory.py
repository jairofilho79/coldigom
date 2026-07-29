#!/usr/bin/env python3
"""List chord-chart PDFs from storage/assets/praises/*/metadata.yml → out/manifest.jsonl"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("need PyYAML: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

CHORD_KINDS = {
    "e2274af6-a19f-4186-93cd-e3810ce75e2c": "Cifra",
    "27e39659-b4a0-4ef2-87f4-546fe292298d": "Cifra I",
    "5a9d9ced-a5e3-4848-adac-f02a14b56038": "Cifra II",
}

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PRAISES = ROOT / "storage" / "assets" / "praises"
DEFAULT_OUT = Path(__file__).resolve().parent / "out" / "manifest.jsonl"


def iter_chord_pdfs(praises_dir: Path):
    for praise_dir in sorted(praises_dir.iterdir()):
        if not praise_dir.is_dir():
            continue
        meta_path = praise_dir / "metadata.yml"
        if not meta_path.exists():
            continue
        raw = meta_path.read_text(encoding="utf-8", errors="replace").strip()
        if not raw:
            continue
        data = yaml.safe_load(raw)
        if not isinstance(data, dict):
            continue
        mats = data.get("praise_materiais") or []
        praise_id = data.get("praise_id") or praise_dir.name
        praise_name = data.get("praise_name") or ""
        for m in mats:
            kind = str(m.get("material_kind") or "")
            if kind not in CHORD_KINDS or m.get("type") != "pdf":
                continue
            mid = m.get("praise_material_id")
            if not mid:
                continue
            pdf_path = praise_dir / f"{mid}.pdf"
            chord_ids = [
                cm.get("praise_material_id")
                for cm in mats
                if cm.get("type") == "chord"
                and cm.get("source_material_id") == mid
                and cm.get("praise_material_id")
            ]
            yield {
                "praise_id": praise_id,
                "praise_name": praise_name,
                "material_id": mid,
                "material_kind": kind,
                "kind_label": CHORD_KINDS[kind],
                "pdf_path": str(pdf_path.relative_to(ROOT)) if pdf_path.exists() else None,
                "pdf_abs": str(pdf_path),
                "pdf_exists": pdf_path.exists(),
                "chord_material_ids": chord_ids,
            }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--praises", type=Path, default=DEFAULT_PRAISES)
    ap.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = missing = 0
    with args.out.open("w", encoding="utf-8") as f:
        for row in iter_chord_pdfs(args.praises):
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
            if not row["pdf_exists"]:
                missing += 1
    print(f"wrote {n} pdfs → {args.out} (missing files: {missing})")


if __name__ == "__main__":
    main()
