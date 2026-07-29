#!/usr/bin/env python3
"""One-shot vision pilot: 1 song crop → ChordPro via Llama 3.2 11B Vision (~Mode A size)."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from ai_fallback import (  # noqa: E402
    load_api_token,
    split_headers_body,
    strip_model_noise,
    workers_ai_vision,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = HERE / "out" / "vision_pilot"
MODEL = "@cf/meta/llama-3.2-11b-vision-instruct"

# Minha Porção — auto_ok falso positivo (OCR com j-injection)
PDF_DIR = ROOT / "storage/chordpro_staging/bfbddf5a-eccf-4c4a-90fc-5baf55aba7d0"
CROP = PDF_DIR / "_ocr_debug/_crops/crop_p00_left_473.png"
CURRENT = PDF_DIR / "00-473-minha-porcao.chordpro"

PROMPT = """Esta imagem é um RECORTES de cifra cristã brasileira (acordes + letra).

Contexto do material:
- PDFs desta coletânea costumam ter 2 colunas e VÁRIOS louvores por página.
- Este recorte é de UM louvor só (número ~473, título próximo de "Minha Porção").
- Metadados no topo (nº, título, tom/key, ritmo) NÃO vão no body — só use para entender o louvor.
- Acordes costumam aparecer em VERMELHO (ou acima da letra), alinhados às sílabas.
- A letra é preta. Barras | às vezes marcam compassos — NÃO copie as barras no ChordPro.

O que é acorde vs letra:
- Acordes: símbolos musicais (C, Am, G/B, D7, Em7/B, bis, N.C.). Coloque como [C], [Am], [G/B] imediatamente ANTES da sílaba onde soam.
- Letra: palavras em português. Nunca coloque letra dentro de [].
- NÃO invente acordes nem estrofes. Se ilegível, omita em vez de chutar.

Saída:
- APENAS body ChordPro (linhas com [Acordes] + letra).
- Sem {{title}}, {{key}}, markdown, explicações ou ```.
- Português correto (ajmor→amor, Sejnhor→Senhor, dajrei→darei).
- Máximo ~40 linhas.
"""


def main() -> None:
    if not CROP.exists():
        raise SystemExit(f"crop missing: {CROP}")
    token = load_api_token()
    png = CROP.read_bytes()
    print(f"model={MODEL}")
    print(f"crop={CROP.relative_to(ROOT)} ({len(png)} bytes)")
    raw = workers_ai_vision(token, model=MODEL, image_png=png, prompt=PROMPT, max_tokens=2048)
    body = strip_model_noise(raw)
    # if model echoed headers, drop them
    _h, body2 = split_headers_body("{title: x}\n\n" + body)
    if body2.strip():
        body = body2
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / "473-minha-porcao.vision11b.chordpro"
    headers = ""
    if CURRENT.exists():
        headers, _ = split_headers_body(CURRENT.read_text(encoding="utf-8", errors="replace"))
        headers = "\n".join(headers) + "\n\n"
    out_path.write_text(headers + body.strip() + "\n", encoding="utf-8")
    print(f"wrote {out_path.relative_to(ROOT)}")
    print("--- BODY ---")
    print(body.strip()[:2500])
    print("--- END ---")


if __name__ == "__main__":
    main()
