#!/usr/bin/env python3
"""PDF → enhanced PNG(s); optional left/right column split."""
from __future__ import annotations

from pathlib import Path

import fitz
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def render_pages(pdf_path: Path, dpi: float = 350) -> list[Image.Image]:
    doc = fitz.open(pdf_path)
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pages = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        pages.append(img)
    doc.close()
    return pages


def enhance(img: Image.Image, contrast: float = 1.4, sharp: float = 2.0) -> Image.Image:
    g = ImageOps.grayscale(img)
    g = ImageOps.autocontrast(g, cutoff=1)
    g = ImageEnhance.Contrast(g).enhance(contrast)
    g = g.filter(ImageFilter.UnsharpMask(radius=1.5, percent=int(150 * sharp / 2), threshold=2))
    # binary-ish for OCR without destroying thin stems
    g = ImageEnhance.Sharpness(g).enhance(1.3)
    return g.convert("RGB")


def find_gutter_x(img: Image.Image, *, search: float = 0.22) -> int:
    """X of lightest vertical band near page center (column gutter)."""
    g = ImageOps.grayscale(img)
    w, h = g.size
    # sample mid vertical band to ignore headers/footers
    y0, y1 = int(h * 0.12), int(h * 0.88)
    x0, x1 = int(w * (0.5 - search)), int(w * (0.5 + search))
    pixels = g.load()
    best_x, best_ink = w // 2, 10**18
    # step 2px for speed
    for x in range(x0, x1, 2):
        ink = 0
        for y in range(y0, y1, 3):
            # darker = more ink
            ink += 255 - pixels[x, y]
        if ink < best_ink:
            best_ink = ink
            best_x = x
    return best_x


def split_columns(img: Image.Image, gap: float = 0.02) -> tuple[Image.Image, Image.Image]:
    w, h = img.size
    mid = find_gutter_x(img)
    g = int(w * gap)
    left = img.crop((0, 0, min(w, mid + g), h))
    right = img.crop((max(0, mid - g), 0, w, h))
    return left, right


def preprocess_pdf(
    pdf_path: Path,
    out_dir: Path,
    *,
    dpi: float = 350,
    split: bool = True,
) -> list[dict]:
    """Write enhanced PNGs. Returns list of {path, page, column}."""
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for pi, page in enumerate(render_pages(pdf_path, dpi=dpi)):
        enh = enhance(page)
        if split:
            left, right = split_columns(enh)
            for col, im in (("left", left), ("right", right)):
                p = out_dir / f"p{pi:02d}_{col}.png"
                im.save(p, "PNG")
                results.append({"path": p, "page": pi, "column": col})
        else:
            p = out_dir / f"p{pi:02d}_full.png"
            enh.save(p, "PNG")
            results.append({"path": p, "page": pi, "column": "full"})
    return results


if __name__ == "__main__":
    import sys

    pdf = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else pdf.with_suffix("") / "_pre"
    for r in preprocess_pdf(pdf, out):
        print(r["path"])
