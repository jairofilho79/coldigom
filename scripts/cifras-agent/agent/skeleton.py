"""Esqueleto de um louvor: por linha de letra, texto limpo, barras como posição de caractere, acordes acima.

Tudo medido: a tinta define quantas barras e quantos acordes há; a camada de texto dá nomes e letras.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np

from .acervo import looks_like_category
from .chords import is_chord, normalize
from .crop import HymnRegion
from .ink import Bar, Glyphs, Ink
from .page import Line, Page, META_RE

BAR_LIKE = set("|lIijJ[]!1¦ǀ")


@dataclass
class ChordMark:
    name: str          # nome validado, ou "?" quando ilegível
    raw: str           # o que a camada de texto dizia
    x: float           # pt, borda esquerda do glifo
    pos: int           # posição de caractere na linha de letra (0..len)
    bar: Optional[int] # índice da barra a que está colado, ou None (solto)


@dataclass
class LyricLine:
    idx: int
    text: str                       # letra sem as barras
    raw: str                        # texto original da camada de texto
    bars: list[int]                 # posições de caractere (antes de qual char)
    chords: list[ChordMark]
    y0: float
    y1: float
    kind: str = "lyric"             # lyric | chords_only | inline (Instrumentos:/Final:)
    repeat: bool = False            # está dentro de um colchete de repetição
    notes: list[str] = field(default_factory=list)


@dataclass
class Skeleton:
    number: str
    title: str
    lines: list[LyricLine]
    unassigned_chords: int
    unassigned_bars: int
    repeats: int

    def as_dict(self) -> dict:
        return {"number": self.number, "title": self.title, "lines": [asdict(l) for l in self.lines],
                "unassigned_chords": self.unassigned_chords, "unassigned_bars": self.unassigned_bars, "repeats": self.repeats}


def _red_fraction(page: Page, ink: Ink, l: Line) -> float:
    """Fração da tinta da linha que é vermelha: alto → linha de acorde."""
    x0, y0, x1, y1 = page.px(l.x0), page.px(l.y0), page.px(l.x1), page.px(l.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    red = ink.red_mask[y0:y1, x0:x1]
    gray = np.asarray(page.img.convert("L"))[y0:y1, x0:x1] < 128
    total = int(gray.sum()) + int(red.sum())
    return float(red.sum()) / total if total else 0.0


def _char_pos(l: Line, x: float, cleaned_idx: list[int]) -> int:
    """Posição de caractere (na string limpa) onde cai um x: o char em cujos primeiros 45% a barra cai, senão o próximo."""
    chars = l.chars
    if not cleaned_idx:
        return 0
    for ci, oi in enumerate(cleaned_idx):
        c = chars[oi]
        if c.c.isspace():
            continue
        w = max(c.x1 - c.x0, 0.5)
        if x < c.x0 + 0.45 * w:
            return ci
    return len(cleaned_idx)


def _clean_line(l: Line, bars: list[Bar], lh: float) -> tuple[str, list[int]]:
    """Remove da camada de texto o char que o OCR inventou para a barra ('|', 'l', 'I', 'J'...): no máximo um por barra."""
    drop: set[int] = set()
    for b in bars:
        best, bi = 0.18 * lh, -1
        for i, c in enumerate(l.chars):
            if c.c not in BAR_LIKE or i in drop:
                continue
            # o char inventado começa na barra (ou é um traço estreito centrado nela)
            d = abs(b.x - c.x0)
            if (c.x1 - c.x0) < 0.3 * lh:
                d = min(d, abs(b.x - (c.x0 + c.x1) / 2))
            if d < best:
                best, bi = d, i
        if bi >= 0:
            drop.add(bi)
    keep = [i for i in range(len(l.chars)) if i not in drop]
    out_idx: list[int] = []
    out: list[str] = []
    prev_space = False
    for i in keep:
        ch = l.chars[i].c
        if ch.isspace():
            if prev_space or not out:
                continue
            prev_space = True
            out.append(" ")
        else:
            prev_space = False
            out.append(ch)
        out_idx.append(i)
    while out and out[-1] == " ":
        out.pop(); out_idx.pop()
    return "".join(out), out_idx


def _chord_words_over(chord_lines: list[Line], g: Glyphs, lh: float) -> list[tuple[str, float, float]]:
    """Palavras (texto, x0, x1) da camada de texto que cobrem o grupo de glifos, na ordem de x."""
    best: list[tuple[str, float, float]] = []
    for cl in chord_lines:
        if abs(cl.yc - g.yc) > 0.6 * lh:
            continue
        words: list[tuple[str, float, float]] = []
        cur: list = []
        for c in cl.chars:
            if c.c.isspace() or c.c == ",":
                if cur:
                    words.append(("".join(x.c for x in cur), cur[0].x0, cur[-1].x1))
                    cur = []
            else:
                cur.append(c)
        if cur:
            words.append(("".join(x.c for x in cur), cur[0].x0, cur[-1].x1))
        over = [w for w in words if min(w[2], g.x1) - max(w[1], g.x0) > 0.3 * min(w[2] - w[1], g.x1 - g.x0)]
        if len(over) > len(best) or (len(over) == len(best) and sum(len(w[0]) for w in over) > sum(len(w[0]) for w in best)):
            best = over
    return sorted(best, key=lambda w: w[1])


def _chord_name_from_text(page: Page, chord_lines: list[Line], g: Glyphs, lh: float) -> str:
    ws = _chord_words_over(chord_lines, g, lh)
    return " ".join(w[0] for w in ws)


BIS_RE = re.compile(r"^[\s\d|!\[\]l]*bis\.?\s*$", re.I)


def _band_bars(page: Page, l: Line, lh: float) -> list[Bar]:
    """Barras que a máscara global perdeu: corrida vertical avermelhada dentro da faixa da própria linha de letra."""
    s = page.scale
    a = np.asarray(page.img).astype(int)
    y0, y1 = int((l.y0 - 0.1 * lh) * s), int((l.y1 + 0.1 * lh) * s)
    x0, x1 = int(l.x0 * s), int(l.x1 * s)
    if y1 <= y0 or x1 <= x0:
        return []
    sub = a[y0:y1, x0:x1]
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    reddish = (r - g > 18) & (r - b > 10) & (r > 120)
    h = y1 - y0
    # maior corrida vertical por coluna
    runs = np.zeros(reddish.shape[1], dtype=int)
    cur = np.zeros(reddish.shape[1], dtype=int)
    for row in reddish:
        cur = np.where(row, cur + 1, 0)
        runs = np.maximum(runs, cur)
    cols = runs >= 0.3 * lh * s
    out: list[Bar] = []
    i = 0
    while i < len(cols):
        if cols[i]:
            j = i
            while j < len(cols) and cols[j]:
                j += 1
            if j - i <= max(4, 0.3 * lh * s):
                out.append(Bar((x0 + (i + j) / 2) / s, l.y0, l.y1))
            i = j
        else:
            i += 1
    return out


def build(page: Page, region: HymnRegion, ink: Ink) -> Skeleton:
    lh = page.line_height()
    body = [l for l in region.lines if l.role in ("body", "meta", "section")]
    # classifica linhas de acorde pela tinta
    def _all_chord_tokens(l: Line) -> bool:
        toks = [t for t in re.split(r"[\s,]+", l.text) if t.strip()]
        good = [t for t in toks if is_chord(normalize(t))]
        return bool(toks) and len(good) >= max(1, len(toks) - 1) and not any(len(t) > 8 for t in toks)
    chord_lines = [l for l in body if l.role == "body" and (_red_fraction(page, ink, l) > 0.5 or _all_chord_tokens(l))]
    chord_ids = {id(l) for l in chord_lines}
    INLINE_RE = re.compile(r"^\s*(instrumentos|introdu[cç][aã]o|final|fim)\s*:?\s*(.*)$", re.I)

    def is_inline(l: Line) -> bool:
        m = INLINE_RE.match(l.text)
        if not m:
            return False
        rest = m.group(2).strip()
        toks = [t for t in re.split(r"[,\s]+", rest) if t]
        if not toks:
            return True
        chordish = sum(1 for t in toks if is_chord(normalize(t)))
        return chordish >= 0.4 * len(toks) or _red_fraction(page, ink, l) > 0.3

    lyric = [l for l in body if id(l) not in chord_ids and (l.role in ("body", "section") or INLINE_RE.match(l.text))]
    lyric = [l for l in lyric if len(re.sub(r"[^A-Za-zÀ-ú]", "", l.text)) >= 2]
    lyric = [l for l in lyric if not looks_like_category(l.text)]
    bis_lines = [l for l in lyric if BIS_RE.match(l.text)]
    lyric = [l for l in lyric if not BIS_RE.match(l.text)]

    # tinta dentro dos retângulos do louvor
    def inside(x: float, y: float) -> bool:
        return any(r.x0 <= x <= r.x1 and r.y0 <= y <= r.y1 for r in region.rects)

    def rect_of(l: Line):
        for r in region.rects:
            if r.col == l.col:
                return r
        return region.rects[0]
    bars = [b for b in ink.bars if inside(b.x, (b.y0 + b.y1) / 2)]
    glyphs = [g for g in ink.chords if inside((g.x0 + g.x1) / 2, g.yc)]
    repeats = [r for r in ink.repeats if inside(r.x, (r.y0 + r.y1) / 2)]
    # colchete de repetição: traço à direita do fim do texto de alguma linha de letra, e não em cima de letra
    def l_col(r) -> str:
        return "left" if page.columns == 1 or r.x < page.gutter else "right"

    def right_of_text(r) -> bool:
        for l in lyric:
            if l.y0 - 0.3 * lh <= (r.y0 + r.y1) / 2 <= l.y1 + 0.3 * lh or (r.y0 < l.y1 and r.y1 > l.y0):
                te = max((c.x1 for c in l.chars if not c.c.isspace()), default=l.x1)
                if r.x > te + 0.3 * lh:
                    return True
        return False
    repeats = [r for r in repeats if right_of_text(r) and (r.y1 - r.y0) >= 0.7 * lh
               and any(b.col == l_col(r) and r.y0 - 1.2 * lh <= b.yc <= r.y1 + 1.2 * lh for b in bis_lines)]

    used_bars: set[int] = set()
    used_glyphs: set[int] = set()
    out: list[LyricLine] = []
    prev_bottom: dict[str, float] = {}
    for idx, l in enumerate(lyric):
        if l.role == "section":
            name = re.sub(r"[\s:.]+$", "", l.text.strip())
            out.append(LyricLine(idx, name, l.text.rstrip(), [], [], round(l.y0, 1), round(l.y1, 1), kind="section"))
            continue
        inline = is_inline(l)
        # barras desta linha: centro vertical dentro da faixa da linha (com folga), x dentro do texto
        my_bars: list[tuple[int, Bar]] = []
        for bi, b in enumerate(bars):
            if bi in used_bars:
                continue
            byc = (b.y0 + b.y1) / 2
            rc = rect_of(l)
            if l.y0 - 0.25 * lh <= byc <= l.y1 + 0.25 * lh and abs(l.xc - b.x) < (l.x1 - l.x0) / 2 + 0.6 * lh and rc.x0 <= b.x <= rc.x1:
                my_bars.append((bi, b))
        # barra além do fim do texto é marca de repetição, não de sílaba
        text_end = max((c.x1 for c in l.chars if not c.c.isspace()), default=l.x1)
        rep_marks = [(bi, b) for bi, b in my_bars if b.x > text_end + 0.5 * lh]
        my_bars = [(bi, b) for bi, b in my_bars if b.x <= text_end + 0.5 * lh]
        if not inline and l.role != "section":
            for eb in _band_bars(page, l, lh):
                if eb.x <= text_end + 0.5 * lh and all(abs(eb.x - b.x) > 0.35 * lh for _, b in my_bars):
                    my_bars.append((-1, eb))
        my_bars.sort(key=lambda t: t[1].x)
        for bi, _ in my_bars + rep_marks:
            if bi >= 0:
                used_bars.add(bi)
        text, idxmap = _clean_line(l, [b for _, b in my_bars], lh)
        bar_pos = [_char_pos(l, b.x, idxmap) for _, b in my_bars]
        # acordes: glifos na faixa entre a linha de letra anterior (mesma coluna) e esta
        top = prev_bottom.get(l.col, l.y0 - 2.2 * lh)
        my_glyphs: list[tuple[int, Glyphs]] = []
        for gi, g in enumerate(glyphs):
            if gi in used_glyphs:
                continue
            if inline:
                ok = l.y0 - 0.3 * lh <= g.yc <= l.y1 + 0.3 * lh
            else:
                ok = top - 0.2 * lh <= g.yc <= l.y0 + 0.15 * lh and g.yc < l.yc
            rc = rect_of(l)
            if ok and abs(l.xc - (g.x0 + g.x1) / 2) < (l.x1 - l.x0) / 2 + 3 * lh and rc.x0 <= (g.x0 + g.x1) / 2 <= rc.x1:
                my_glyphs.append((gi, g))
        my_glyphs.sort(key=lambda t: t[1].x0)
        chords: list[ChordMark] = []
        if inline:
            for gi, _ in my_glyphs:
                used_glyphs.add(gi)
            after = l.text.split(":", 1)[1] if ":" in l.text else ""
            # continuação: linhas só de acorde imediatamente abaixo, na mesma coluna, sem letra entre elas
            cont_text = ""
            nxt_lyrics = [x for x in lyric if x.col == l.col and x.y0 > l.y1 - 1]
            limit = min((x.y0 for x in nxt_lyrics), default=l.y1 + 3 * lh)
            for cl in sorted(chord_lines, key=lambda c: c.y0):
                if cl.col == l.col and l.y1 - 0.45 * lh < cl.y0 and cl.y1 < limit - 0.9 * lh and cl.y0 - l.y1 < 1.6 * lh:
                    cont_text += " " + cl.text
                    for gi, g in enumerate(glyphs):
                        if gi not in used_glyphs and cl.y0 - 0.3 * lh <= g.yc <= cl.y1 + 0.3 * lh:
                            used_glyphs.add(gi)
                    limit = cl.y1 + 1.6 * lh
            for tok in re.split(r"[,\s]+", after + cont_text):
                if not tok.strip():
                    continue
                n = normalize(tok)
                chords.append(ChordMark(n if is_chord(n) else "?", tok, 0.0, 0, None))
            if len(chords) != len(my_glyphs) and my_glyphs:
                pass  # o verificador compara com a contagem de glifos
            my_glyphs = []
        pieces: list[tuple[str, str, float, float]] = []  # (name, raw, x0, x1)
        last_word_key = None
        for gi, g in my_glyphs:
            used_glyphs.add(gi)
            words = _chord_words_over(chord_lines + ([l] if inline else []), g, lh)
            wkey = tuple((w, round(x0, 1)) for w, x0, _ in words)
            if words and wkey == last_word_key and pieces:
                pn, praw, px0, px1 = pieces[-1]
                pieces[-1] = (pn, praw, min(px0, g.x0), max(px1, g.x1))
                continue
            last_word_key = wkey if words else None
            valid = [(w, normalize(w), x0, x1) for w, x0, x1 in words if is_chord(normalize(w))]
            if len(valid) >= 2:
                for w, n, x0, x1 in valid:
                    pieces.append((n, w, max(x0, g.x0), min(x1, g.x1)))
            else:
                raw = " ".join(w for w, _, _ in words)
                n = normalize(raw.replace(" ", ""))
                pieces.append((n if is_chord(n) else "?", raw, g.x0, g.x1))
        # sobrescrito lido como grupo separado ('7', '9', 'sus4'): gruda no acorde imediatamente à esquerda
        merged: list[tuple[str, str, float, float]] = []
        for n, raw, x0, x1 in pieces:
            if merged and re.fullmatch(r"\d{1,2}|sus\d?|add\d?|maj7?|\(\d+\)", raw.strip()) and x0 - merged[-1][3] < 0.5 * lh:
                pn, praw, px0, px1 = merged[-1]
                cand = normalize((pn if pn != "?" else praw) + raw.strip())
                merged[-1] = (cand if is_chord(cand) else pn, praw + raw, px0, max(px1, x1))
                continue
            merged.append((n, raw, x0, x1))
        for name, raw, gx0, gx1 in merged:
            # colado se há barra sob o começo do acorde
            bar_i = None
            for k, (_, b) in enumerate(my_bars):
                if abs(b.x - gx0) < 0.7 * lh or (gx0 - 0.2 * lh <= b.x <= gx1 + 0.2 * lh):
                    if bar_i is None or abs(b.x - gx0) < abs(my_bars[bar_i][1].x - gx0):
                        bar_i = k
            pos = bar_pos[bar_i] if bar_i is not None else _char_pos(l, gx0, idxmap)
            chords.append(ChordMark(name, raw, round(gx0, 1), pos, bar_i))
        # uma barra só pode ter um acorde: se dois acordes disputam, o mais próximo fica
        owner: dict[int, int] = {}
        for ci, c in enumerate(chords):
            b = c.bar
            if b is None:
                continue
            if b not in owner:
                owner[b] = ci
                continue
            bx = my_bars[b][1].x
            prev = owner[b]
            loser = ci if abs(c.x - bx) > abs(chords[prev].x - bx) else prev
            winner = prev if loser == ci else ci
            chords[loser].bar = None
            chords[loser].pos = _char_pos(l, chords[loser].x, idxmap)
            owner[b] = winner
        in_repeat = any(min(r.y1, l.y1) - max(r.y0, l.y0) > 0.3 * lh for r in repeats) \
            or (bool(rep_marks) and any(abs(b.yc - l.yc) < 2.5 * lh and b.col == l.col for b in bis_lines))
        ll = LyricLine(idx, text, l.text.rstrip(), bar_pos, chords, round(l.y0, 1), round(l.y1, 1),
                       kind="inline" if inline else "lyric", repeat=in_repeat)
        if rep_marks:
            ll.notes.append("marca de repetição à direita")
        out.append(ll)
        prev_bottom[l.col] = l.y1
    return Skeleton(region.number, region.title, out, len(glyphs) - len(used_glyphs), len(bars) - len(used_bars), len(repeats))


def weave_line(l: LyricLine) -> str:
    """Tece a linha ChordPro a partir das posições medidas: colado na barra, solto entre espaços."""
    if l.kind == "section":
        return "{comment: " + l.text + "}"
    if l.kind == "inline":
        head = l.text.split(":", 1)[0] + ":" if ":" in l.text else l.text
        return head + " " + " ".join("[" + c.name + "]" for c in l.chords)
    text = l.text
    marks = sorted(l.chords, key=lambda c: (c.pos, c.x), reverse=True)
    for c in marks:
        tok = "[" + c.name + "]"
        pos = min(max(c.pos, 0), len(text))
        if c.bar is not None:
            # colado: antes do char da barra, sem espaço à direita; espaço à esquerda só se não havia
            text = text[:pos] + tok + text[pos:]
        else:
            left = text[:pos].rstrip()
            right = text[pos:].lstrip()
            if right and not re.search(r"[A-Za-zÀ-ú0-9]", right):
                left, right = (left + right).rstrip(), ""
            if not left:
                text = tok + " " + right
            elif not right:
                text = left + " " + tok
            else:
                text = left + " " + tok + " " + right
    return text


def weave(sk: Skeleton, header: list[str]) -> str:
    out = list(header) + [""]
    prev_kind = None
    prev_y1 = None
    for l in sk.lines:
        # estrofe nova quando o salto vertical é maior que 1.6 linhas
        if prev_y1 is not None and l.kind != "section" and l.y0 - prev_y1 > 1.6 * max(1.0, (l.y1 - l.y0)) and out and out[-1] != "":
            out.append("")
        if l.kind == "section" and out and out[-1] != "":
            out.append("")
        if l.repeat and (prev_kind is None or not prev_kind[1]):
            out.append("[*2x]")
        out.append(weave_line(l))
        prev_kind = (l.kind, l.repeat)
        prev_y1 = l.y1
    return "\n".join(out).rstrip() + "\n"


def render_text(sk: Skeleton) -> str:
    """Fac-símile em texto: linha de acordes alinhada por posição de caractere, letra com '|' nas barras."""
    lines: list[str] = []
    for l in sk.lines:
        if l.kind == "section":
            lines.append("{comment: " + l.text + "}")
            continue
        if l.kind == "inline":
            lines.append(l.text)
            continue
        # letra com barras
        t = l.text
        with_bars = ""
        last = 0
        for p in l.bars:
            with_bars += t[last:p] + "|"
            last = p
        with_bars += t[last:]
        # acordes: posição na string com barras (cada barra antes desloca 1)
        row = ""
        for c in l.chords:
            shift = sum(1 for p in l.bars if p < c.pos) + (1 if c.bar is not None else 0)
            col = c.pos + shift - (1 if c.bar is not None else 0)
            if len(row) > col:
                col = len(row) + 1
            row += " " * (col - len(row)) + c.name
        if l.chords:
            lines.append(row)
        lines.append(with_bars + ("   ← bis" if l.repeat else ""))
    return "\n".join(lines)
