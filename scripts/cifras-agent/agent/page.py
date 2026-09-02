"""Página de hinário: render colorido, camada de texto com caixas, calha, ordem de leitura, cabeçalhos."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

HEADER_RE = re.compile(r"^\s*(\d{1,4})\s*[-–—]+\s*(\S.*?)\s*$")
TONALIDADE_RE = re.compile(r"tonalidade", re.I)
META_RE = re.compile(r"^\s*(tonalidade|ritmo|instrumentos|introdu[cç][aã]o|final|fim|\(|le[ti]\.|\d{2,5}\s*\()|\bm[uú]s\.|\ble[ti]\.", re.I)
SECTION_RE = re.compile(r"^\s*(coro|refr[aã]o|estribilho|ponte|bridge|verso\s*\d*|intro)\s*[:.]?\s*(\(.*\))?\s*$", re.I)
PAGE_NUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_text(s: str) -> str:
    s = strip_accents(s).lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@dataclass
class Char:
    c: str
    x0: float
    x1: float


@dataclass
class Line:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    chars: list[Char]
    size: float
    col: str = "?"          # left | right | full
    role: str = "body"      # body | header | meta | running | footer
    hymn: Optional[str] = None

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def h(self) -> float:
        return self.y1 - self.y0


@dataclass
class Header:
    number: str
    title: str
    line: Line
    confirmed: bool  # tem Tonalidade logo abaixo ou número está no catálogo


@dataclass
class Page:
    pdf: str
    page_no: int
    width: float
    height: float
    dpi: int
    img: Image.Image
    lines: list[Line]
    gutter: float = 0.0
    columns: int = 2
    headers: list[Header] = field(default_factory=list)

    @property
    def scale(self) -> float:
        return self.dpi / 72.0

    def px(self, v: float) -> int:
        return int(round(v * self.scale))

    def reading_order(self) -> list[Line]:
        order = {"left": 0, "right": 1, "full": 2}
        body = [l for l in self.lines if l.role in ("body", "header", "meta", "section") and l.col != "full"]
        return sorted(body, key=lambda l: (order[l.col], l.y0, l.x0))

    def line_height(self) -> float:
        hs = sorted(l.h for l in self.lines if l.role == "body" and 4 < l.h < 30)
        return hs[len(hs) // 2] if hs else 11.0


def _text_lines(page: fitz.Page) -> list[Line]:
    out: list[Line] = []
    d = page.get_text("rawdict")
    for b in d["blocks"]:
        for l in b.get("lines", []):
            chars: list[Char] = []
            sizes: list[float] = []
            for s in l["spans"]:
                for ch in s["chars"]:
                    chars.append(Char(ch["c"], ch["bbox"][0], ch["bbox"][2]))
                if s["chars"]:
                    sizes.append(s["size"])
            text = "".join(c.c for c in chars)
            if not text.strip():
                continue
            x0, y0, x1, y1 = l["bbox"]
            # caixa da linha pode ser inflada por glifos gigantes (barras lidas como texto): usa os chars normais
            small = [ch for s in l["spans"] if s["size"] < 20 for ch in s["chars"]]
            if small:
                y0 = min(ch["bbox"][1] for ch in small)
                y1 = max(ch["bbox"][3] for ch in small)
            size = sorted(sizes)[len(sizes) // 2] if sizes else 8.0
            out.append(Line(text, x0, y0, x1, y1, chars, size))
    out.sort(key=lambda l: (l.y0, l.x0))
    return out


def _ink_profile(img: Image.Image, y_frac=(0.08, 0.92)) -> np.ndarray:
    a = np.asarray(img.convert("L"))
    h = a.shape[0]
    band = a[int(h * y_frac[0]): int(h * y_frac[1]), :]
    return (band < 128).sum(axis=0).astype(float)


def find_gutter(width: float, height: float, lines: list[Line], img: Image.Image, scale: float) -> tuple[float, int]:
    """Calha = x que menos linhas de texto atravessam; desempate pelo vale de tinta."""
    prof = _ink_profile(img)
    body = [l for l in lines if 0.05 * height < l.y0 < 0.95 * height and l.h < 30]
    best = None
    for x in np.arange(0.36 * width, 0.64 * width, 1.0):
        straddle = sum(1 for l in body if l.x0 < x - 3 and l.x1 > x + 3)
        px = min(int(x * scale), prof.shape[0] - 1)
        ink = prof[max(0, px - 2): px + 3].mean()
        score = straddle * 1e6 + ink
        if best is None or score < best[0]:
            best = (score, float(x), straddle)
    assert best is not None
    _, gx, straddle = best
    # página de coluna única: muitas linhas atravessam qualquer x central
    columns = 1 if straddle > 0.25 * max(1, len(body)) else 2
    return gx, columns


def _assign_columns(page: Page) -> None:
    for l in page.lines:
        if page.columns == 1:
            l.col = "left"
        elif l.x0 < page.gutter - 3 and l.x1 > page.gutter + 3 and (l.x1 - l.x0) > 0.4 * page.width:
            l.col = "full"
        else:
            l.col = "left" if l.xc < page.gutter else "right"


def _merge_same_baseline(page: Page) -> None:
    """OCR quebra uma linha visual em duas quando há um espaço largo; junta as que dividem a mesma base e coluna."""
    lh = page.line_height()
    by_col: dict[str, list[Line]] = {}
    for l in page.lines:
        by_col.setdefault(l.col, []).append(l)
    merged: list[Line] = []
    for col, ls in by_col.items():
        ls.sort(key=lambda l: (l.y0, l.x0))
        cur: Optional[Line] = None
        for l in ls:
            if cur is not None and col != "full" and abs(cur.yc - l.yc) < 0.35 * lh and l.x0 >= cur.x1 - 2 and abs(cur.size - l.size) < 3:
                gap = " " if not cur.text.endswith(" ") else ""
                cur.text = cur.text.rstrip() + " " + l.text
                if gap:
                    cur.chars.append(Char(" ", cur.x1, l.x0))
                cur.chars.extend(l.chars)
                cur.x1, cur.y0, cur.y1 = max(cur.x1, l.x1), min(cur.y0, l.y0), max(cur.y1, l.y1)
            else:
                if cur is not None:
                    merged.append(cur)
                cur = l
        if cur is not None:
            merged.append(cur)
    merged.sort(key=lambda l: (l.y0, l.x0))
    page.lines = merged


def _mark_running_and_footer(page: Page) -> None:
    H = page.height
    for l in page.lines:
        if l.y1 < 0.035 * H:
            l.role = "running"
        elif l.y0 > 0.945 * H and PAGE_NUMBER_RE.match(l.text):
            l.role = "footer"
        elif l.role == "body" and SECTION_RE.match(l.text):
            l.role = "section"
        elif l.role == "body" and META_RE.match(l.text):
            l.role = "meta"


def _find_headers(page: Page, expected: Optional[set[str]]) -> list[Header]:
    order = page.reading_order()
    headers: list[Header] = []
    for i, l in enumerate(order):
        m = HEADER_RE.match(l.text)
        if not m:
            continue
        number, title = m.group(1), m.group(2)
        if len(re.sub(r"[^A-Za-zÀ-ú]", "", title)) < 3:
            continue
        # OCR às vezes cola o acorde da coluna vizinha no fim do título
        title = re.sub(r"\s+[A-G](#|b)?m?7?\s*$", "", title).strip()
        nxt = order[i + 1: i + 6]
        has_ton = any(TONALIDADE_RE.search(n.text) for n in nxt)
        in_cat = expected is not None and number in expected
        if expected is not None and not in_cat and not has_ton:
            continue
        headers.append(Header(number, title, l, confirmed=has_ton or in_cat))
    # de-dup por número: fica o confirmado / o primeiro
    seen: dict[str, Header] = {}
    for h in headers:
        if h.number not in seen or (h.confirmed and not seen[h.number].confirmed):
            seen[h.number] = h
    hs = list(seen.values())
    hs.sort(key=lambda h: ({"left": 0, "right": 1}[h.line.col], h.line.y0))
    for h in hs:
        h.line.role = "header"
    return hs


def load_page(pdf: str, page_no: int = 0, dpi: int = 200, expected_numbers: Optional[set[str]] = None) -> Page:
    doc = fitz.open(pdf)
    p = doc[page_no]
    pix = p.get_pixmap(dpi=dpi, alpha=False)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    lines = _text_lines(p)
    page = Page(pdf, page_no, p.rect.width, p.rect.height, dpi, img, lines)
    page.gutter, page.columns = find_gutter(page.width, page.height, lines, img, page.scale)
    _assign_columns(page)
    _merge_same_baseline(page)
    _mark_running_and_footer(page)
    page.headers = _find_headers(page, expected_numbers)
    return page
