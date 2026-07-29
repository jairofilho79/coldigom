#!/usr/bin/env python3
"""Crop column images per catalog song (anchor y) and re-OCR each crop."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ocr import OcrResult, OcrWord, ocr_image
from segment import (
    CatalogEntry,
    SongDraft,
    _draft_from_entry,
    _ingest_body,
    apply_meta,
    is_shared_header_line,
    line_match_score,
    line_matches_catalog,
    lines_from_ocr,
)


@dataclass
class SongCrop:
    entry: CatalogEntry
    path: Path
    page: int
    column: str
    y0: int
    y1: int
    ocr: OcrResult | None = None


def _line_top(ws: list[OcrWord]) -> int:
    return min(w.top for w in ws) if ws else 0


def find_anchors_in_column(
    ocr: OcrResult,
    entries: list[CatalogEntry],
) -> list[tuple[CatalogEntry, int, int]]:
    """Return (entry, y_top, line_idx) for best unique anchors, sorted by y."""
    lines = lines_from_ocr(ocr)
    best: dict[str, tuple[int, int, int]] = {}  # number -> (score, y, line_idx)
    for i, (text, ws) in enumerate(lines):
        if is_shared_header_line(text, entries):
            continue
        y = _line_top(ws)
        for e in entries:
            sc = line_match_score(text, e)
            if sc < 30:
                continue
            prev = best.get(e.number)
            if prev is None or sc > prev[0]:
                best[e.number] = (sc, y, i)

    # Resolve y collisions: keep higher score
    by_y: dict[int, CatalogEntry] = {}
    ranked = sorted(
        ((sc, y, e) for e in entries if e.number in best for sc, y, _i in [best[e.number]]),
        key=lambda t: -t[0],
    )
    claimed: set[str] = set()
    for sc, y, e in ranked:
        if e.number in claimed:
            continue
        # snap near-duplicate y (±8px) to same slot
        collision = next((yy for yy in by_y if abs(yy - y) < 8), None)
        if collision is not None:
            continue
        by_y[y] = e
        claimed.add(e.number)

    return [(e, y, best[e.number][2]) for y, e in sorted(by_y.items(), key=lambda t: t[0])]


def crop_column_songs(
    column_png: Path,
    ocr: OcrResult,
    entries: list[CatalogEntry],
    out_dir: Path,
    *,
    pad_top: int = 28,
    pad_bottom: int = 12,
) -> list[SongCrop]:
    """Cut column image into one PNG per catalog entry using OCR anchor ys."""
    if not entries or not column_png.exists():
        return []

    from PIL import Image

    img = Image.open(column_png)
    w, h = img.size
    anchors = find_anchors_in_column(ocr, entries)

    # Drop trailing anchor on last ~2% of page (title-only at bottom)
    if len(anchors) >= 2 and anchors[-1][1] >= int(h * 0.96):
        anchors = anchors[:-1]

    out_dir.mkdir(parents=True, exist_ok=True)
    crops: list[SongCrop] = []

    if len(anchors) >= 2 or (len(anchors) == 1 and len(entries) == 1):
        for i, (entry, y, _li) in enumerate(anchors):
            y0 = max(0, y - pad_top)
            if i + 1 < len(anchors):
                y1 = max(y0 + 40, anchors[i + 1][1] - pad_bottom)
            else:
                y1 = h
            # skip tiny slivers
            if y1 - y0 < 40:
                continue
            crop_img = img.crop((0, y0, w, y1))
            path = out_dir / f"crop_p{ocr.page:02d}_{ocr.column}_{entry.number}.png"
            crop_img.save(path, "PNG")
            crops.append(
                SongCrop(
                    entry=entry,
                    path=path,
                    page=ocr.page,
                    column=ocr.column,
                    y0=y0,
                    y1=y1,
                )
            )
        # Missing entries: equal vertical split of column
        have = {c.entry.number for c in crops}
        missing = [e for e in entries if e.number not in have]
        if missing and not crops:
            return _equal_split_crops(img, entries, ocr, out_dir)
        if missing and crops:
            # equal-split leftover isn't trivial; stub via equal split of full column for missing only
            pass
        return _order_crops(crops, entries)

    # Few anchors → equal vertical split among entries
    return _equal_split_crops(img, entries, ocr, out_dir)


def _equal_split_crops(
    img,
    entries: list[CatalogEntry],
    ocr: OcrResult,
    out_dir: Path,
) -> list[SongCrop]:
    w, h = img.size
    n = len(entries)
    chunk = h // n
    crops = []
    for i, e in enumerate(entries):
        y0 = i * chunk
        y1 = h if i == n - 1 else (i + 1) * chunk
        path = out_dir / f"crop_p{ocr.page:02d}_{ocr.column}_{e.number}.png"
        img.crop((0, y0, w, y1)).save(path, "PNG")
        crops.append(SongCrop(entry=e, path=path, page=ocr.page, column=ocr.column, y0=y0, y1=y1))
    return crops


def _order_crops(crops: list[SongCrop], entries: list[CatalogEntry]) -> list[SongCrop]:
    order = {e.number: i for i, e in enumerate(entries)}
    return sorted(crops, key=lambda c: order.get(c.entry.number, 999))


def reocr_crops(crops: list[SongCrop], *, lang: str | None = None) -> list[SongCrop]:
    for c in crops:
        r = ocr_image(c.path, lang=lang)
        r.page = c.page
        r.column = c.column
        c.ocr = r
    return crops


def songs_from_crops(crops: list[SongCrop]) -> list[SongDraft]:
    """Each crop is already one song — ingest OCR body with catalog metadata."""
    songs: list[SongDraft] = []
    for c in crops:
        if not c.ocr:
            continue
        draft = _draft_from_entry(c.entry, column=c.column, page=c.page)
        for text, ws in lines_from_ocr(c.ocr):
            if line_matches_catalog(text, c.entry):
                continue
            if is_shared_header_line(text, [c.entry]):
                apply_meta(draft, text)
                continue
            _ingest_body(draft, text, ws)
        songs.append(draft)
    return songs


def build_cropped_songs(
    images: list[dict],
    ocrs: list[OcrResult],
    catalog: list[CatalogEntry],
    crop_dir: Path,
) -> tuple[list[SongDraft], list[SongCrop]]:
    """Pass-1 OCR → crop per song → re-OCR → SongDrafts. Returns (songs, crops)."""
    if not catalog:
        return [], []

    by_key: dict[tuple[int, str], tuple[dict, OcrResult]] = {}
    for im, o in zip(images, ocrs):
        by_key[(im["page"], im["column"])] = (im, o)

    has_sides = any(e.side in ("left", "right") for e in catalog)
    all_crops: list[SongCrop] = []

    if has_sides:
        for side in ("left", "right"):
            entries = [e for e in catalog if e.side == side]
            if not entries:
                continue
            # Use first page column image for this side (typical 1-page charts)
            for page in sorted({im["page"] for im in images}):
                pair = by_key.get((page, side))
                if not pair:
                    continue
                im, o = pair
                crops = crop_column_songs(Path(im["path"]), o, entries, crop_dir)
                reocr_crops(crops)
                all_crops.extend(crops)
                break  # one page per side for now
    else:
        # full-page / no sides: treat as one column stream on left or full
        for page in sorted({im["page"] for im in images}):
            for col in ("full", "left"):
                pair = by_key.get((page, col))
                if pair:
                    im, o = pair
                    crops = crop_column_songs(Path(im["path"]), o, catalog, crop_dir)
                    reocr_crops(crops)
                    all_crops.extend(crops)
                    break

    # Ensure catalog order / fill missing stubs
    have = {c.entry.number for c in all_crops}
    songs = songs_from_crops(all_crops)
    for e in catalog:
        if e.number not in have:
            stub = _draft_from_entry(e)
            stub.body_lines.append("{comment: needs_review — crop não gerado}")
            stub.word_lines.append([])
            songs.append(stub)
    order = {e.number: i for i, e in enumerate(catalog)}
    songs.sort(key=lambda s: order.get(s.number, 999))
    return songs, all_crops
