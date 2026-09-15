"""Tinta vermelha: máscara, componentes, barras, grupos de acorde e colchetes de repetição. Coordenadas em pt."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage


@dataclass
class Bar:
    x: float
    y0: float
    y1: float


@dataclass
class Glyphs:
    """Um grupo de glifos vermelhos na mesma linha, provavelmente um nome de acorde."""
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class Repeat:
    x: float
    y0: float
    y1: float


@dataclass
class Ink:
    bars: list[Bar]
    chords: list[Glyphs]
    repeats: list[Repeat]
    red_mask: np.ndarray  # em px


def red_mask(img: Image.Image) -> np.ndarray:
    a = np.asarray(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # vermelho cheio (acordes) ou vermelho pálido de barra fina anti-serrilhada; papel e preto ficam de fora
    strong = (r > 120) & (r - g > 55) & (r - b > 45) & (g < 150) & (b < 150)
    pale = (r > 130) & (r - g > 22) & (r - b > 12) & (g < 215)
    return strong | pale


def dark_thin_marks(img: Image.Image, scale: float, line_h_pt: float, mask_red: np.ndarray) -> list[Repeat]:
    """Traços verticais pretos e altos (colchete de 'bis'), encadeados na vertical. Coordenadas em pt."""
    lh = line_h_pt * scale
    gray = np.asarray(img.convert("L"))
    dark = (gray < 150) & ~mask_red
    lab, n = ndimage.label(dark)
    thin = []
    for sl in ndimage.find_objects(lab):
        if sl is None:
            continue
        w, h = sl[1].stop - sl[1].start, sl[0].stop - sl[0].start
        if w <= max(3, 0.2 * lh) and h >= max(2, 0.12 * lh) and h >= 1.5 * w:
            thin.append(((sl[1].start + sl[1].stop) / 2, sl[0].start, sl[0].stop))
    thin.sort()
    chains: list[list] = []
    for x, y0, y1 in thin:
        for ch in chains:
            cx = sum(c[0] for c in ch) / len(ch)
            cy0, cy1 = min(c[1] for c in ch), max(c[2] for c in ch)
            if abs(cx - x) < 0.2 * lh and y0 - cy1 < 0.8 * lh and cy0 - y1 < 0.8 * lh:
                ch.append((x, y0, y1))
                break
        else:
            chains.append([(x, y0, y1)])
    out = []
    for ch in chains:
        x = sum(c[0] for c in ch) / len(ch)
        y0, y1 = min(c[1] for c in ch), max(c[2] for c in ch)
        if y1 - y0 >= 1.5 * lh:
            out.append(Repeat(x / scale, y0 / scale, y1 / scale))
    return out


def measure(img: Image.Image, scale: float, line_h_pt: float) -> Ink:
    """Componentes da máscara vermelha, sem fechamento morfológico (que grudava barra em acorde vizinho).

    Fragmentos finos alinhados na vertical (barra pontilhada) são encadeados; a altura da cadeia decide
    se é barra (≥ 0.45 lh), colchete de repetição (≥ 1.6 lh) ou nada.
    """
    mask = red_mask(img)
    lh = line_h_pt * scale  # px
    lab, n = ndimage.label(mask)
    objs = ndimage.find_objects(lab)
    thin: list[tuple[float, float, float, float]] = []   # px: x0,y0,x1,y1
    fat: list[tuple[float, float, float, float]] = []
    for sl in objs:
        if sl is None:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        area = int((mask[sl] & (lab[sl] > 0)).sum())
        if area < 3:
            continue
        if (x1 - x0) <= max(4, 0.28 * lh) and (y1 - y0) >= 2.5 * (x1 - x0):
            thin.append((x0, y0, x1, y1))
        else:
            fat.append((x0, y0, x1, y1))
    # encadeia fragmentos finos alinhados
    thin.sort(key=lambda b: ((b[0] + b[2]) / 2, b[1]))
    chains: list[list[tuple[float, float, float, float]]] = []
    for b in thin:
        bx = (b[0] + b[2]) / 2
        placed = False
        for ch in chains:
            cx = sum((c[0] + c[2]) / 2 for c in ch) / len(ch)
            cy0, cy1 = min(c[1] for c in ch), max(c[3] for c in ch)
            if abs(cx - bx) < 0.15 * lh and (b[1] - cy1 < 0.35 * lh and cy0 - b[3] < 0.35 * lh):
                ch.append(b)
                placed = True
                break
        if not placed:
            chains.append([b])
    bars: list[Bar] = []
    repeats: list[Repeat] = []
    glyph_boxes: list[tuple[float, float, float, float]] = list(fat)
    for ch in chains:
        x = sum((c[0] + c[2]) / 2 for c in ch) / len(ch)
        y0, y1 = min(c[1] for c in ch), max(c[3] for c in ch)
        h = y1 - y0
        if h >= 1.6 * lh:
            repeats.append(Repeat(x / scale, y0 / scale, y1 / scale))
        elif h >= 0.45 * lh:
            bars.append(Bar(x / scale, y0 / scale, y1 / scale))
        else:
            for c in ch:
                glyph_boxes.append(c)
    glyph_boxes = [(a / scale, b / scale, c / scale, d / scale) for a, b, c, d in glyph_boxes]
    # fragmento minúsculo colado a uma barra não é glifo
    def near_bar(b):
        bx0, by0, bx1, by1 = b
        return (bx1 - bx0) < 0.25 * line_h_pt and any(
            abs(bar.x - (bx0 + bx1) / 2) < 0.2 * line_h_pt and min(bar.y1, by1) - max(bar.y0, by0) > -0.3 * line_h_pt for bar in bars)
    glyph_boxes = [b for b in glyph_boxes if not near_bar(b)]
    chords = _group_glyphs(glyph_boxes, line_h_pt)
    bars = _merge_bars(bars, line_h_pt)
    bars.sort(key=lambda b: (b.y0, b.x))
    repeats += dark_thin_marks(img, scale, line_h_pt, mask)
    return Ink(bars, chords, repeats, mask)


def _group_glyphs(boxes: list[tuple[float, float, float, float]], lh: float) -> list[Glyphs]:
    """Junta letras vizinhas na mesma linha em um nome de acorde (gap < 0.45 lh)."""
    boxes = sorted(boxes, key=lambda b: (b[1], b[0]))
    groups: list[Glyphs] = []
    for x0, y0, x1, y1 in boxes:
        yc = (y0 + y1) / 2
        merged = False
        for g in groups:
            # mesma linha se os centros estão próximos OU se há sobreposição vertical (sobrescrito: E7, Dsus4)
            v_overlap = min(g.y1, y1) - max(g.y0, y0)
            same_row = abs(g.yc - yc) < 0.45 * lh or v_overlap > 0.25 * min(g.y1 - g.y0, y1 - y0, lh)
            gap = max(x0 - g.x1, g.x0 - x1)  # distância entre intervalos (negativa se sobrepõem)
            if same_row and gap < 0.45 * lh:
                g.x0, g.y0, g.x1, g.y1 = min(g.x0, x0), min(g.y0, y0), max(g.x1, x1), max(g.y1, y1)
                merged = True
                break
        if not merged:
            groups.append(Glyphs(x0, y0, x1, y1))
    # segunda passada: grupos que ficaram adjacentes após crescer
    groups.sort(key=lambda g: (g.yc, g.x0))
    out: list[Glyphs] = []
    for g in groups:
        if out and (abs(out[-1].yc - g.yc) < 0.45 * lh or min(out[-1].y1, g.y1) - max(out[-1].y0, g.y0) > 0.25 * lh) and max(g.x0 - out[-1].x1, out[-1].x0 - g.x1) < 0.45 * lh:
            o = out[-1]
            o.x0, o.y0, o.x1, o.y1 = min(o.x0, g.x0), min(o.y0, g.y0), max(o.x1, g.x1), max(o.y1, g.y1)
        else:
            out.append(g)
    return [g for g in out if (g.x1 - g.x0) >= 0.2 * lh and (g.y1 - g.y0) >= 0.3 * lh]


def _merge_bars(bars: list[Bar], lh: float) -> list[Bar]:
    """Barra grossa vira duas colunas de pixels desconexas: junta barras quase coincidentes."""
    bars = sorted(bars, key=lambda b: (b.x, b.y0))
    out: list[Bar] = []
    for b in bars:
        if out:
            o = out[-1]
            if abs(o.x - b.x) < 0.2 * lh and min(o.y1, b.y1) - max(o.y0, b.y0) > -0.2 * lh:
                o.x = (o.x + b.x) / 2
                o.y0, o.y1 = min(o.y0, b.y0), max(o.y1, b.y1)
                continue
        out.append(Bar(b.x, b.y0, b.y1))
    return out
