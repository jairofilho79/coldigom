from agent.chords import normalize, is_chord, glued_and_loose


def test_grammar_accepts_common_hymnal_chords():
    for c in ["C", "Dm", "G7", "F#m", "Bb", "C#m7", "Dsus4", "A7(sus4)", "G/D", "E/G#", "Ebø", "C°", "Bm7", "Ab/C"]:
        assert is_chord(c), c


def test_grammar_rejects_words():
    for w in ["Coro", "Final", "bis", "a", "em", "Cc7x", "H", "", "Fine"]:
        assert not is_chord(w), w


def test_normalize_ocr_junk():
    assert normalize("Cc") == "C"
    assert normalize("c") == "C"
    assert normalize("F*m") == "F#m"
    assert normalize("Dm,") == "Dm"
    assert normalize("|G ") == "G"


def test_glued_counts_by_touching_text():
    assert glued_and_loose("[C]Servo do [F]Senhor") == (2, 0)
    assert glued_and_loose("Se[F]nhor, [G]   solto") == (1, 1)
    assert glued_and_loose("E solto depois   [D]") == (0, 1)
    assert glued_and_loose("[Dm] [G] [C]") == (0, 3)
    assert glued_and_loose("[G][G7]sal[C]vou") == (2, 1)
    assert glued_and_loose("[*2x]") == (0, 0)
