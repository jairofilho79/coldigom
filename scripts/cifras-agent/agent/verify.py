"""Verificador: o ChordPro do leitor tem que bater com o que a tinta mediu. Nada aqui usa modelo."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .chords import CHORD_TOKEN_RE, glued_and_loose, is_chord
from .crop import canonical_check
from .skeleton import Skeleton

DIRECTIVE_RE = re.compile(r"^\{[^}]*\}\s*$")


@dataclass
class Check:
    id: str
    name: str
    ok: bool
    detail: str
    lines: list[int] = field(default_factory=list)


@dataclass
class Report:
    ok: bool
    checks: list[Check]

    def as_dict(self) -> dict:
        return {"ok": self.ok, "checks": [c.__dict__ for c in self.checks]}


def body_lines(text: str) -> list[str]:
    """Linhas do corpo, sem diretivas, sem anotações [*2x] e sem linhas em branco."""
    out = []
    for raw in text.splitlines():
        s = raw.rstrip()
        if not s.strip() or DIRECTIVE_RE.match(s):
            continue
        if re.fullmatch(r"\s*\[\*[^\]]*\]\s*", s):
            continue
        out.append(s)
    return out


def _strip_chords(s: str) -> str:
    return CHORD_TOKEN_RE.sub("", s)


def verify(chordpro: str, sk: Skeleton, canonical: list[str]) -> Report:
    checks: list[Check] = []
    lines = body_lines(chordpro)
    exp = [l for l in sk.lines if l.kind != "section"]
    # V0: uma linha de saída por linha medida
    if len(lines) != len(exp):
        checks.append(Check("V0", "uma linha por linha medida", False,
                            f"{len(lines)} linhas no arquivo, {len(exp)} medidas", []))
    else:
        checks.append(Check("V0", "uma linha por linha medida", True, f"{len(lines)} linhas"))
    n = min(len(lines), len(exp))
    bad_bars, bad_count, bad_names = [], [], []
    for i in range(n):
        got, want = lines[i], exp[i]
        glued, loose = glued_and_loose(got)
        total = glued + loose
        if want.kind == "inline":
            if total != len(want.chords):
                bad_count.append(i + 1)
            continue
        if glued != len(want.bars):
            bad_bars.append(i + 1)
        if total != len(want.chords):
            bad_count.append(i + 1)
        for m in CHORD_TOKEN_RE.finditer(got):
            tok = m.group(1)
            if tok.startswith("*"):
                continue
            if not is_chord(tok):
                bad_names.append(f"{i + 1}:{tok}")
    checks.append(Check("V1", "barras = acordes colados por linha", not bad_bars,
                        "ok" if not bad_bars else f"linhas {bad_bars}", bad_bars))
    checks.append(Check("V4", "acordes medidos = acordes escritos por linha", not bad_count,
                        "ok" if not bad_count else f"linhas {bad_count}", bad_count))
    checks.append(Check("V3", "gramática de acorde", not bad_names,
                        "ok" if not bad_names else ", ".join(bad_names[:8])))
    lyr = [_strip_chords(l) for l in lines]
    cc = canonical_check(lyr, canonical)
    cov = cc.get("coverage")
    ok2 = cov is None or (cov >= 0.85 and not cc.get("foreign_lines"))
    det = "sem letra no acervo" if cov is None else f"{cov:.0%} da letra canônica; estranhas: {len(cc.get('foreign_lines', []))}"
    checks.append(Check("V2", "letra canônica", ok2, det))
    return Report(all(c.ok for c in checks), checks)
