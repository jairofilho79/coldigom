#!/usr/bin/env python3
"""Minimal checks for segment/chordpro helpers."""
from pathlib import Path

from segment import (
    CatalogEntry,
    SongDraft,
    apply_meta,
    line_matches_catalog,
    load_catalog,
    looks_like_title,
)
from to_chordpro import slugify, to_chordpro


def test_title_filter():
    assert looks_like_title("647", "SANTO, SANTO, SANTO É O SENHOR")
    assert not looks_like_title("02", "louver")
    assert not looks_like_title("1", "AB")


def test_meta_glue():
    s = SongDraft()
    assert apply_meta(s, "Tonalidade: E Ritmo: Básico")
    assert s.key == "E"
    assert "Básico" in s.rhythm or "Basico" in s.rhythm.replace("á", "a")


def test_chordpro_headers():
    s = SongDraft(title="Teste", number="10", key="G", rhythm="Básico")
    text = to_chordpro(s)
    assert "{title: Teste}" in text
    assert "{subtitle: 10}" in text
    assert "{key: G}" in text
    assert slugify("São João!") == "sao-joao"


def test_catalog_anchor_match():
    e = CatalogEntry(number="622", title="A BELEZA DA TUA SANTIDADE")
    assert line_matches_catalog("622 - A BELEZA DA TUA SANTIDADE", e)
    assert line_matches_catalog("Cc 622 - A BELEZA DA TUA SANTIDADE Am", e)
    assert line_matches_catalog("622 A BELEZA DA TUA SANTIDADE", e)
    assert not line_matches_catalog("623 - EU QUERO CANTAR", e)


def test_load_catalog_real():
    root = Path(__file__).resolve().parents[2]
    praise = root / "storage/assets/praises/8a98d873-2b69-4e98-ae8d-12b3be7d5428"
    cat = load_catalog(praise)
    assert len(cat) == 4
    assert [c.number for c in cat] == ["622", "623", "624", "625"]


def test_chord_token():
    from segment import is_valid_chord_token, is_chord_line

    assert is_valid_chord_token("Am")
    assert is_valid_chord_token("G/B")
    assert is_valid_chord_token("bis")
    assert is_valid_chord_token("A")
    assert not is_valid_chord_token("a")
    assert not is_valid_chord_token("e")
    assert not is_valid_chord_token("em")
    assert not is_valid_chord_token("Coro")
    assert not is_valid_chord_token("Instrumentos")
    assert not is_valid_chord_token("Cc")
    assert is_chord_line("Am G C D")
    assert not is_chord_line("A beleza da tua santidade")


if __name__ == "__main__":
    test_title_filter()
    test_meta_glue()
    test_chordpro_headers()
    test_catalog_anchor_match()
    test_load_catalog_real()
    test_chord_token()
    print("ok")
