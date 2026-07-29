#!/usr/bin/env python3
"""AI fallback Mode A (text) + Mode B (vision crop) via Cloudflare Workers AI.

Auth: CLOUDFLARE_API_TOKEN / CF_API_TOKEN, or Wrangler OAuth
(~/Library/Preferences/.wrangler/config/default.toml).

Flow: try Mode A → on reject, Mode B with crop PNG.
No D1 upload — rewrites local staging *.chordpro when validation passes.
Backups: *.chordpro.bak
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "storage" / "chordpro_staging"
ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "246ee6c20c011ae98a226d48a7a38902")
MODEL_A = os.environ.get(
    "COLDIGOM_AI_MODEL_A",
    "@cf/meta/llama-3.1-8b-instruct-fast",
)
MODEL_B = os.environ.get(
    "COLDIGOM_AI_MODEL_B",
    "@cf/google/gemma-4-26b-a4b-it",
)

CHORD_OK = re.compile(
    r"^([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M)?\d{0,2}(?:/#?[A-G](?:#|b)?)?|bis|N\.?C\.?|%)$",
    re.I,
)
BRACKET_RE = re.compile(r"\[([^\]\n]+)\]")
HEADER_RE = re.compile(r"^\{[a-zA-Z][^}]*\}\s*$")

SYSTEM_A = """Você converte cifras OCR em ChordPro.
Regras:
- NÃO altere title, subtitle, key, rhythm, artist (já fornecidos nos HEADERS).
- Devolva APENAS o corpo ChordPro (linhas com [Acordes] e letra), sem headers {title:...}.
- Acordes só no formato [A], [Am], [G/B], [D7], [bis], etc.
- Não invente estrofes que não existam na fonte (OCR / ChordPro atual).
- Português do Brasil; corrija OCR óbvio (Jejsus→Jesus, Sejnhor→Senhor) sem mudar o sentido.
- Sem markdown, sem explicações, sem blocos ```."""

PROMPT_B_TEMPLATE = """A imagem é o recorte de UM louvor (cifra com acordes e letra).

HEADERS_FIXOS (não altere; não repita no output):
{headers}

OCR auxiliar (pode estar errado; use a imagem como fonte principal):
{ocr}

Extraia letra + acordes em ChordPro.
Regras:
- Devolva APENAS o BODY (sem {{title}}, {{key}}, etc.).
- Acordes no formato [A], [Am], [G/B], [bis] — nunca coloque letra dentro de [].
- Escreva palavras COMPLETAS em português (nunca "con - fi - lo", "Je sus", "mo rar").
- Nunca use \\C\\, **negrito**, Tono:/Ritmo:, Verse/Bridge.
- Não invente estrofes; não repita a mesma linha mais de uma vez.
- Máximo ~35 linhas de conteúdo.
- Sem notação ABC (sem X:1, T:, M:, K:), sem markdown, sem explicações.
- Se a imagem for ilegível, devolva o mínimo fiel ao OCR — não invente."""

POLISH_A = """Você corrige ChordPro já quase certo.
Tarefa: juntar sílabas partidas e corrigir OCR óbvio na LETRA, sem mudar acordes nem inventar estrofes.
Exemplos: "con - fi - lo"→"confio"; "Je sus"→"Jesus"; "ex - cel - so"→"excelso"; "mo rar"→"morar".
Mantenha [Acordes] exatamente. Devolva SÓ o body, sem headers, sem markdown."""

_agreed_models: set[str] = set()


def load_api_token() -> str:
    for key in ("CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"):
        v = os.environ.get(key, "").strip()
        if v:
            return v
    cfg = Path.home() / "Library/Preferences/.wrangler/config/default.toml"
    if cfg.exists():
        for line in cfg.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("oauth_token"):
                m = re.search(r'=\s*"([^"]+)"', line)
                if m:
                    return m.group(1)
    raise SystemExit(
        "Missing Cloudflare token. Set CLOUDFLARE_API_TOKEN or run `wrangler login`."
    )


def split_headers_body(text: str) -> tuple[list[str], str]:
    headers: list[str] = []
    body_lines: list[str] = []
    in_body = False
    for ln in text.splitlines():
        if not in_body and HEADER_RE.match(ln.strip()):
            headers.append(ln.strip())
            continue
        if not in_body and not ln.strip():
            in_body = True
            continue
        in_body = True
        body_lines.append(ln)
    return headers, "\n".join(body_lines).strip()


def strip_model_noise(raw: str) -> str:
    s = (raw or "").strip()
    # Gemma reasoning / think blocks
    s = re.sub(r"<think>[\s\S]*?</think>", "", s, flags=re.I)
    s = re.sub(r"<reasoning>[\s\S]*?</reasoning>", "", s, flags=re.I)
    if s.startswith("```"):
        s = re.sub(r"^```(?:chordpro|text)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    s = s.replace("**", "")
    # Vision models sometimes emit \Am\ instead of [Am]
    s = re.sub(
        r"\\([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M)?\d{0,2}(?:/#?[A-G](?:#|b)?)?)\\?",
        r"[\1]",
        s,
    )
    lines = []
    for ln in s.splitlines():
        if HEADER_RE.match(ln.strip()) and any(
            k in ln.lower() for k in ("title", "subtitle", "key:", "rhythm", "artist", "meta:")
        ):
            continue
        low = ln.strip().lower()
        if low.startswith(("tono:", "ritmo:", "verse", "bridge", "chorus")):
            continue
        # ABC / musicxml-ish headers some vision models invent
        if re.match(r"^[XTMKL]:", ln.strip()):
            continue
        if re.match(r"^(claro[,!]?\s|aqui est[aá])", low):
            continue
        lines.append(ln)
    return "\n".join(lines).strip()


def postprocess_body(body: str) -> str:
    from segment import is_valid_chord_token

    out: list[str] = []
    for ln in body.splitlines():
        raw = ln.strip()
        if not raw:
            out.append("")
            continue
        low = raw.lower().strip("[]")
        if low in ("coro", "final", "fim", "ponte", "intro", "verso"):
            out.append(f"{{comment: {low.capitalize()}}}")
            continue
        m = re.fullmatch(r"\[(Coro|Final|Fim|Ponte|Intro|Verso)\]", raw, re.I)
        if m:
            out.append(f"{{comment: {m.group(1)}}}")
            continue
        toks = raw.replace("|", " ").split()
        if toks and all(is_valid_chord_token(t.strip("[]")) for t in toks):
            out.append(" ".join(f"[{t.strip('[]')}]" for t in toks))
            continue
        out.append(ln)
    return "\n".join(out).strip()


def _lyric_text(line: str) -> str:
    t = BRACKET_RE.sub("", line)
    return re.sub(r"[-_=|]+", " ", t).strip()


def validate_body(body: str, *, ocr: str, min_lines: int = 2, loose: bool = False) -> tuple[bool, str]:
    if not body or len(body) < 20:
        return False, "body too short"
    blo = body.lower()
    if "```" in body or blo.startswith("claro") or "aqui estão" in blo or "aqui esta" in blo:
        return False, "looks like prose"
    if "**" in body or re.search(r"\\[A-G]", body):
        return False, "markdown/backslash chords"
    if re.search(r"^X:\d+", body, re.M):
        return False, "abc notation"
    if re.search(r"^(tono|ritmo|verse|bridge|chorus)\b", blo, re.M):
        return False, "non-chordpro labels"
    if body.count("[") != body.count("]"):
        return False, "unbalanced brackets"
    lines = [ln for ln in body.splitlines() if ln.strip()]
    if len(lines) < min_lines:
        return False, "too few lines"
    if ocr and len(ocr) > 250 and len(lines) < (4 if loose else 5):
        return False, "too few lines for OCR size"
    if any(len(ln) > 180 for ln in lines):
        return False, "blob line"
    max_lines = 50 if loose else 50
    if len(lines) > max_lines:
        return False, "too many lines"
    dups = sum(1 for a, b in zip(lines, lines[1:]) if a == b)
    if dups >= (2 if loose else 3):
        return False, "repetition loop"
    from collections import Counter

    # Chord-only rows often repeat ([C], [G]…) — spam check uses lyric-bearing lines
    spam_lines = [ln for ln in lines if _lyric_text(ln)]
    counts = Counter(spam_lines or lines)
    spam_n = 4 if loose else 4
    if counts and counts.most_common(1)[0][1] >= spam_n:
        return False, "line spam"
    if body.count("|") >= 5:
        return False, "pipe junk"
    stubs = sum(
        1
        for ln in lines
        if 0 < len(_lyric_text(ln)) <= 2  # ignore chord-only rows
    )
    if len(lines) >= 8 and stubs / len(lines) > (0.4 if loose else 0.3):
        return False, "too many stub lines"
    lyric_chars = sum(len(re.sub(r"\s+", "", _lyric_text(ln))) for ln in lines)
    min_density = 6 if loose else 9
    if len(lines) >= 10 and lyric_chars / len(lines) < min_density:
        return False, "low lyric density"
    brackets = BRACKET_RE.findall(body)
    bad = [t for t in brackets if not CHORD_OK.match(t.strip())]
    if not loose and bad:
        return False, f"bad chords {bad[:5]}"
    if loose and brackets and len(bad) / len(brackets) > 0.2:
        return False, f"bad chords {bad[:5]}"
    if len(brackets) < 2:
        return False, "too few chord brackets"
    if len(lines) >= 15 and len(brackets) < max(4, int(len(lines) * 0.12)):
        return False, "sparse chords"
    words = re.findall(r"[A-Za-zÀ-ÿ]{4,}", body)
    if len(words) >= 8:
        shreds = sum(1 for w in words if re.search(r"(jn|ej|aj|ij|oj|uj|l[ae]x)", w, re.I))
        if shreds / len(words) > (0.35 if loose else 0.25):
            return False, "ocr shreds"
    if ocr:
        factor = 2.0 if loose else 2.2
        if len(body) > max(100, int(len(ocr) * factor)):
            return False, "body much longer than OCR"
        if not loose and len(body) < max(20, int(len(ocr) * 0.15)):
            return False, "body much shorter than OCR"
    return True, "ok"


def _parse_ai_response(data: object) -> str:
    if isinstance(data, dict):
        if "result" in data and isinstance(data["result"], dict):
            r = data["result"]
            if isinstance(r.get("response"), str) and r["response"].strip():
                return r["response"]
            if isinstance(r.get("description"), str) and r["description"].strip():
                return r["description"]
            choices = r.get("choices")
            if isinstance(choices, list) and choices:
                msg = choices[0].get("message") or {}
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    return content
                # Gemma sometimes puts draft in reasoning when thinking is on
                reasoning = msg.get("reasoning")
                if isinstance(reasoning, str) and reasoning.strip():
                    return reasoning
                text = choices[0].get("text")
                if isinstance(text, str) and text.strip():
                    return text
        if isinstance(data.get("response"), str) and data["response"].strip():
            return data["response"]
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            msg = choices[0].get("message") or {}
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                return content
    raise RuntimeError(f"Unexpected AI response shape: {str(data)[:300]}")


def workers_ai_post(token: str, model: str, payload: dict, *, timeout: int = 180) -> str:
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        # First-time model agreement: prompt "agree"
        if "Model Agreement" in err and "agree" in err.lower():
            raise ModelAgreementNeeded(model, err) from e
        raise RuntimeError(f"Workers AI HTTP {e.code}: {err[:500]}") from e
    return _parse_ai_response(data)


class ModelAgreementNeeded(Exception):
    def __init__(self, model: str, detail: str):
        self.model = model
        self.detail = detail
        super().__init__(detail)


def ensure_model_agreement(token: str, model: str) -> None:
    """Llama vision models require a one-time prompt 'agree' per account."""
    if model in _agreed_models:
        return
    try:
        workers_ai_post(token, model, {"prompt": "agree"}, timeout=60)
    except ModelAgreementNeeded:
        # Cloudflare returns 5016 thanking you after agree — that's success
        pass
    except RuntimeError as e:
        if "Thank you for agreeing" in str(e) or "5016" in str(e):
            pass
        else:
            # already agreed / unrelated
            if "Model Agreement" not in str(e):
                pass
    _agreed_models.add(model)


def workers_ai_chat(token: str, messages: list[dict], *, model: str, max_tokens: int = 2048) -> str:
    return workers_ai_post(
        token,
        model,
        {"messages": messages, "temperature": 0.2, "max_tokens": max_tokens},
    )


def resize_png_bytes(png: bytes, max_width: int = 1024, max_height: int = 1600) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(png))
    w, h = img.size
    if w > max_width:
        img = img.resize((max_width, max(1, int(h * max_width / w))), Image.Resampling.LANCZOS)
    w, h = img.size
    if h > max_height:
        img = img.resize((max(1, int(w * max_height / h)), max_height), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def workers_ai_vision(
    token: str,
    *,
    model: str,
    image_png: bytes,
    prompt: str,
    max_tokens: int = 3072,
) -> str:
    ensure_model_agreement(token, model)
    # Gemma vision: keep image modest so output tokens aren't starved
    max_w, max_h = (768, 1200) if "gemma" in model.lower() else (1024, 1600)
    img = resize_png_bytes(image_png, max_width=max_w, max_height=max_h)
    b64 = base64.b64encode(img).decode("ascii")
    data_url = f"data:image/png;base64,{b64}"

    # Gemma 4 / chat-vision models: OpenAI-style multimodal messages
    if "gemma" in model.lower() or "kimi" in model.lower() or "llama-4" in model.lower():
        return workers_ai_post(
            token,
            model,
            {
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "Você extrai cifras de imagens para ChordPro. "
                            "Responda só com o body ChordPro, sem explicações."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": data_url}},
                            {"type": "text", "text": prompt},
                        ],
                    },
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
                # Without this, Gemma burns tokens on hidden reasoning and returns empty content
                "chat_template_kwargs": {"enable_thinking": False},
            },
            timeout=300,
        )

    # Llama 3.2 vision: image + prompt
    return workers_ai_post(
        token,
        model,
        {
            "image": b64,
            "prompt": prompt,
            "temperature": 0.15,
            "max_tokens": max_tokens,
            "repetition_penalty": 1.25,
        },
        timeout=180,
    )


def hymn_number_from_filename(chordpro_name: str) -> str | None:
    m = re.match(r"^\d+-(\d+)-", chordpro_name)
    return m.group(1) if m else None


def find_ocr_for_song(pdf_dir: Path, chordpro_name: str) -> str:
    num = hymn_number_from_filename(chordpro_name)
    crops = pdf_dir / "_ocr_debug" / "_crops"
    if num and crops.is_dir():
        for p in crops.glob(f"crop_*_{num}.txt"):
            return p.read_text(encoding="utf-8", errors="replace")
    dbg = pdf_dir / "_ocr_debug"
    if dbg.is_dir():
        parts = [p.read_text(encoding="utf-8", errors="replace") for p in sorted(dbg.glob("p*.txt"))]
        return "\n".join(parts)
    return ""


def find_crop_png(pdf_dir: Path, chordpro_name: str) -> Path | None:
    num = hymn_number_from_filename(chordpro_name)
    crops = pdf_dir / "_ocr_debug" / "_crops"
    if not num or not crops.is_dir():
        return None
    matches = sorted(crops.glob(f"crop_*_{num}.png"))
    return matches[0] if matches else None


def should_fix(chordpro: str, ocr: str, *, force: bool) -> bool:
    if force:
        return True
    _headers, body = split_headers_body(chordpro)
    # ocr="" skips length-vs-OCR rules (short songs with big OCR crops are fine)
    ok, _reason = validate_body(body, ocr="", loose=False)
    if not ok:
        return True
    brackets = BRACKET_RE.findall(body)
    if any(not CHORD_OK.match(t.strip()) for t in brackets):
        return True
    body_lines = [ln for ln in body.splitlines() if ln.strip()]
    if len(body_lines) < 3:
        return True
    junk = sum(body.count(x) for x in ("|", "ajn", "ejx", "Sejn", "caniar"))
    if junk > 8 and len(body) > 80:
        return True
    return needs_syllable_polish(body)


def unwrap_false_chords(body: str) -> str:
    """Turn [not-a-chord] back into plain text so validation can pass."""

    def repl(m: re.Match[str]) -> str:
        t = m.group(1).strip()
        if CHORD_OK.match(t):
            return m.group(0)
        return t

    body = BRACKET_RE.sub(repl, body)
    # Drop leftover pipes from OCR/vision syllable marks
    body = re.sub(r"\s*\|\s*", " ", body)
    body = re.sub(r" {2,}", " ", body)
    # Drop unclosed [foo at EOL and orphan ]
    body = re.sub(r"\[[^\]\n]*$", "", body, flags=re.M)
    while body.count("]") > body.count("["):
        body = body.replace("]", "", 1)
    while body.count("[") > body.count("]"):
        body = re.sub(r"\[([^\]\n]*)$", r"\1", body, count=1, flags=re.M)
    return body


def _collapse_lyric_syllables(fragment: str) -> str:
    """Join spaced hyphen syllable breaks; keep compounds (Prostremo-nos)."""
    s = fragment
    # duplicated syllable: ter- ter -ra → terra
    s = re.sub(
        r"\b([A-Za-zÀ-ÿ]{2,3})\s*-\s*\1\s*-\s*([A-Za-zÀ-ÿ]{1,4})\b",
        r"\1\2",
        s,
        flags=re.I,
    )
    s = re.sub(r"\b([A-Za-zÀ-ÿ]{2,3})\s*-\s*\1\b", r"\1", s, flags=re.I)
    # short syllables only when hyphen has whitespace on at least one side
    for _ in range(8):
        n = re.sub(
            r"([A-Za-zÀ-ÿ]{1,4})\s*-\s+([A-Za-zÀ-ÿ]{1,4})",
            r"\1\2",
            s,
        )
        n = re.sub(
            r"([A-Za-zÀ-ÿ]{1,4})\s+-\s*([A-Za-zÀ-ÿ]{1,4})",
            r"\1\2",
            n,
        )
        if n == s:
            break
        s = n
    return re.sub(r" {2,}", " ", s)


def collapse_syllables(body: str) -> str:
    """Apply syllable collapse only outside [chord] brackets."""
    out: list[str] = []
    for ln in body.splitlines():
        parts: list[str] = []
        last = 0
        for m in BRACKET_RE.finditer(ln):
            parts.append(_collapse_lyric_syllables(ln[last : m.start()]))
            parts.append(m.group(0))
            last = m.end()
        parts.append(_collapse_lyric_syllables(ln[last:]))
        out.append("".join(parts))
    return "\n".join(out)


def needs_syllable_polish(body: str) -> bool:
    """Spaced hyphen breaks only — not compounds like Prostremo-nos."""
    return len(re.findall(r"[A-Za-zÀ-ÿ]\s*-\s+[A-Za-zÀ-ÿ]|[A-Za-zÀ-ÿ]\s+-\s*[A-Za-zÀ-ÿ]", body)) >= 2

def finalize(raw: str, *, ocr: str, loose: bool) -> tuple[str | None, str]:
    cleaned = postprocess_body(strip_model_noise(raw))
    cleaned = unwrap_false_chords(cleaned)
    cleaned = collapse_syllables(cleaned)
    ok, reason = validate_body(cleaned, ocr=ocr, loose=loose)
    if not ok:
        return None, reason
    return cleaned, "ok"


def fix_mode_a(
    token: str,
    *,
    headers: list[str],
    ocr: str,
    body: str,
    model: str,
) -> tuple[str | None, str]:
    user = (
        "HEADERS_FIXOS:\n"
        + "\n".join(headers)
        + "\n\nOCR_BRUTO:\n"
        + (ocr[:6000] or "(vazio)")
        + "\n\nCHORDPRO_ATUAL:\n"
        + (body[:6000] or "(vazio)")
        + "\n\nReescreva só o BODY em ChordPro válido."
    )
    raw = workers_ai_chat(
        token,
        [{"role": "system", "content": SYSTEM_A}, {"role": "user", "content": user}],
        model=model,
    )
    return finalize(raw, ocr=ocr, loose=False)


def polish_body_mode_a(
    token: str,
    *,
    headers: list[str],
    body: str,
    model: str,
    ocr: str,
) -> tuple[str | None, str]:
    user = (
        "HEADERS_FIXOS (não repetir):\n"
        + "\n".join(headers)
        + "\n\nBODY:\n"
        + body[:6000]
        + "\n\nCorrija só sílabas/OCR na letra; mantenha acordes."
    )
    raw = workers_ai_chat(
        token,
        [{"role": "system", "content": POLISH_A}, {"role": "user", "content": user}],
        model=model,
        max_tokens=2048,
    )
    return finalize(raw, ocr=ocr, loose=True)


def fix_mode_b(
    token: str,
    *,
    headers: list[str],
    ocr: str,
    crop_png: Path,
    model: str,
    model_a: str | None = None,
) -> tuple[str | None, str]:
    prompt = PROMPT_B_TEMPLATE.format(
        headers="\n".join(headers),
        ocr=(ocr[:3500] or "(vazio)"),
    )
    raw = workers_ai_vision(
        token,
        model=model,
        image_png=crop_png.read_bytes(),
        prompt=prompt,
    )
    body, reason = finalize(raw, ocr=ocr, loose=True)
    if not body:
        return None, reason
    if model_a and needs_syllable_polish(body):
        polished, preason = polish_body_mode_a(
            token, headers=headers, body=body, model=model_a, ocr=ocr
        )
        if polished:
            return polished, "ok+polish"
        # keep vision body if polish fails validation
    return body, reason


def process_dir(
    pdf_dir: Path,
    token: str,
    *,
    force: bool,
    dry_run: bool,
    model_a: str,
    model_b: str,
    modes: str,
) -> list[dict]:
    use_a = "a" in modes
    use_b = "b" in modes
    results = []
    for cp in sorted(pdf_dir.glob("*.chordpro")):
        bak = cp.with_suffix(".chordpro.bak")
        src_path = bak if bak.exists() else cp
        text = src_path.read_text(encoding="utf-8", errors="replace")
        headers, body = split_headers_body(text)
        ocr = find_ocr_for_song(pdf_dir, cp.name)
        crop = find_crop_png(pdf_dir, cp.name)

        if not should_fix(text, ocr, force=force):
            results.append({"file": cp.name, "action": "skip"})
            continue

        new_body: str | None = None
        mode_used = None
        reason = ""

        if use_a:
            try:
                new_body, reason = fix_mode_a(
                    token, headers=headers, ocr=ocr, body=body, model=model_a
                )
                if new_body:
                    mode_used = "A"
            except Exception as e:
                reason = f"A error: {e}"[:200]
                new_body = None

        if not new_body and use_b:
            if not crop or not crop.exists():
                results.append(
                    {
                        "file": cp.name,
                        "action": "reject",
                        "reason": reason or "no crop png for mode B",
                        "tried": "A" if use_a else "",
                    }
                )
                continue
            try:
                new_body, reason = fix_mode_b(
                    token,
                    headers=headers,
                    ocr=ocr,
                    crop_png=crop,
                    model=model_b,
                    model_a=model_a,
                )
                if new_body:
                    mode_used = "B" if reason == "ok" else "B+polish"
            except Exception as e:
                results.append(
                    {
                        "file": cp.name,
                        "action": "error",
                        "error": f"B: {e}"[:220],
                        "a_reason": reason,
                    }
                )
                continue

        if not new_body:
            results.append({"file": cp.name, "action": "reject", "reason": reason, "tried": modes})
            continue

        out = "\n".join(headers + [""] + new_body.splitlines()) + "\n"
        if not dry_run:
            if not bak.exists():
                bak.write_text(cp.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
            cp.write_text(out, encoding="utf-8")
        results.append(
            {
                "file": cp.name,
                "action": "fixed" if not dry_run else "would_fix",
                "mode": mode_used,
                "body_lines": len([ln for ln in new_body.splitlines() if ln.strip()]),
            }
        )
    return results


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--ids", nargs="+", required=True, help="material_id prefix(es)")
    ap.add_argument("--force", action="store_true", help="AI-fix every song")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--model-a", default=MODEL_A)
    ap.add_argument("--model-b", default=MODEL_B)
    ap.add_argument(
        "--modes",
        default="ab",
        choices=("a", "b", "ab"),
        help="a=text only, b=vision only, ab=A then B on reject (default)",
    )
    args = ap.parse_args()

    token = load_api_token()
    dirs: list[Path] = []
    for want in args.ids:
        dirs.extend(d for d in STAGING.iterdir() if d.is_dir() and d.name.startswith(want))
    if not dirs:
        raise SystemExit("No staging dirs matched")

    if "b" in args.modes:
        ensure_model_agreement(token, args.model_b)

    for d in dirs:
        print(f"== {d.name[:8]} … ==")
        for row in process_dir(
            d,
            token,
            force=args.force,
            dry_run=args.dry_run,
            model_a=args.model_a,
            model_b=args.model_b,
            modes=args.modes,
        ):
            print(" ", row)


if __name__ == "__main__":
    main()
