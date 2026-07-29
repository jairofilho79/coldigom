#!/usr/bin/env python3
"""SongDraft → ChordPro text (phase 2: geometry + mixed-line chords)."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from segment import (
    NOISE_TOKENS,
    SECTION_RE,
    SongDraft,
    is_chord_line,
    is_valid_chord_token,
)


def slugify(title: str, fallback: str = "song") -> str:
    s = unicodedata.normalize("NFKD", title)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return (s[:60] or fallback)


def _clean_chord(tok: str) -> str:
    t = tok.strip().rstrip(",.;:")
    if t.lower() == "bis":
        return "bis"
    return t


def _clean_lyric(tok: str) -> str:
    t = tok.replace("|", "").replace("[", "").replace("]", "").strip()
    return t


def _line_metrics(words: list) -> tuple[float, float]:
    """Return (median_top, median_height) for vertical pairing."""
    if not words:
        return 0.0, 12.0
    tops = sorted(w.top for w in words)
    heights = sorted(w.height for w in words if w.height > 0)
    mid = len(tops) // 2
    hmid = len(heights) // 2
    return float(tops[mid]), float(heights[hmid] if heights else 12.0)


def lines_vertically_paired(chord_words: list, lyric_words: list) -> bool:
    if not chord_words or not lyric_words:
        return False
    c_top, c_h = _line_metrics(chord_words)
    l_top, _l_h = _line_metrics(lyric_words)
    # lyric should sit just below chord row
    gap = l_top - (c_top + c_h)
    return -0.4 * c_h <= gap <= 2.2 * c_h


def line_has_mixed_chords(words: list) -> bool:
    if not words:
        return False
    chord_n = lyric_n = 0
    for w in words:
        t = w.text.strip()
        if not t or t in NOISE_TOKENS:
            continue
        if is_valid_chord_token(t):
            chord_n += 1
        else:
            lyric_n += 1
    return chord_n >= 1 and lyric_n >= 1


def merge_chord_lyric(chord_words: list, lyric_words: list) -> str:
    """Place [Chord] before lyric syllables by x-position."""
    lyric_sorted = [w for w in sorted(lyric_words, key=lambda w: w.left) if w.text.strip() not in NOISE_TOKENS]
    if not lyric_sorted:
        toks = [_clean_chord(w.text) for w in chord_words if is_valid_chord_token(w.text)]
        return " ".join(f"[{t}]" for t in toks if t)

    inserts: dict[int, list[str]] = {}
    for cw in sorted(chord_words, key=lambda w: w.left):
        ch = _clean_chord(cw.text)
        if not is_valid_chord_token(ch):
            continue
        idx = 0
        for i, lw in enumerate(lyric_sorted):
            if lw.left + lw.width / 2 >= cw.left - 12:
                idx = i
                break
            idx = i
        inserts.setdefault(idx, []).append(ch)

    parts: list[str] = []
    for i, lw in enumerate(lyric_sorted):
        if i in inserts:
            for ch in inserts[i]:
                parts.append(f"[{ch}]")
        lyric = _clean_lyric(lw.text)
        if lyric:
            parts.append(lyric)
    return " ".join(parts)


def mixed_line_to_chordpro(words: list) -> str:
    """Interleave [chords] and lyric tokens in reading order (same OCR line)."""
    parts: list[str] = []
    for w in sorted(words, key=lambda x: x.left):
        t = w.text.strip()
        if not t or t in NOISE_TOKENS:
            continue
        # drop very low-confidence noise (keep chords even if shaky)
        if getattr(w, "conf", 100) >= 0 and w.conf < 25 and not is_valid_chord_token(t):
            continue
        if is_valid_chord_token(t):
            parts.append(f"[{_clean_chord(t)}]")
        else:
            lyric = _clean_lyric(t)
            if lyric:
                parts.append(lyric)
    return " ".join(parts)


def body_to_chordpro(song: SongDraft) -> list[str]:
    lines_out: list[str] = []
    i = 0
    body = song.body_lines
    words = song.word_lines
    while i < len(body):
        text = body[i]
        ws = words[i] if i < len(words) else []

        if SECTION_RE.match(text):
            label = text.strip().rstrip(":")
            lines_out.append(f"{{comment: {label}}}")
            i += 1
            continue

        # Mixed chord+lyric on one OCR line → word-level ChordPro
        if ws and line_has_mixed_chords(ws):
            merged = mixed_line_to_chordpro(ws)
            if merged:
                lines_out.append(merged)
            i += 1
            continue

        if is_chord_line(text, ws):
            next_text = body[i + 1] if i + 1 < len(body) else ""
            next_ws = words[i + 1] if i + 1 < len(words) else []
            next_mixed = bool(next_ws and line_has_mixed_chords(next_ws))
            next_lyric = (
                i + 1 < len(body)
                and not is_chord_line(next_text, next_ws)
                and not SECTION_RE.match(next_text)
            )
            if next_lyric and (not ws or not next_ws or lines_vertically_paired(ws, next_ws) or next_mixed):
                if next_mixed:
                    lyric_only = [w for w in next_ws if not is_valid_chord_token(w.text)]
                    chord_extra = [w for w in next_ws if is_valid_chord_token(w.text)]
                    merged = merge_chord_lyric(list(ws) + chord_extra, lyric_only)
                else:
                    merged = merge_chord_lyric(ws, next_ws)
                if merged:
                    lines_out.append(merged)
                i += 2
                continue
            toks = [_clean_chord(t) for t in text.replace("|", " ").split() if is_valid_chord_token(t)]
            if toks:
                lines_out.append(" ".join(f"[{t}]" for t in toks))
            i += 1
            continue

        # Pure lyric (strip pipes)
        cleaned = " ".join(_clean_lyric(t) for t in text.split() if t not in NOISE_TOKENS)
        if cleaned:
            lines_out.append(cleaned)
        i += 1
    return lines_out


def to_chordpro(song: SongDraft) -> str:
    headers = []
    title = song.title or "Sem título"
    headers.append(f"{{title: {title}}}")
    if song.number:
        headers.append(f"{{subtitle: {song.number}}}")
    if song.key:
        headers.append(f"{{key: {song.key}}}")
    if song.rhythm:
        headers.append(f"{{rhythm: {song.rhythm}}}")
    if song.artist:
        headers.append(f"{{artist: {song.artist}}}")
    if song.instruments:
        headers.append(f"{{comment: Instrumentos: {song.instruments}}}")
    if song.intro:
        headers.append(f"{{comment: Introdução: {song.intro}}}")
    headers.append(f"{{meta: column {song.column}}}")
    body = body_to_chordpro(song)
    return "\n".join(headers + [""] + body) + "\n"


def write_songs(songs: list[SongDraft], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.chordpro"):
        old.unlink()
    paths = []
    for i, song in enumerate(songs):
        slug = slugify(song.title, fallback=f"song-{i:02d}")
        num = song.number or f"{i:02d}"
        path = out_dir / f"{i:02d}-{num}-{slug}.chordpro"
        path.write_text(to_chordpro(song), encoding="utf-8")
        paths.append(path)
    return paths
