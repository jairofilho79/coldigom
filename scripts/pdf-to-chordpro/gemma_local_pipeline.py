#!/usr/bin/env python3
"""Gemma local ChordPro pipeline — hybrid det + subagents.

Architecture (best of both):
  DET  = rails/brakes only (never "guess" chord placement)
  AGENT = semantic judgment (vision, lyric, align, light QA)

Flow:
  0_trim     DET   cut leftover above hymn title (tesseract)
  0_cross    DET   if song spills to other column, take strip above next hymn
  1_vision   AGENT read crop (+ cross strip; tall crops → vertical blocks)
  2_lyric    AGENT fix Portuguese; do not move [chords]
  3_align    AGENT put [chords] inline on the correct lyric lines
  4_hygiene  DET   mid-word, broken slash, CHORD_OK scrub, tiny OCR map
  4b_merge   DET   ONLY if chord-only lines remain (last-resort weave)
  5_qa       AGENT optional pass: if body looks broken, one repair shot

Guards after every AGENT: reject empty / chord wipe / severe shrink.

Example:
  python3 gemma_local_pipeline.py
  python3 gemma_local_pipeline.py --crop … --out-dir … --headers-file …
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_CROP = (
    ROOT
    / "storage/chordpro_staging/bfbddf5a-eccf-4c4a-90fc-5baf55aba7d0"
    / "_ocr_debug/_crops/crop_p00_left_473.png"
)
DEFAULT_HEADERS = """{title: Minha Porção}
{subtitle: 473}
{key: Ab}
{rhythm: Básico 2}
"""
MODEL = "gemma4:12b"
OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
NUM_CTX = int(os.environ.get("COLDIGOM_OLLAMA_NUM_CTX", "12288"))
NUM_PREDICT = int(os.environ.get("COLDIGOM_OLLAMA_NUM_PREDICT", "2048"))
IMG_MAX_W = int(os.environ.get("COLDIGOM_OLLAMA_IMG_W", "1024"))
IMG_MAX_H = int(os.environ.get("COLDIGOM_OLLAMA_IMG_H", "1600"))
BLOCK_MIN_H = int(os.environ.get("COLDIGOM_VISION_BLOCK_MIN_H", "1800"))

CHORD_OK = re.compile(
    r"^([A-G](?:#|b)?"
    r"(?:maj|min|m|dim|aug|sus|add|M)?"
    r"\d{0,2}M?"
    r"(?:\(b5\)|\(#5\))?"
    r"(?:/#?[A-G](?:#|b)?)?|bis|N\.?C\.?|)$",
    re.I,
)
BRACKET_RE = re.compile(r"\[([^\[\]]+)\]")
MIDWORD_RE = re.compile(r"([A-Za-zÀ-ÿ]+)\[([^\[\]]+)\]([A-Za-zÀ-ÿ]+)", re.UNICODE)
OCR_WORD = {
    "almar": "amar",
    "sejnhor": "senhor",
    "ajmor": "amor",
    "dajrei": "darei",
    "tejsouro": "tesouro",
    "conjduz": "conduz",
    "aulxilio": "auxílio",
    "auxilio": "auxílio",
    "jejsus": "jesus",
}

PROMPTS = {
    "vision": """Você lê cifras cristãs brasileiras (acordes + letra).

Louvor: nº {subtitle} — {title}. Tom hint: {key}.
{block_note}

Regras:
- Acordes NA MESMA LINHA da letra com COLCHETES QUADRADOS: [Ab]Quem sou [Bb]eu, Se[Cm]nhor?
- NUNCA use chaves {{Ab}}; só [Ab].
- PROIBIDO linha só com [Ab] [Bb] [Cm].
- Ignore resto de OUTRO louvor acima/abaixo do nº {subtitle}.
- Não copie | nem metadados. Não invente estrofes.
- Saída: APENAS body ChordPro. Sem markdown / explicações.""",
    "lyric": """Subagente LETRA (tom: {key}, louvor {subtitle}).

Corrija só português da letra. NÃO mova/edite texto dentro de [ ].
Exemplos: almar→amar, Sejnhor→Senhor, ajmor→amor.
Não invente estrofes. Sem markdown.

ChordPro:
{body}

Devolva SÓ o body.""",
    "align": """Subagente ALINHAMENTO (tom: {key}, louvor {subtitle}).

Tarefa: colocar cada [Acorde] na mesma linha e posição correta da letra.
- Inline obrigatório: [Ab]Quem sou [Bb]eu…
- Se houver linhas só de acordes acima da letra, funda com juízo musical (não espalhe no chute).
- Preserve letra e acordes válidos. Corrija [Ab]/Eb → [Ab/Eb].
- Sem markdown / explicações.

ChordPro:
{body}

Devolva SÓ o body.""",
    "qa_fix": """Subagente QA (tom: {key}, louvor {subtitle}).

O body abaixo falhou checagens automáticas ({reason}).
Corrija o mínimo necessário para ChordPro usável (inline, letra completa, sem lixo).
Não invente estrofes longas. Sem markdown.

ChordPro:
{body}

Devolva SÓ o body.""",
}


# --- IO / model -------------------------------------------------------------

def header_field(headers: str, name: str) -> str:
    m = re.search(rf"\{{{name}:\s*([^}}]+)\}}", headers, re.I)
    return (m.group(1).strip() if m else "") or ""


def resize_png(png: bytes, max_w: int = IMG_MAX_W, max_h: int = IMG_MAX_H) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(png))
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def ollama_chat(
    *,
    prompt: str,
    images_b64: list[str] | None = None,
    model: str = MODEL,
) -> str:
    msg: dict = {"role": "user", "content": prompt}
    if images_b64:
        msg["images"] = images_b64
    payload = {
        "model": model,
        "messages": [msg],
        "stream": False,
        "think": False,
        "options": {"temperature": 0.1, "num_predict": NUM_PREDICT, "num_ctx": NUM_CTX},
    }
    req = urllib.request.Request(
        f"{OLLAMA}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=360) as r:
            data = json.load(r)
    except urllib.error.URLError as e:
        raise SystemExit(f"Ollama offline em {OLLAMA}: {e}") from e
    return ((data.get("message") or {}).get("content") or "").strip()


def strip_noise(text: str) -> str:
    s = (text or "").strip()
    if s.startswith("```"):
        lines = s.splitlines()[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    out: list[str] = []
    for ln in s.splitlines():
        t = ln.strip()
        if (
            not out
            and t.startswith("{")
            and t.endswith("}")
            and not t.startswith("{soc")
            and not t.startswith("{eoc")
        ):
            continue
        out.append(ln)
    return "\n".join(out).strip()


# --- DET hygiene (no guessing) ----------------------------------------------

def fix_midword_chords(body: str) -> str:
    prev = None
    while prev != body:
        prev = body
        body = MIDWORD_RE.sub(r"[\2]\1\3", body)
    return body


def fix_broken_slashes(body: str) -> str:
    body = re.sub(
        r"\[([A-G](?:#|b)?(?:m|min|maj|dim|aug|sus|add|M)?\d{0,2})\]\s*/\s*([A-G](?:#|b)?)\b",
        r"[\1/\2]",
        body,
        flags=re.I,
    )
    body = re.sub(
        r"\[([A-G](?:#|b)?(?:m|min|maj|dim|aug|sus|add|M)?\d{0,2})/([A-G](?:#|b)?)\]?",
        r"[\1/\2]",
        body,
        flags=re.I,
    )
    return body


def scrub_brackets(body: str) -> str:
    def repl(m: re.Match[str]) -> str:
        inner = m.group(1).strip()
        if re.search(r"0\d", inner):
            return ""
        if CHORD_OK.match(inner):
            return m.group(0)
        if re.fullmatch(r"[A-Za-zÀ-ÿ']{1,8}", inner):
            return inner
        return ""

    body = BRACKET_RE.sub(repl, body)
    return re.sub(r"\]\[", "] [", body)


def fix_ocr_outside_brackets(body: str) -> str:
    parts = BRACKET_RE.split(body)
    out: list[str] = []
    for i, part in enumerate(parts):
        if i % 2 == 1:
            out.append(f"[{part}]")
            continue

        def word_repl(m: re.Match[str]) -> str:
            w = m.group(0)
            key = w.lower()
            if key not in OCR_WORD:
                return w
            fix = OCR_WORD[key]
            return fix[0].upper() + fix[1:] if w[0].isupper() else fix

        out.append(re.sub(r"[A-Za-zÀ-ÿ']+", word_repl, part))
    return "".join(out)


def tidy_spaces(body: str) -> str:
    lines = []
    for ln in body.splitlines():
        ln = re.sub(r"[ \t]+", " ", ln)
        ln = re.sub(r" \]", "]", ln)
        ln = re.sub(r"\[\s+", "[", ln)
        lines.append(ln.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def curly_chords_to_square(body: str) -> str:
    """Model sometimes emits {Ab} instead of [Ab]. Keep real directives."""
    keep = {
        "title",
        "subtitle",
        "key",
        "rhythm",
        "artist",
        "comment",
        "meta",
        "soc",
        "eoc",
        "sob",
        "eob",
        "start_of_chorus",
        "end_of_chorus",
    }

    def repl(m: re.Match[str]) -> str:
        inner = m.group(1).strip()
        low = inner.lower().split(":", 1)[0].strip()
        if low in keep or ":" in inner:
            return m.group(0)
        if CHORD_OK.match(inner):
            return f"[{inner}]"
        return m.group(0)

    return re.sub(r"\{([^{}]+)\}", repl, body)


def hygiene_det(body: str) -> str:
    """Safe DET only — no chord-line weaving."""
    body = curly_chords_to_square(body)
    body = fix_broken_slashes(body)
    body = fix_midword_chords(body)
    body = scrub_brackets(body)
    body = fix_ocr_outside_brackets(body)
    body = fix_broken_slashes(body)
    body = fix_midword_chords(body)
    body = body.replace(" te dai ", " te darei ")
    body = re.sub(r"\]dai\b", "]darei", body)
    body = re.sub(r"\bÉ meu\b", "És meu", body)
    return tidy_spaces(body)


def is_chord_only_line(line: str) -> bool:
    t = line.strip()
    if "[" not in t:
        return False
    rest = re.sub(r"[\s|/]+", "", BRACKET_RE.sub("", t))
    return rest == ""


def weave_chords_into_lyric(chords: list[str], lyric: str) -> str:
    plain = re.sub(r"\s+", " ", BRACKET_RE.sub("", lyric)).strip()
    words = plain.split()
    if not words:
        return " ".join(f"[{c}]" for c in chords)
    parts = []
    for i, w in enumerate(words):
        parts.append(f"[{chords[i]}]{w}" if i < len(chords) else w)
    parts.extend(f"[{c}]" for c in chords[len(words) :])
    return " ".join(parts)


def fallback_merge_chord_lines(body: str) -> str:
    """Last resort after align agent — still imperfect, but better than preview smash."""
    lines = body.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if is_chord_only_line(ln):
            chords = [c.strip() for c in BRACKET_RE.findall(ln) if c.strip()]
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if chords and j < len(lines) and lines[j].strip() and not is_chord_only_line(lines[j]):
                out.append(weave_chords_into_lyric(chords, lines[j]))
                i = j + 1
                continue
        out.append(ln)
        i += 1
    return "\n".join(out)


def chord_count(body: str) -> int:
    return len(BRACKET_RE.findall(body))


def accept_body(prev: str, new: str, *, min_ratio: float = 0.5) -> tuple[str, str | None]:
    if prev.strip() and not new.strip():
        return prev, "empty"
    pc, nc = chord_count(prev), chord_count(new)
    if pc >= 4 and nc < max(2, int(pc * min_ratio)):
        return prev, f"chord_drop {pc}->{nc}"
    if len(prev) >= 200 and len(new) < int(len(prev) * 0.55):
        return prev, f"shrink {len(prev)}->{len(new)}"
    return new, None


def needs_qa(body: str) -> str | None:
    if chord_count(body) < 2:
        return "few_chords"
    if sum(1 for ln in body.splitlines() if is_chord_only_line(ln)) >= 2:
        return "chord_only_lines"
    if body.count("[") != body.count("]"):
        return "unbalanced_brackets"
    # too many tiny lyric lines → likely shredded
    lyric_lines = [ln for ln in body.splitlines() if ln.strip() and not is_chord_only_line(ln)]
    if lyric_lines and sum(1 for ln in lyric_lines if len(BRACKET_RE.sub("", ln).strip()) < 12) / len(lyric_lines) > 0.5:
        return "shredded_lyrics"
    return None


# --- crop helpers -----------------------------------------------------------

def trim_crop_to_hymn(crop: Path, hymn_number: str, *, pad_top: int = 48) -> tuple[bytes, dict]:
    raw = crop.read_bytes()
    meta: dict = {"trimmed": False, "y0": 0}
    if not hymn_number.isdigit():
        return raw, meta
    try:
        from ocr import ocr_image
        from PIL import Image
    except Exception as e:
        meta["skip"] = str(e)
        return raw, meta
    try:
        ocr = ocr_image(crop)
    except Exception as e:
        meta["skip"] = str(e)
        return raw, meta

    ys = []
    for w in ocr.words:
        t = re.sub(r"[^0-9A-Za-zÀ-ÿ\-]", "", w.text)
        if t == hymn_number or t.startswith(hymn_number + "-"):
            ys.append(w.top)
    if not ys:
        meta["skip"] = "title_not_found"
        return raw, meta

    y0 = max(0, min(ys) - pad_top)
    img = Image.open(io.BytesIO(raw))
    w, h = img.size
    meta.update({"y0": y0, "h": h})
    if y0 < max(60, int(h * 0.04)):
        meta["skip"] = "already_top"
        return raw, meta
    if y0 > int(h * 0.75):
        meta["skip"] = "y0_too_low"
        return raw, meta
    buf = io.BytesIO()
    img.crop((0, y0, w, h)).save(buf, format="PNG")
    meta["trimmed"] = True
    return buf.getvalue(), meta


def slice_above_hymn_title(crop: Path, hymn_number: str, *, pad_top: int = 48) -> tuple[bytes | None, dict]:
    """Top of a crop ABOVE hymn title = continuation of the previous cross-column song."""
    _below, meta = trim_crop_to_hymn(crop, hymn_number, pad_top=pad_top)
    if not meta.get("trimmed"):
        return None, {**meta, "continuation": False}
    y0 = int(meta.get("y0") or 0)
    if y0 < 100:
        return None, {**meta, "continuation": False, "skip": "strip_too_small"}
    try:
        from PIL import Image
    except Exception as e:
        return None, {**meta, "continuation": False, "skip": str(e)}
    img = Image.open(crop)
    w, _h = img.size
    buf = io.BytesIO()
    img.crop((0, 0, w, y0)).save(buf, format="PNG")
    return buf.getvalue(), {**meta, "continuation": True, "strip_h": y0}


def find_cross_column_continuations(
    crops_dir: Path,
    hymn_number: str,
    primary_crop: Path,
) -> list[bytes]:
    """If a later hymn on another column has leftover above its title, that belongs to us."""
    if not hymn_number.isdigit():
        return []
    try:
        primary_n = int(hymn_number)
    except ValueError:
        return []

    # crop_p00_left_474.png → page/col/num
    crop_re = re.compile(r"^crop_p(\d+)_(left|right)_(\d+)\.png$", re.I)
    primary_m = crop_re.match(primary_crop.name)
    primary_page = primary_m.group(1) if primary_m else None
    primary_col = primary_m.group(2).lower() if primary_m else None

    others: list[tuple[int, Path]] = []
    for p in sorted(crops_dir.glob("crop_*.png")):
        m = crop_re.match(p.name)
        if not m:
            continue
        n = int(m.group(3))
        if n <= primary_n:
            continue
        # same page, other column is the classic spill; also allow any later crop
        if primary_page and m.group(1) != primary_page:
            continue
        if primary_col and m.group(2).lower() == primary_col:
            continue
        others.append((n, p))

    if not others:
        return []

    # nearest next hymn on the other column
    others.sort(key=lambda t: t[0])
    _n, next_crop = others[0]
    strip, meta = slice_above_hymn_title(next_crop, str(_n))
    if not strip:
        return []
    return [strip]


def split_vertical_blocks(png: bytes, *, parts: int = 2) -> list[bytes]:
    from PIL import Image

    img = Image.open(io.BytesIO(png))
    w, h = img.size
    if h < BLOCK_MIN_H or parts < 2:
        return [png]
    out = []
    for i in range(parts):
        y0 = i * h // parts
        y1 = h if i == parts - 1 else (i + 1) * h // parts
        # small overlap so chords aren't cut
        if i > 0:
            y0 = max(0, y0 - 40)
        buf = io.BytesIO()
        img.crop((0, y0, w, y1)).save(buf, format="PNG")
        out.append(buf.getvalue())
    return out


# --- pipeline ---------------------------------------------------------------

def fill_prompt(template: str, **kwargs: str) -> str:
    """Replace {name} placeholders without interpreting chord examples like {Ab}."""
    out = template
    for key, val in kwargs.items():
        out = out.replace("{" + key + "}", str(val))
    # unescape doubled braces used in templates
    out = out.replace("{{", "{").replace("}}", "}")
    return out


def run_agent(name: str, prompt: str, *, images: list[str] | None, model: str) -> str:
    return strip_noise(ollama_chat(prompt=prompt, images_b64=images, model=model))


def run_pipeline(
    crop: Path,
    out_dir: Path,
    headers: str,
    model: str,
    *,
    skip_vision: bool = False,
    chords_llm: bool = False,  # kept for CLI compat; unused in v2 (align agent covers it)
    extra_crops: list[Path] | None = None,
    extra_pngs: list[bytes] | None = None,
) -> Path:
    del chords_llm  # compat
    out_dir.mkdir(parents=True, exist_ok=True)
    key = header_field(headers, "key") or "C"
    title = header_field(headers, "title") or "louvor"
    subtitle = header_field(headers, "subtitle") or "?"
    ctx = {"key": key, "title": title, "subtitle": subtitle, "body": "", "block_note": "", "reason": ""}
    log: list[dict] = []
    body = ""

    # 0 trim + discover cross-column leftover from next hymn crop
    png_bytes = crop.read_bytes()
    cross_pngs: list[bytes] = list(extra_pngs or [])
    for p in extra_crops or []:
        if p.exists():
            cross_pngs.append(p.read_bytes())
    if not skip_vision and not cross_pngs:
        auto = find_cross_column_continuations(crop.parent, subtitle, crop)
        cross_pngs.extend(auto)

    if not skip_vision:
        png_bytes, trim_meta = trim_crop_to_hymn(crop, subtitle)
        if trim_meta.get("trimmed"):
            print(f"→ 0_trim y0={trim_meta.get('y0')}", flush=True)
            (out_dir / "crop_trimmed.png").write_bytes(png_bytes)
        else:
            print(f"→ 0_trim skip ({trim_meta.get('skip', 'ok')})", flush=True)
        log.append({"stage": "0_trim", **trim_meta})
        if cross_pngs:
            print(f"→ 0_cross_column +{len(cross_pngs)} continuation strip(s)", flush=True)
            for i, blob in enumerate(cross_pngs):
                (out_dir / f"crop_cross_{i}.png").write_bytes(blob)
            log.append({"stage": "0_cross_column", "strips": len(cross_pngs)})
    else:
        log.append({"stage": "0_trim", "skipped": True})

    # 1 vision (primary blocks + cross-column continuation)
    t0 = time.time()
    if skip_vision:
        prev = out_dir / "1_vision.chordpro"
        if not prev.exists():
            raise SystemExit(f"--skip-vision requires {prev}")
        body = prev.read_text(encoding="utf-8").strip()
        print("→ 1_vision (reuse)", flush=True)
        log.append({"stage": "1_vision", "elapsed_s": 0.0, "chords": chord_count(body), "reuse": True})
    else:
        blocks = split_vertical_blocks(png_bytes, parts=2)
        print(f"→ 1_vision ({len(blocks)} block(s)" + (f" +{len(cross_pngs)} cross" if cross_pngs else "") + ") …", flush=True)
        parts_out: list[str] = []
        for bi, block in enumerate(blocks):
            note = ""
            if len(blocks) > 1:
                note = f"Isto é o bloco {bi + 1}/{len(blocks)} do mesmo louvor (de cima para baixo). Continue só este trecho."
            ctx["block_note"] = note
            b64 = base64.b64encode(resize_png(block)).decode("ascii")
            chunk = run_agent("vision", fill_prompt(PROMPTS["vision"], **ctx), images=[b64], model=model)
            if chunk:
                parts_out.append(chunk)
            (out_dir / f"1_vision_b{bi}.chordpro").write_text(chunk + "\n", encoding="utf-8")

        for ci, strip in enumerate(cross_pngs):
            ctx["block_note"] = (
                f"CROSS-COLUMN: continuação do louvor nº {subtitle} na OUTRA coluna "
                f"(Coro/Final que começou na coluna anterior). Extraia SÓ este restante. "
                f"Não invente o início já lido."
            )
            b64 = base64.b64encode(resize_png(strip)).decode("ascii")
            chunk = run_agent("vision", fill_prompt(PROMPTS["vision"], **ctx), images=[b64], model=model)
            if chunk:
                parts_out.append(chunk)
            (out_dir / f"1_vision_cross{ci}.chordpro").write_text((chunk or "") + "\n", encoding="utf-8")

        body = hygiene_det("\n\n".join(parts_out))
        (out_dir / "1_vision.chordpro").write_text(body + "\n", encoding="utf-8")
        log.append(
            {
                "stage": "1_vision",
                "elapsed_s": round(time.time() - t0, 1),
                "blocks": len(blocks),
                "cross_strips": len(cross_pngs),
                "chords": chord_count(body),
            }
        )
        print(f"  ok {log[-1]['elapsed_s']}s → {chord_count(body)} chords", flush=True)

    # 2 lyric agent
    t0 = time.time()
    print("→ 2_lyric (agent) …", flush=True)
    prev = body
    ctx["body"] = body
    raw = run_agent("lyric", fill_prompt(PROMPTS["lyric"], **ctx), images=None, model=model)
    body, rejected = accept_body(prev, hygiene_det(raw))
    if rejected:
        print(f"  ! reject ({rejected})", flush=True)
        body = prev
    (out_dir / "2_lyric.chordpro").write_text(body + "\n", encoding="utf-8")
    log.append(
        {
            "stage": "2_lyric",
            "elapsed_s": round(time.time() - t0, 1),
            "chords": chord_count(body),
            "rejected": rejected,
        }
    )
    print(f"  ok {log[-1]['elapsed_s']}s → {chord_count(body)} chords", flush=True)

    # 3 align agent
    t0 = time.time()
    print("→ 3_align (agent) …", flush=True)
    prev = body
    ctx["body"] = body
    raw = run_agent("align", fill_prompt(PROMPTS["align"], **ctx), images=None, model=model)
    body, rejected = accept_body(prev, hygiene_det(raw))
    if rejected:
        print(f"  ! reject ({rejected})", flush=True)
        body = prev
    (out_dir / "3_align.chordpro").write_text(body + "\n", encoding="utf-8")
    log.append(
        {
            "stage": "3_align",
            "elapsed_s": round(time.time() - t0, 1),
            "chords": chord_count(body),
            "rejected": rejected,
        }
    )
    print(f"  ok {log[-1]['elapsed_s']}s → {chord_count(body)} chords", flush=True)

    # 4 hygiene DET + optional fallback merge
    t0 = time.time()
    print("→ 4_hygiene (det) …", flush=True)
    body = hygiene_det(body)
    merged = False
    if any(is_chord_only_line(ln) for ln in body.splitlines()):
        print("  → 4b_merge fallback (chord-only lines remain)", flush=True)
        body = hygiene_det(fallback_merge_chord_lines(body))
        merged = True
    (out_dir / "4_hygiene.chordpro").write_text(body + "\n", encoding="utf-8")
    log.append(
        {
            "stage": "4_hygiene",
            "elapsed_s": round(time.time() - t0, 1),
            "chords": chord_count(body),
            "fallback_merge": merged,
        }
    )

    # 5 QA agent if needed
    reason = needs_qa(body)
    if reason:
        t0 = time.time()
        print(f"→ 5_qa (agent, reason={reason}) …", flush=True)
        prev = body
        ctx["body"] = body
        ctx["reason"] = reason
        raw = run_agent("qa", fill_prompt(PROMPTS["qa_fix"], **ctx), images=None, model=model)
        body, rejected = accept_body(prev, hygiene_det(raw), min_ratio=0.4)
        if rejected:
            print(f"  ! reject ({rejected})", flush=True)
            body = prev
        (out_dir / "5_qa.chordpro").write_text(body + "\n", encoding="utf-8")
        log.append(
            {
                "stage": "5_qa",
                "elapsed_s": round(time.time() - t0, 1),
                "chords": chord_count(body),
                "reason": reason,
                "rejected": rejected,
            }
        )
        print(f"  ok {log[-1]['elapsed_s']}s → {chord_count(body)} chords", flush=True)
    else:
        print("→ 5_qa skip (clean enough)", flush=True)
        log.append({"stage": "5_qa", "skipped": True})

    final = out_dir / "final.chordpro"
    final.write_text(headers.rstrip() + "\n\n" + body.strip() + "\n", encoding="utf-8")
    (out_dir / "pipeline.json").write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
    print(f"✓ final → {final}")
    return final


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--crop", type=Path, default=DEFAULT_CROP)
    ap.add_argument("--out-dir", type=Path, default=HERE / "out" / "gemma_local_pipeline" / "hybrid-default")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--headers-file", type=Path, default=None)
    ap.add_argument("--skip-vision", action="store_true")
    ap.add_argument("--chords-llm", action="store_true", help="compat no-op")
    args = ap.parse_args()
    if not args.skip_vision and not args.crop.exists():
        raise SystemExit(f"crop missing: {args.crop}")
    headers = DEFAULT_HEADERS
    if args.headers_file and args.headers_file.exists():
        headers = args.headers_file.read_text(encoding="utf-8")
    run_pipeline(
        args.crop,
        args.out_dir,
        headers,
        args.model,
        skip_vision=args.skip_vision,
        chords_llm=args.chords_llm,
    )


if __name__ == "__main__":
    main()
