"""Atribuição de linhas a louvores pela ordem de leitura; retângulos; imagem costurada; checagem pela letra canônica."""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image, ImageDraw

from .page import Line, Page, norm_text, META_RE


@dataclass
class Rect:
    col: str
    x0: float
    y0: float
    x1: float
    y1: float  # em pontos (pt)

    def as_dict(self) -> dict:
        return {"col": self.col, "x0": round(self.x0, 1), "y0": round(self.y0, 1), "x1": round(self.x1, 1), "y1": round(self.y1, 1)}


@dataclass
class HymnRegion:
    number: str
    title: str
    lines: list[Line]            # em ordem de leitura, inclui cabeçalho e metas
    rects: list[Rect]
    crosses_column: bool
    check: dict = field(default_factory=dict)


def _column_bounds(page: Page, col: str) -> tuple[float, float]:
    ls = [l for l in page.lines if l.col == col and l.role in ("body", "header", "meta", "section")]
    if page.columns == 1:
        ls = [l for l in page.lines if l.role in ("body", "header", "meta", "section")]
        return max(0.0, min(l.x0 for l in ls) - 6), min(page.width, max(l.x1 for l in ls) + 6)
    if col == "left":
        return max(0.0, min(l.x0 for l in ls) - 6), page.gutter - 2
    return page.gutter + 2, min(page.width, max(l.x1 for l in ls) + 6)


def segment_hymns(page: Page) -> list[HymnRegion]:
    """Cada louvor vai do seu cabeçalho até o cabeçalho seguinte, na ordem de leitura."""
    order = page.reading_order()
    idx = {id(h.line): h for h in page.headers}
    starts = [i for i, l in enumerate(order) if id(l) in idx]
    regions: list[HymnRegion] = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else len(order)
        lines = order[s:e]
        h = idx[id(order[s])]
        # linhas de lixo no fim (ex.: '-' solto, número de página) não puxam o retângulo
        while len(lines) > 1 and len(norm_text(lines[-1].text)) < 2:
            lines = lines[:-1]
        cols = []
        for l in lines:
            if l.col not in cols:
                cols.append(l.col)
        rects: list[Rect] = []
        pad = 0.55 * page.line_height()
        for col in cols:
            cl = [l for l in lines if l.col == col]
            x0, x1 = _column_bounds(page, col)
            y0 = min(l.y0 for l in cl) - pad
            y1 = max(l.y1 for l in cl) + pad
            # não invade o cabeçalho seguinte na mesma coluna
            nxt = [hh.line for hh in page.headers if hh.line.col == col and hh.line.y0 > cl[0].y0 + 1]
            if nxt:
                y1 = min(y1, min(n.y0 for n in nxt) - 2)
            # nem o número de página no rodapé
            foot = [f for f in page.lines if f.role == "footer" and f.col == col and f.y0 > cl[-1].y0]
            if foot:
                y1 = min(y1, min(f.y0 for f in foot) - 1)
            # uma linha de acorde pode estar logo acima do cabeçalho? não: acorde vem depois do cabeçalho.
            rects.append(Rect(col, x0, max(0.0, y0), x1, min(page.height, y1)))
        for l in lines:
            l.hymn = h.number
        regions.append(HymnRegion(h.number, h.title, lines, rects, crosses_column=len(cols) > 1))
    return regions


def stitch(page: Page, region: HymnRegion, gap_px: int = 14) -> Image.Image:
    parts = []
    for r in region.rects:
        box = (page.px(r.x0), page.px(r.y0), page.px(r.x1), page.px(r.y1))
        parts.append(page.img.crop(box))
    if len(parts) == 1:
        return parts[0]
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts) + gap_px * (len(parts) - 1)
    out = Image.new("RGB", (w, h), "white")
    y = 0
    d = ImageDraw.Draw(out)
    for i, p in enumerate(parts):
        if i:
            d.line([(0, y + gap_px // 2), (w, y + gap_px // 2)], fill=(160, 160, 160), width=2)
            y += gap_px
        out.paste(p, (0, y))
        y += p.height
    return out


def lyric_lines_of(region: HymnRegion, chord_line_ids: Optional[set[int]] = None) -> list[Line]:
    """Linhas de letra: corpo, sem cabeçalho/meta e sem linhas só de acorde (quando informado)."""
    out = []
    for l in region.lines:
        if l.role != "body":
            continue
        if chord_line_ids is not None and id(l) in chord_line_ids:
            continue
        if len(re.sub(r"[^A-Za-zÀ-ú]", "", l.text)) < 2:
            continue
        out.append(l)
    return out


def canonical_check(region_lyrics: list[str], canonical: list[str]) -> dict:
    """Quanto da letra canônica aparece no recorte, e quantas linhas do recorte não batem com nada."""
    cn = [norm_text(c) for c in canonical if norm_text(c)]
    rn = [norm_text(r) for r in region_lyrics if norm_text(r)]
    if not cn:
        return {"coverage": None, "unmatched": [], "matched": 0, "total": 0}
    matched = 0
    used: set[int] = set()
    for c in cn:
        best, bi = 0.0, -1
        for i, r in enumerate(rn):
            s = difflib.SequenceMatcher(None, c, r).ratio()
            if s > best:
                best, bi = s, i
        if best >= 0.72:
            matched += 1
            used.add(bi)
    unmatched = [region_lyrics[i] for i in range(len(rn)) if i not in used]
    # linha do recorte é "estranha" se não bate com nenhuma linha canônica nem parcialmente
    foreign = []
    for i, r in enumerate(rn):
        if i in used:
            continue
        best = max((difflib.SequenceMatcher(None, c, r).ratio() for c in cn), default=0.0)
        # linhas curtas (Coro, Final) não contam
        if best < 0.55 and len(r) >= 12:
            foreign.append(region_lyrics[i])
    return {"coverage": round(matched / len(cn), 3), "matched": matched, "total": len(cn),
            "unmatched_crop_lines": unmatched, "foreign_lines": foreign}


def overlay(page: Page, regions: list[HymnRegion]) -> Image.Image:
    img = page.img.copy()
    d = ImageDraw.Draw(img)
    colors = [(46, 204, 113), (61, 156, 240), (230, 126, 34), (155, 89, 182), (231, 76, 60)]
    for i, r in enumerate(regions):
        c = colors[i % len(colors)]
        for rc in r.rects:
            d.rectangle([page.px(rc.x0), page.px(rc.y0), page.px(rc.x1), page.px(rc.y1)], outline=c, width=4)
        d.text((page.px(r.rects[0].x0) + 6, page.px(r.rects[0].y0) + 4), r.number, fill=c)
    gx = page.px(page.gutter)
    d.line([(gx, 0), (gx, img.height)], fill=(200, 200, 200), width=1)
    return img
