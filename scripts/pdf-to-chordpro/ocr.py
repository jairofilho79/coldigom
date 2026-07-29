#!/usr/bin/env python3
"""OCR enhanced PNGs with tesseract (TSV for positions)."""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class OcrWord:
    text: str
    conf: float
    left: int
    top: int
    width: int
    height: int
    line_num: int
    block_num: int


@dataclass
class OcrResult:
    text: str
    words: list[OcrWord] = field(default_factory=list)
    source: Path | None = None
    page: int = 0
    column: str = "full"


def _lang() -> str:
    """Prefer por+eng if por installed, else eng."""
    try:
        out = subprocess.check_output(["tesseract", "--list-langs"], stderr=subprocess.STDOUT, text=True)
    except (OSError, subprocess.CalledProcessError):
        return "eng"
    langs = {ln.strip() for ln in out.splitlines()}
    if "por" in langs:
        return "por+eng"
    return "eng"


def ocr_image(png: Path, *, lang: str | None = None) -> OcrResult:
    if not shutil.which("tesseract"):
        raise RuntimeError("tesseract not found in PATH")
    lang = lang or _lang()
    # TSV for geometry
    tsv = subprocess.check_output(
        [
            "tesseract",
            str(png),
            "stdout",
            "-l",
            lang,
            "--psm",
            "6",
            "-c",
            "preserve_interword_spaces=1",
            "tsv",
        ],
        stderr=subprocess.DEVNULL,
        text=True,
    )
    words: list[OcrWord] = []
    lines_map: dict[tuple[int, int], list[OcrWord]] = {}
    for i, row in enumerate(tsv.splitlines()):
        if i == 0:
            continue
        parts = row.split("\t")
        if len(parts) < 12:
            continue
        level = parts[0]
        if level != "5":  # word
            continue
        try:
            conf = float(parts[10])
        except ValueError:
            conf = -1
        text = parts[11]
        if not text.strip():
            continue
        w = OcrWord(
            text=text,
            conf=conf,
            left=int(parts[6]),
            top=int(parts[7]),
            width=int(parts[8]),
            height=int(parts[9]),
            line_num=int(parts[4]),
            block_num=int(parts[2]),
        )
        words.append(w)
        lines_map.setdefault((w.block_num, w.line_num), []).append(w)

    line_texts = []
    for key in sorted(lines_map, key=lambda k: (lines_map[k][0].top, lines_map[k][0].left)):
        ws = sorted(lines_map[key], key=lambda x: x.left)
        line_texts.append(" ".join(x.text for x in ws))
    return OcrResult(text="\n".join(line_texts), words=words, source=png)


def ocr_many(items: list[dict], *, lang: str | None = None) -> list[OcrResult]:
    out = []
    for it in items:
        r = ocr_image(Path(it["path"]), lang=lang)
        r.page = it.get("page", 0)
        r.column = it.get("column", "full")
        out.append(r)
    return out


if __name__ == "__main__":
    import sys

    r = ocr_image(Path(sys.argv[1]))
    print(r.text)
