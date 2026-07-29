#!/usr/bin/env python3
"""Split OCR text into songs; extract metadata lines.

Phase 1: when metadata_from_chords.yml is available, use catalog numbers/titles
as anchors so multi-song PDFs never collapse into one blob.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from ocr import OcrResult, OcrWord

# 495- TITLE / 495 - TITLE
TITLE_RE = re.compile(r"^(\d{2,4})\s*[-–—]\s*(.+)$", re.UNICODE)
# Number may be mid-line after OCR glue: "... 622 - TITLE" or "622 TITLE"
NUM_ANCHOR_RE = re.compile(r"(?<!\d)(\d{2,4})\s*[-–—]\s*(.+)$", re.UNICODE)
META_TONAL = re.compile(r"Tonalidade\s*[:;]\s*([^\s,;]+)", re.I)
META_RITMO = re.compile(r"Ritmo\s*[:;]\s*(.+?)(?:\s*$|\s{2,})", re.I)
META_INSTR = re.compile(r"^Instrumentos?\s*[:;]\s*(.*)$", re.I)
META_INTRO = re.compile(r"^Introdu[cç][aã]o\s*[:;]\s*(.*)$", re.I)
AUTHOR_RE = re.compile(r"^\(?\s*(Let\.?|M[uú]s\.?|Trad\.?).+", re.I)
SECTION_RE = re.compile(r"^(Coro|Verso\s*\d*|Ponte|Bridge|Intro|Final)\s*:?\s*$", re.I)
CATEGORY_NOISE = re.compile(
    r"^(Consolo|Encorajamento|Salmos|Volta de Jesus|Santifica|Louvor|Adora|"
    r"Levantado|Leawacdo|Santii|Final\b|Obs:|Repetir)",
    re.I,
)

CHORD_TOKEN = re.compile(
    r"^("
    r"[A-G](?:#|b)?"
    r"(?:maj|min|m|dim|aug|sus|add|M)?"
    r"(?:\d{0,2})?"
    r"(?:/#?[A-G](?:#|b)?)?"
    r"|bis|N\.?C\.?|%"
    r")$",
    re.I,
)

# Tokens that match chord-ish patterns or appear as false [Chord] in OCR
CHORD_BLACKLIST = {
    "coro",
    "final",
    "fim",
    "instrumentos",
    "instrumento",
    "introducao",
    "introdução",
    "introducão",
    "repetir",
    "tonalidade",
    "ritmo",
    "obs",
    "letra",
    "sell",
    "ati",
    "poi",
    "nos",
    "dic",
    "tod",
    "cc",
    "fe",
    "gd",
    "od",
    "cd",
}

# Portuguese function words that look like note names / short chords
PT_STOP = {
    "a",
    "e",
    "o",
    "as",
    "os",
    "em",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "um",
    "uma",
    "no",
    "na",
    "me",
    "te",
    "se",
    "eu",
    "tu",
    "ele",
    "pra",
    "pro",
    "que",
    "meu",
    "tua",
    "sua",
    "com",
    "por",
    "sem",
    "foi",
    "sou",
    "ser",
    "ter",
    "vai",
    "vem",
    "nao",
    "não",
    "ja",
    "já",
    "ao",
    "à",
    "á",
}

NOISE_TOKENS = {"|", "-", "=", ".", "..", "...", "—", "_", "•", "'", "’", "‘", "«", "»", "[", "]"}


def is_valid_chord_token(tok: str) -> bool:
    t = tok.strip().strip("[]").rstrip(",.;:")
    if not t or len(t) > 8:
        return False
    low = t.lower()
    if low in CHORD_BLACKLIST:
        return False
    if t in NOISE_TOKENS:
        return False
    # Single-letter chords only if uppercase note name (avoid "a"/"e"/"o")
    if len(t) == 1:
        return t in "ABCDEFG"
    if low in PT_STOP:
        return False
    return bool(CHORD_TOKEN.match(t))


def is_chord_line(text: str, words: list | None = None) -> bool:
    """True when the line is (mostly) chords — not mixed lyric+chord."""
    if words:
        chord_n = lyric_n = 0
        for w in words:
            t = w.text.strip()
            if not t or t in NOISE_TOKENS:
                continue
            if is_valid_chord_token(t):
                chord_n += 1
            else:
                # short all-caps-ish tokens still count as potential chords via regex
                lyric_n += 1
        if chord_n == 0:
            return False
        # pure or near-pure chord line
        return lyric_n == 0 or (chord_n >= 2 and chord_n >= 2 * lyric_n)

    toks = [t for t in text.replace("|", " ").split() if t and t not in NOISE_TOKENS]
    if not toks:
        return False
    hits = sum(1 for t in toks if is_valid_chord_token(t))
    if hits == 0:
        return False
    return hits >= max(1, int(0.75 * len(toks))) and hits >= len(toks) - 1


@dataclass
class CatalogEntry:
    number: str
    title: str
    key: str = ""
    rhythm: str = ""
    instruments: str = ""
    author: str = ""
    side: str = ""  # left | right | ""


@dataclass
class SongDraft:
    number: str = ""
    title: str = ""
    key: str = ""
    rhythm: str = ""
    artist: str = ""
    instruments: str = ""
    intro: str = ""
    column: str = ""
    page: int = 0
    body_lines: list[str] = field(default_factory=list)
    word_lines: list[list[OcrWord]] = field(default_factory=list)
    from_catalog: bool = False


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).strip()
    s = s.replace("|", " ").replace("  ", " ")
    return s.strip()


def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def load_catalog(praise_dir: Path) -> list[CatalogEntry]:
    """Load metadata_from_chords.yml if present."""
    path = praise_dir / "metadata_from_chords.yml"
    if not path.exists():
        return []
    try:
        import yaml
    except ImportError:
        return []
    data = yaml.safe_load(path.read_text(encoding="utf-8") or "") or []
    if not isinstance(data, list):
        return []
    out: list[CatalogEntry] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        num = str(row.get("praise_number") or "").strip()
        title = str(row.get("praise_name") or "").strip()
        if not num or not title:
            continue
        out.append(
            CatalogEntry(
                number=num,
                title=title,
                key=str(row.get("praise_tonality") or "").strip(),
                rhythm=str(row.get("praise_rhythm") or "").strip(),
                instruments=str(row.get("praise_instruments") or "").strip(),
                author=str(row.get("praise_author") or "").strip(),
                side=str(row.get("side") or "").strip().lower(),
            )
        )
    return out


def lines_from_ocr(ocr: OcrResult) -> list[tuple[str, list[OcrWord]]]:
    by_line: dict[tuple[int, int], list[OcrWord]] = {}
    for w in ocr.words:
        by_line.setdefault((w.block_num, w.line_num), []).append(w)
    out = []
    for key in sorted(by_line, key=lambda k: (by_line[k][0].top, by_line[k][0].left)):
        ws = sorted(by_line[key], key=lambda x: x.left)
        ws = [w for w in ws if w.text.strip() not in ("|",)]
        text = _norm(" ".join(x.text for x in ws))
        if text:
            out.append((text, ws))
    return out


def looks_like_title(num: str, title: str) -> bool:
    title = title.strip()
    if len(title) < 8:
        return False
    if re.match(r"^(Tonalidade|Ritmo|Instrument|Introdu|Coro|Final|Obs)", title, re.I):
        return False
    if not (2 <= len(num) <= 4):
        return False
    letters = sum(c.isalpha() for c in title)
    return letters >= 6


def apply_meta(cur: SongDraft, text: str) -> bool:
    """Pull tonalidade/ritmo even when glued on one OCR line. Returns True if consumed."""
    hit = False
    tm = META_TONAL.search(text)
    if tm:
        key = tm.group(1).strip(" .;")
        if re.search(r"ritmo", key, re.I):
            key = re.split(r"ritmo", key, flags=re.I)[0].strip(" :;")
        if not cur.key:
            cur.key = key
        hit = True
    rm = META_RITMO.search(text)
    if rm:
        rhythm = rm.group(1).strip(" .;")
        if re.search(r"tonalidade", rhythm, re.I):
            rhythm = ""
        elif not cur.rhythm:
            cur.rhythm = rhythm
            hit = True
        else:
            hit = True
    if META_INSTR.match(text):
        if not cur.instruments:
            cur.instruments = META_INSTR.match(text).group(1).strip()
        return True
    if META_INTRO.match(text):
        cur.intro = META_INTRO.match(text).group(1).strip()
        return True
    if hit and re.match(r"^(Tonalidade|Ritmo)", text, re.I):
        return True
    if hit and "Tonalidade" in text and "Ritmo" in text and len(text) < 80:
        return True
    return False


def line_match_score(text: str, entry: CatalogEntry) -> int:
    """Higher = better hymn-start candidate. 0 = no match."""
    if not re.search(rf"(?<!\d){re.escape(entry.number)}(?!\d)", text):
        # Title-only mid-column (no number): weaker but useful
        title_words = [w for w in _fold(entry.title).split() if len(w) >= 4]
        if len(title_words) < 3:
            return 0
        folded = _fold(text)
        hits = sum(1 for w in title_words if w in folded)
        if hits >= min(3, len(title_words)) and not is_chord_line(text) and len(text) < 80:
            return 15 + hits
        return 0

    title_words = [w for w in _fold(entry.title).split() if len(w) >= 4]
    folded = _fold(text)
    hits = sum(1 for w in title_words if w in folded) if title_words else 0

    if re.search(rf"(?<!\d){re.escape(entry.number)}\s*[-–—]", text):
        return 100 + hits * 10
    if re.match(rf"^[\W]{{0,12}}{re.escape(entry.number)}(?!\d)", text):
        return 60 + hits * 10
    if hits >= min(2, max(1, len(title_words))):
        return 30 + hits * 10
    return 5  # bare number — weak


def line_matches_catalog(text: str, entry: CatalogEntry) -> bool:
    return line_match_score(text, entry) >= 30


def is_shared_header_line(text: str, catalog: list[CatalogEntry]) -> bool:
    """Header OCR often glues several hymns; never treat as a sole song anchor."""
    nums = sum(1 for e in catalog if re.search(rf"(?<!\d){re.escape(e.number)}(?!\d)", text))
    if nums >= 2:
        return True
    if re.search(r"Tonalidade", text, re.I) and re.search(r"Ritmo", text, re.I) and nums >= 1:
        return True
    return False


def _fill_from_catalog(draft: SongDraft, entry: CatalogEntry) -> None:
    draft.number = entry.number
    draft.title = entry.title.title() if entry.title.isupper() else entry.title
    draft.from_catalog = True
    if entry.key:
        draft.key = entry.key
    if entry.rhythm:
        draft.rhythm = entry.rhythm
    if entry.instruments:
        draft.instruments = entry.instruments
    if entry.author and not draft.artist:
        draft.artist = entry.author
    if entry.side and not draft.column:
        draft.column = entry.side


def _ingest_body(cur: SongDraft, text: str, ws: list) -> None:
    if apply_meta(cur, text):
        return
    if AUTHOR_RE.match(text) or re.search(r"\(\s*Let", text, re.I):
        if not cur.artist:
            cur.artist = text.strip("()")
        return
    if re.match(r"^\d{3,5}\s*\(", text):
        am = re.search(r"\((.+)\)", text)
        if am and not cur.artist:
            cur.artist = am.group(1)
        return
    if CATEGORY_NOISE.match(text):
        return
    cur.body_lines.append(text)
    cur.word_lines.append(ws)


def segment_column(ocr: OcrResult) -> list[SongDraft]:
    songs: list[SongDraft] = []
    cur: SongDraft | None = None

    def start(num: str, title: str):
        nonlocal cur
        cur = SongDraft(
            number=num,
            title=_norm(title).rstrip(":"),
            column=ocr.column,
            page=ocr.page,
        )
        songs.append(cur)

    for text, ws in lines_from_ocr(ocr):
        m = TITLE_RE.match(text.replace("—", "-"))
        if m and looks_like_title(m.group(1), m.group(2)):
            start(m.group(1), m.group(2))
            continue
        if cur is None:
            continue
        _ingest_body(cur, text, ws)

    return [s for s in songs if s.title and (s.body_lines or s.key or s.number)]


def _draft_from_entry(entry: CatalogEntry, *, column: str = "", page: int = 0) -> SongDraft:
    draft = SongDraft(column=column or entry.side or "full", page=page)
    _fill_from_catalog(draft, entry)
    return draft


def segment_side_lines(
    lines: list[tuple[str, list]],
    entries: list[CatalogEntry],
    *,
    column: str,
    page: int,
) -> list[SongDraft]:
    """Split one column's lines among catalog entries that belong to that side."""
    if not entries:
        return []
    if len(entries) == 1:
        draft = _draft_from_entry(entries[0], column=column, page=page)
        for text, ws in lines:
            if is_shared_header_line(text, entries):
                apply_meta(draft, text)
                continue
            if line_matches_catalog(text, entries[0]):
                continue  # skip title line
            _ingest_body(draft, text, ws)
        return [draft]

    # Score each line × entry; pick best unique anchors
    best: dict[str, tuple[int, int]] = {}  # number -> (score, line_idx)
    for i, (text, _ws) in enumerate(lines):
        if is_shared_header_line(text, entries):
            continue
        for e in entries:
            sc = line_match_score(text, e)
            if sc < 30:
                continue
            prev = best.get(e.number)
            if prev is None or sc > prev[0]:
                best[e.number] = (sc, i)

    # Resolve index collisions: keep higher score
    by_idx: dict[int, CatalogEntry] = {}
    ranked = sorted(
        ((sc, idx, e) for e in entries if e.number in best for sc, idx in [best[e.number]]),
        key=lambda t: -t[0],
    )
    claimed_nums: set[str] = set()
    for sc, idx, e in ranked:
        if e.number in claimed_nums:
            continue
        if idx in by_idx:
            continue
        by_idx[idx] = e
        claimed_nums.add(e.number)

    anchors = sorted(by_idx.items(), key=lambda t: t[0])  # (line_idx, entry)

    # Drop trailing anchors that would leave an empty body (title on last OCR line)
    if len(anchors) >= 2:
        last_i, _last_e = anchors[-1]
        if last_i >= len(lines) - 1:
            anchors = anchors[:-1]

    if len(anchors) >= 2:
        songs: list[SongDraft] = []
        for i, (start_i, entry) in enumerate(anchors):
            end_i = anchors[i + 1][0] if i + 1 < len(anchors) else len(lines)
            draft = _draft_from_entry(entry, column=column, page=page)
            for text, ws in lines[start_i + 1 : end_i]:
                _ingest_body(draft, text, ws)
            songs.append(draft)
        for e in entries:
            if e.number not in {s.number for s in songs}:
                stub = _draft_from_entry(e, column=column, page=page)
                stub.body_lines.append("{comment: needs_review — âncora OCR não encontrada}")
                stub.word_lines.append([])
                songs.append(stub)
        order_map = {e.number: i for i, e in enumerate(entries)}
        songs.sort(key=lambda s: order_map.get(s.number, 999))
        return songs

    # Few anchors: strip headers, then split remaining lines evenly in catalog order
    body: list[tuple[str, list]] = []
    for text, ws in lines:
        if is_shared_header_line(text, entries):
            continue
        if anchors and line_matches_catalog(text, anchors[0][1]) and not body:
            continue
        body.append((text, ws))

    n = len(entries)
    if not body:
        return [_draft_from_entry(e, column=column, page=page) for e in entries]

    chunk = max(1, len(body) // n)
    songs = []
    for i, e in enumerate(entries):
        start = i * chunk
        end = len(body) if i == n - 1 else min(len(body), (i + 1) * chunk)
        draft = _draft_from_entry(e, column=column, page=page)
        for text, ws in body[start:end]:
            _ingest_body(draft, text, ws)
        songs.append(draft)
    return songs


def segment_with_catalog(ocrs: list[OcrResult], catalog: list[CatalogEntry]) -> list[SongDraft]:
    """Split OCR using catalog sides + hymn numbers as anchors."""
    order = sorted(
        ocrs,
        key=lambda o: (o.page, 0 if o.column == "left" else 1 if o.column == "right" else 2),
    )

    has_sides = any(e.side in ("left", "right") for e in catalog)
    songs: list[SongDraft] = []

    if has_sides:
        for side in ("left", "right"):
            entries = [e for e in catalog if e.side == side]
            if not entries:
                continue
            # Merge all pages for this column in order
            lines: list[tuple[str, list]] = []
            page0 = 0
            for o in order:
                if o.column != side:
                    continue
                page0 = o.page
                lines.extend(lines_from_ocr(o))
            songs.extend(segment_side_lines(lines, entries, column=side, page=page0))
    else:
        lines = []
        page0 = 0
        for o in order:
            page0 = o.page
            lines.extend(lines_from_ocr(o))
        songs.extend(segment_side_lines(lines, catalog, column="full", page=page0))

    # Ensure every catalog entry appears once
    have = {s.number for s in songs}
    for e in catalog:
        if e.number not in have:
            stub = _draft_from_entry(e)
            stub.body_lines.append("{comment: needs_review — âncora OCR não encontrada}")
            stub.word_lines.append([])
            songs.append(stub)

    order_map = {e.number: i for i, e in enumerate(catalog)}
    songs.sort(key=lambda s: order_map.get(s.number, 999))
    return songs


def segment_all(
    ocrs: list[OcrResult],
    *,
    fallback_title: str = "",
    catalog: list[CatalogEntry] | None = None,
) -> list[SongDraft]:
    if catalog and len(catalog) >= 1:
        anchored = segment_with_catalog(ocrs, catalog)
        if anchored:
            return anchored
        # Catalog present but anchors weak: still avoid single-blob for multi-song
        if len(catalog) > 1:
            # Regex per-column, then overlay catalog metadata by number
            songs: list[SongDraft] = []
            order = sorted(
                ocrs,
                key=lambda o: (o.page, 0 if o.column == "left" else 1 if o.column == "right" else 2),
            )
            for o in order:
                songs.extend(segment_column(o))
            by_num = {e.number: e for e in catalog}
            for s in songs:
                if s.number in by_num:
                    _fill_from_catalog(s, by_num[s.number])
            if songs:
                # Add missing catalog stubs
                have = {s.number for s in songs}
                for e in catalog:
                    if e.number not in have:
                        stub = SongDraft(column=e.side or "full")
                        _fill_from_catalog(stub, e)
                        stub.body_lines.append("{comment: needs_review — âncora OCR não encontrada}")
                        stub.word_lines.append([])
                        songs.append(stub)
                order_map = {e.number: i for i, e in enumerate(catalog)}
                songs.sort(key=lambda s: order_map.get(s.number, 999))
                return songs
            # Last resort with catalog: one draft per entry, dump all OCR into first
            drafts = []
            for e in catalog:
                d = SongDraft(column=e.side or "full")
                _fill_from_catalog(d, e)
                drafts.append(d)
            for o in order:
                for text, ws in lines_from_ocr(o):
                    target = next((d for d in drafts if d.column == o.column), drafts[0])
                    _ingest_body(target, text, ws)
            return drafts

    songs: list[SongDraft] = []
    order = sorted(
        ocrs,
        key=lambda o: (o.page, 0 if o.column == "left" else 1 if o.column == "right" else 2),
    )
    for o in order:
        songs.extend(segment_column(o))
    if songs:
        return songs
    if not fallback_title and not ocrs:
        return []
    draft = SongDraft(title=fallback_title or "Sem título", column="full", page=0)
    for o in order:
        for text, ws in lines_from_ocr(o):
            _ingest_body(draft, text, ws)
    if draft.body_lines:
        return [draft]
    return []


if __name__ == "__main__":
    assert looks_like_title("647", "SANTO, SANTO, SANTO É O SENHOR")
    assert not looks_like_title("02", "louver")
    e = CatalogEntry(number="622", title="A BELEZA DA TUA SANTIDADE")
    assert line_matches_catalog("622 - A BELEZA DA TUA SANTIDADE", e)
    assert line_matches_catalog("Cc 622 - A BELEZA DA TUA SANTIDADE Am", e)
    print("ok")
