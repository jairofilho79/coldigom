"""Métricas contra o gabarito humano e rodada de verificação. Uso: python3 -m agent.bench out/round1"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys
from collections import Counter

from .acervo import canonical_lines, load_praise
from .chords import CHORD_TOKEN_RE, glued_and_loose
from .skeleton import ChordMark, LyricLine, Skeleton
from .verify import body_lines, verify


def _chords(text: str) -> list[str]:
    return [m.group(1) for m in CHORD_TOKEN_RE.finditer("\n".join(body_lines(text))) if not m.group(1).startswith("*")]


def _lyrics(text: str) -> str:
    s = CHORD_TOKEN_RE.sub("", "\n".join(body_lines(text)))
    return re.sub(r"\s+", " ", s).strip().lower()


def _glue_seq(text: str) -> list[tuple[str, bool]]:
    """(acorde, colado?) na ordem, para medir colado/solto contra o gabarito."""
    out = []
    for line in body_lines(text):
        for m in CHORD_TOKEN_RE.finditer(line):
            tok = m.group(1)
            if tok.startswith("*"):
                continue
            before = line[m.start() - 1] if m.start() > 0 else " "
            after = line[m.end()] if m.end() < len(line) else " "
            glued = not (before.isspace() or before == "]") or not (after.isspace() or after == "[")
            out.append((tok, glued))
    return out


def compare(cand: str, gold: str) -> dict:
    cc, gc = _chords(cand), _chords(gold)
    inter = sum((Counter(cc) & Counter(gc)).values())
    p = inter / len(cc) if cc else 0.0
    r = inter / len(gc) if gc else 0.0
    f1 = 2 * p * r / (p + r) if p + r else 0.0
    seq = difflib.SequenceMatcher(None, cc, gc).ratio()
    lyr = difflib.SequenceMatcher(None, _lyrics(cand), _lyrics(gold)).ratio()
    glue = difflib.SequenceMatcher(None, _glue_seq(cand), _glue_seq(gold)).ratio()
    exact_body = body_lines(cand) == body_lines(gold)
    return {"chord_f1": round(f1, 3), "chord_seq": round(seq, 3), "lyric": round(lyr, 3), "glue": round(glue, 3),
            "exact_body": exact_body, "chords_cand": len(cc), "chords_gold": len(gc)}


def skeleton_from_json(d: dict) -> Skeleton:
    lines = [LyricLine(l["idx"], l["text"], l["raw"], l["bars"], [ChordMark(**c) for c in l["chords"]], l["y0"], l["y1"], l["kind"], l["repeat"], l.get("notes", []))
             for l in d["lines"]]
    return Skeleton(d["number"], d["title"], lines, d["unassigned_chords"], d["unassigned_bars"], d["repeats"])


EXPECT = os.path.join(os.path.dirname(__file__), "..", "bench", "expectations.json")


def expectations_for(name: str) -> list[str]:
    if not os.path.exists(EXPECT):
        return []
    d = json.load(open(EXPECT, encoding="utf-8"))
    return [x for x in d.get(name, []) if isinstance(x, str)]


def run(root: str) -> list[dict]:
    rows = []
    for name in sorted(os.listdir(root)):
        d = os.path.join(root, name)
        jp = os.path.join(d, "job.json")
        if not os.path.exists(jp):
            continue
        job = json.load(open(jp))
        row = {"job": name, "hymn": job.get("hymn"), "title": job.get("title"), "status": job.get("status")}
        cp = os.path.join(d, "candidate.chordpro")
        if job.get("status") != "ready" or not os.path.exists(cp):
            row["verify"] = None
            rows.append(row)
            continue
        cand = open(cp, encoding="utf-8").read()
        sk = skeleton_from_json(json.load(open(os.path.join(d, "skeleton.json"))))
        pm = load_praise(job["pdf"])
        rep = verify(cand, sk, canonical_lines(pm.lyrics))
        row["verify"] = rep.as_dict()
        json.dump(rep.as_dict(), open(os.path.join(d, "verify.json"), "w"), ensure_ascii=False, indent=1)
        gp = os.path.join(d, "gold.chordpro")
        if os.path.exists(gp):
            row["gold"] = compare(cand, open(gp, encoding="utf-8").read())
        exp = expectations_for(name)
        if exp:
            row["expect"] = {"ok": sum(1 for e in exp if e in cand), "total": len(exp), "missing": [e for e in exp if e not in cand]}
        rows.append(row)
    return rows


def main() -> None:
    rows = run(sys.argv[1])
    print(f"{'job':44s} ok  V0 V1 V4 V3 V2 | f1    seq   lyric glue  exact | dono")
    for r in rows:
        v = r.get("verify")
        if not v:
            print(f"{r['job'][:44]:44s} --  (sem candidato)")
            continue
        flags = " ".join(("ok" if c["ok"] else "XX") for c in v["checks"])
        g = r.get("gold")
        gs = f"{g['chord_f1']:.3f} {g['chord_seq']:.3f} {g['lyric']:.3f} {g['glue']:.3f} {g['exact_body']}" if g else ""
        e = r.get("expect")
        es = f"{e['ok']}/{e['total']}" if e else ""
        print(f"{r['job'][:44]:44s} {'ok' if v['ok'] else 'XX'}  {flags} | {gs:38s} | {es}")
    json.dump(rows, open(os.path.join(sys.argv[1], "bench.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
