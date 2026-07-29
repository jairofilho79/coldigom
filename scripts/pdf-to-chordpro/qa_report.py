#!/usr/bin/env python3
"""QA summary over chordpro_staging."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STAGING = ROOT / "storage" / "chordpro_staging"

CHORD_IN_LINE = re.compile(r"\[([^\]]+)\]")
KEY_RE = re.compile(r"\{key:\s*([^}]+)\}", re.I)
TITLE_RE = re.compile(r"\{title:\s*([^}]+)\}", re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--staging", type=Path, default=DEFAULT_STAGING)
    ap.add_argument("-o", "--out", type=Path, default=None)
    args = ap.parse_args()
    staging = args.staging
    if not staging.exists():
        print("no staging dir")
        return

    pdf_dirs = [d for d in staging.iterdir() if d.is_dir() and not d.name.startswith(".")]
    songs = 0
    with_key = 0
    titles = []
    bad_chords = Counter()
    per_pdf = []

    for d in sorted(pdf_dirs):
        cps = list(d.glob("*.chordpro"))
        src = d / "_source.json"
        info = json.loads(src.read_text()) if src.exists() else {}
        per_pdf.append({"material_id": d.name, "songs": len(cps), "praise_name": info.get("praise_name")})
        for cp in cps:
            songs += 1
            text = cp.read_text(encoding="utf-8", errors="replace")
            if KEY_RE.search(text):
                with_key += 1
            tm = TITLE_RE.search(text)
            if tm:
                titles.append(tm.group(1).strip())
            for ch in CHORD_IN_LINE.findall(text):
                if not re.match(
                    r"^(?:[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M)?\d{0,2}"
                    r"(?:/#?[A-G](?:#|b)?)?|bis|N\.?C\.?|%)$",
                    ch,
                    re.I,
                ):
                    bad_chords[ch] += 1

    report = {
        "pdf_dirs": len(pdf_dirs),
        "songs": songs,
        "with_key_pct": round(100 * with_key / songs, 1) if songs else 0,
        "songs_per_pdf": dict(Counter(p["songs"] for p in per_pdf)),
        "bad_chord_samples": bad_chords.most_common(30),
        "title_samples": titles[:40],
        "zero_song_pdfs": [p for p in per_pdf if p["songs"] == 0][:20],
    }
    out = args.out or (Path(__file__).parent / "out" / "qa_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
