"""Gramática e normalização de nomes de acorde."""
from __future__ import annotations

import re

_ROOT = r"[A-G](?:#|b)?"
_QUAL = r"(?:m|maj|min|dim|aug|sus|add|M|\+|°|ø)?"
_CHORD_RE = re.compile(
    rf"^{_ROOT}{_QUAL}\d{{0,2}}(?:\([^)]{{1,8}}\))?(?:(?:sus|add|maj)\d{{0,2}})?(?:/{_ROOT})?$"
)

_FIXES = [
    (re.compile(r"[\*\+º°˚]"), "#"),   # OCR troca # por * ou º; ° só vale como dim, tratado abaixo
    (re.compile(r"[♭]"), "b"),
    (re.compile(r"[\s\.,;:\|\[\]]+$"), ""),
    (re.compile(r"^[\s\.,;:\|\[\]]+"), ""),
]


def normalize(raw: str) -> str:
    """Limpa lixo comum do OCR. Não garante validade; use is_chord()."""
    s = raw.strip()
    if not s:
        return s
    if s.lower() == "cc":
        s = "C"
    for rx, rep in _FIXES:
        s = rx.sub(rep, s)
    if len(s) >= 1 and s[0] in "abcdefg" and (len(s) == 1 or not s[1:2].isalpha() or s[1:2] in "b"):
        s = s[0].upper() + s[1:]
    s = s.replace("mi", "m") if re.fullmatch(r"[A-G](#|b)?mi", s) else s
    return s


def is_chord(s: str) -> bool:
    return bool(s) and bool(_CHORD_RE.match(s))


CHORD_TOKEN_RE = re.compile(r"\[([^\]]*)\]")


def split_chordpro_line(line: str) -> list[tuple[str, str]]:
    """Divide uma linha ChordPro em [('lyric', txt), ('chord', nome), ...] na ordem."""
    out: list[tuple[str, str]] = []
    pos = 0
    for m in CHORD_TOKEN_RE.finditer(line):
        if m.start() > pos:
            out.append(("lyric", line[pos:m.start()]))
        out.append(("chord", m.group(1)))
        pos = m.end()
    if pos < len(line):
        out.append(("lyric", line[pos:]))
    return out


def glued_and_loose(line: str) -> tuple[int, int]:
    """Conta acordes colados (encostam em letra) e soltos (cercados de espaço/borda)."""
    glued = loose = 0
    for m in CHORD_TOKEN_RE.finditer(line):
        if m.group(1).startswith("*"):
            continue  # anotação [*2x]
        before = line[m.start() - 1] if m.start() > 0 else " "
        after = line[m.end()] if m.end() < len(line) else " "
        # vizinho que é outro acorde conta como espaço: só o acorde que encosta na letra é colado
        touch_left = not (before.isspace() or before == "]")
        touch_right = not (after.isspace() or after == "[")
        if touch_left or touch_right:
            glued += 1
        else:
            loose += 1
    return glued, loose
