"""Leitura do acervo local: metadata.yml, catálogo metadata_from_chords.yml, gabaritos."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Optional

import yaml

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OLD_OUT = os.path.join(ROOT, "scripts", "pdf-to-chordpro", "out")


@dataclass
class CatalogEntry:
    number: str
    title: str
    tonality: str = ""
    rhythm: str = ""
    instruments: str = ""
    author: str = ""
    side: str = ""


@dataclass
class PraiseMeta:
    praise_id: str
    name: str
    number: str
    author: str = ""
    rhythm: str = ""
    tonality: str = ""
    lyrics: str = ""
    catalog: list[CatalogEntry] = field(default_factory=list)

    def catalog_numbers(self) -> set[str]:
        return {c.number for c in self.catalog}

    def catalog_for(self, number: str) -> Optional[CatalogEntry]:
        for c in self.catalog:
            if c.number == number:
                return c
        return None


def resolve(path: str) -> str:
    """Caminho absoluto: aceita absoluto, relativo ao cwd ou relativo à raiz do repo."""
    if os.path.isabs(path):
        return path
    if os.path.exists(path):
        return os.path.abspath(path)
    return os.path.join(ROOT, path)


def load_praise(pdf_path: str) -> PraiseMeta:
    d = os.path.dirname(resolve(pdf_path))
    m = yaml.safe_load(open(os.path.join(d, "metadata.yml"), encoding="utf-8")) or {}
    pm = PraiseMeta(
        praise_id=str(m.get("praise_id", "")),
        name=str(m.get("praise_name", "")),
        number=str(m.get("praise_number", "")).strip(),
        author=str(m.get("praise_author", "") or ""),
        rhythm=str(m.get("praise_rhythm", "") or ""),
        tonality=str(m.get("praise_tonality", "") or ""),
        lyrics=str(m.get("praise_lyrics", "") or ""),
    )
    cpath = os.path.join(d, "metadata_from_chords.yml")
    if os.path.exists(cpath):
        cat = yaml.safe_load(open(cpath, encoding="utf-8")) or []
        for c in cat:
            n = str(c.get("praise_number", "") or "").strip()
            if not n:
                continue
            pm.catalog.append(CatalogEntry(
                n, str(c.get("praise_name", "") or ""), str(c.get("praise_tonality", "") or ""),
                str(c.get("praise_rhythm", "") or ""), str(c.get("praise_instruments", "") or ""),
                str(c.get("praise_author", "") or ""), str(c.get("side", "") or ""),
            ))
    return pm


def canonical_lines(lyrics: str) -> list[str]:
    out = []
    for raw in lyrics.splitlines():
        s = raw.strip()
        if not s or s.startswith("/"):
            continue
        out.append(s)
    return out


_rhythms: Optional[list[str]] = None


def rhythm_vocabulary() -> list[str]:
    """Ritmos que existem no acervo (metadata.yml), para normalizar a leitura OCR da linha 'Ritmo:'."""
    global _rhythms
    if _rhythms is None:
        import glob
        vals: dict[str, int] = {}
        for p in glob.glob(os.path.join(ROOT, "storage", "assets", "praises", "*", "metadata.yml")):
            try:
                for line in open(p, encoding="utf-8"):
                    if line.startswith("praise_rhythm:"):
                        v = line.split(":", 1)[1].strip().strip("'\"")
                        if v:
                            vals[v] = vals.get(v, 0) + 1
                        break
            except OSError:
                continue
        _rhythms = [k for k, _ in sorted(vals.items(), key=lambda kv: -kv[1]) if len(k) >= 3]
    return _rhythms


_categories: Optional[list[str]] = None


def category_vocabulary() -> list[str]:
    """Categorias do acervo (praise_category): aparecem como cabeçalho corrido das páginas."""
    global _categories
    if _categories is None:
        import glob
        vals: set[str] = set()
        for p in glob.glob(os.path.join(ROOT, "storage", "assets", "praises", "*", "metadata.yml")):
            try:
                for line in open(p, encoding="utf-8"):
                    if line.startswith("praise_category:"):
                        v = line.split(":", 1)[1].strip().strip("'\"")
                        if len(v) >= 4:
                            vals.add(v)
                        break
            except OSError:
                continue
        _categories = sorted(vals)
    return _categories


def looks_like_category(text: str) -> bool:
    import difflib
    from .page import norm_text
    t = norm_text(text)
    if len(t) < 4:
        return False
    return any(difflib.SequenceMatcher(None, t, norm_text(v)).ratio() >= 0.8 for v in category_vocabulary())


def normalize_rhythm(raw: str) -> str:
    """Casa o texto OCR com um ritmo conhecido (≥ 0,75 de similaridade); vazio se não casar."""
    import difflib
    r = raw.strip()
    if not r:
        return ""
    best, bv = "", 0.0
    for v in rhythm_vocabulary():
        sc = difflib.SequenceMatcher(None, r.lower().replace(" ", ""), v.lower().replace(" ", "")).ratio()
        if sc > bv:
            best, bv = v, sc
    return best if bv >= 0.75 else ""


_gold_index: Optional[dict[str, str]] = None


def gold_path(job_id: str) -> Optional[str]:
    """Arquivo revisado à mão (gabarito de agosto), se existir para este job."""
    global _gold_index
    if _gold_index is None:
        _gold_index = {}
        mp = os.path.join(OLD_OUT, "gold_set", "manifest.json")
        if os.path.exists(mp):
            for it in json.load(open(mp)):
                if it.get("has_gold") and os.path.exists(it["gold_path"]):
                    _gold_index[it["job_id"]] = it["gold_path"]
    return _gold_index.get(job_id)
