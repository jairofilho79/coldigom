#!/usr/bin/env python3
"""
scripts/transcrever_partitura_voz.py

Pipeline Opção 1 (V2 - Decomposição Focada por Áudio Isolado + Layout Espaçado):
1. Estudo Isolado do Áudio 1 (CONTRALTO.mp3 - 100% a cappella): extrai ritmo real das sílabas e notas do Contralto no Coro.
2. Estudo Isolado do Áudio 2 (TENOR.mp3): extrai exclusivamente a linha melódica cantada pelo Tenor no Coro.
3. Estudo Isolado do Áudio 3 (BAIXO.mp3): extrai exclusivamente a linha melódica cantada pelo Baixo/Barítono no Coro.
4. Estudo Focado do Áudio Geral (Audio.mp3) + Partituras de Sopro (Flauta, Oboé, Fagote):
   extrai a melodia/ritmo real das Estrofes 1 e 2, a voz principal (Soprano) e os acordes reais (múltiplos acordes por compasso).
5. Síntese Inteligente + Geração de MusicXML com 2 compassos por sistema nas partes cantadas (letra espaçada e legível)
   + Compilação em PDF/MP3 via MuseScore 4 CLI.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PRAISE_ID = "c130e7ce-a3c5-4e96-ac69-e3cd49d11168"
PRAISE_DIR = ROOT / "storage" / "assets" / "praises" / PRAISE_ID
OUT_DIR = Path("/tmp/coldigom_linda_cidade")
MSCORE_BIN = Path("/Applications/MuseScore 4.app/Contents/MacOS/mscore")

AUDIO_MAIN = PRAISE_DIR / "3a8eb683-e2cf-4b26-87a3-7c7d62866778.mp3"
AUDIO_ALTO = PRAISE_DIR / "3829cab7-bf3b-4c82-baaf-a468a1e84b6f.mp3"
AUDIO_TENOR = PRAISE_DIR / "80dd1d67-f9cb-41e1-adb8-ad6bc1bd4334.mp3"
AUDIO_BASS = PRAISE_DIR / "efea2bfa-300e-427e-96c3-4be40987eaa5.mp3"
PDF_FLUTE = PRAISE_DIR / "fe227b50-29c1-4615-a3fd-577c46435cfe.pdf"
PDF_OBOE = PRAISE_DIR / "e799a062-ee66-4ae1-8f63-ea1027db4162.pdf"
PDF_BASSOON = PRAISE_DIR / "cfc4c1aa-03d7-4f96-b35e-c2ac9bbea6c3.pdf"

TWO_FOUR_MEASURES = {13, 34, 39}
TOTAL_MEASURES = 55


def http_json(url: str, payload: dict[str, Any] | None = None, timeout: int = 240) -> dict[str, Any]:
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    else:
        req = urllib.request.Request(url, method="GET")
    ctx = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err_body}") from e


def obter_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if key:
        return key.strip()
    zshrc = Path.home() / ".zshrc"
    if zshrc.exists():
        with open(zshrc, "r", encoding="utf-8") as f:
            for line in f:
                if "GEMINI_API_KEY=" in line or "GOOGLE_API_KEY=" in line:
                    match = re.search(r'(?:GEMINI|GOOGLE)_API_KEY=["\']?([^"\'\s]+)["\']?', line)
                    if match:
                        return match.group(1).strip()
    return ""


def listar_modelos_gemini(api_key: str) -> list[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        data = http_json(url, timeout=15)
        return [m["name"].replace("models/", "") for m in data.get("models", [])]
    except Exception as e:
        print(f"⚠️ Aviso ao listar modelos: {e}")
    return []


def escolher_modelo(disponiveis: list[str], preferidos: list[str]) -> str:
    for pref in preferidos:
        if pref in disponiveis:
            return pref
        for d in disponiveis:
            if d.startswith(pref):
                return d
    return preferidos[0]


def encode_file_part(path: Path, mime_type: str) -> dict[str, Any]:
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return {"inlineData": {"mimeType": mime_type, "data": b64}}


NOTE_SCHEMA = {
    "type": "object",
    "properties": {
        "pitch": {"type": "string"},
        "sixteenths": {"type": "integer"},
        "lyric": {"type": "string"},
    },
    "required": ["pitch", "sixteenths", "lyric"],
}

CHORD_EVENT_SCHEMA = {
    "type": "object",
    "properties": {
        "beat": {"type": "integer"},
        "symbol": {"type": "string"},
    },
    "required": ["beat", "symbol"],
}


def estudar_voz_isolada_coro(
    api_key: str,
    model: str,
    voice_name: str,
    audio_path: Path,
    voice_description: str,
) -> list[dict[str, Any]]:
    """
    Analisa EXCLUSIVAMENTE um único arquivo de áudio de kit de voz (Contralto, Tenor ou Baixo)
    no Coro (compassos 17 a 24, em Mi Maior / E Major, 85 BPM).
    """
    print(f"🎧 Estudando isoladamente a faixa de {voice_name.upper()} ({audio_path.name})...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    prompt = f"""Você está ouvindo EXCLUSIVAMENTE o kit de ensaio da voz **{voice_name.upper()}** do louvor "Linda Cidade" (Tom: Mi Maior / E Major — 4 sustenidos: F#, C#, G#, D#; andamento ~85 BPM, compasso 4/4).

Contexto sobre este áudio ({voice_description}):
- O Coro tem 8 compassos em 4/4 (compassos 17 a 24 da partitura):
  - Frase 1 (compassos 17, 18, 19, 20):
    "Oh! Lin-da ci-da-de, ci-da-de san-ta que Je-sus foi pre-pa-rar."
  - Frase 2 (compassos 21, 22, 23, 24):
    "Oh! Lin-da ci-da-de, ci-da-de san-ta on-de os sal-vos i-rão mo-rar."
  (Observação: na faixa do Tenor, o cantor grava o coro duas vezes seguidas ("De novo!"); transcreva os 8 compassos do coro).

REGRAS ESTRITAS DE FIDELIDADE AO ÁUDIO:
1. NÃO invente notas teóricas de livro de harmonia! Transcreva EXATAMENTE a linha melódica que a voz humana canta neste áudio.
   - Se a voz repetir a mesma nota ou subir/descer por graus conjuntos (`E - F# - G# - A`, etc.), anote exatamente o que o cantor está cantando!
   - Ignore as notas do piano de fundo; foque 100% na voz humana em primeiro plano.
2. RITMO FIEL AO CANTADO (não use colcheias quadradas onde há síncope ou notas pontuadas!):
   - Cada compasso 4/4 tem exatamente **16 semicolcheias** (`sixteenths` soma 16).
   - No c. 17 e c. 21 ("Oh! Lin-da ci-"):
     - "Oh!" entra no tempo 1 e sustenta (ex: 8 ou 10 semicolcheias, ou com respiração antes de "lin-da ci-"), e "lin-da ci-" entra no final do compasso preparando "-da-de" na cabeça do tempo 1 do c. 18!
   - No c. 18 e c. 22 ("-da-de, ci-da-de"):
     - "-da-de," cai nos tempos 1 e 2; depois há uma breve respiração/pausa e "ci-da-de" entra nos últimos tempos preparando "san-ta" no tempo 1 do c. 19!
   - No c. 19 ("san-ta que Je-sus foi pre-pa-") e c. 23 ("san-ta on-de os sal-vos i-rão mo-"):
     - Ouça a divisão rítmica real de cada sílaba ("san-ta", "que Je-sus", "foi pre-pa-" / "san-ta", "on-de os sal-vos", "i-rão mo-")! Preste atenção onde a nota é mais longa (semínima = 4 ou colcheia pontuada = 3) e onde é mais curta (semicolcheia = 1 ou colcheia = 2).
   - No c. 20 ("-rar.") e c. 24 ("-rar."):
     - Nota longa sustentada em "-rar" (ex: 12 semicolcheias) seguida de pausa (4 semicolcheias).
3. Use notação científica em Mi Maior (`G#4`, `F#4`, `E4`, `D#4`, `C#4`, `B3`, `A3`, `G#3`, `F#3`, `E3`, `D#3`, `C#3`, `B2`, ou `REST` para pausa).
4. Em `lyric`, coloque apenas a sílaba daquela nota (sem juntar várias palavras com underscore; se houver sinalefa curta como "de os", escreva `"de os"` com espaço normal).
"""

    voice_measure_schema = {
        "type": "object",
        "properties": {
            "measure_number": {"type": "integer"},
            "notes": {"type": "array", "items": NOTE_SCHEMA},
        },
        "required": ["measure_number", "notes"],
    }

    payload = {
        "contents": [
            {
                "parts": [
                    encode_file_part(audio_path, "audio/mp3"),
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "object",
                "properties": {
                    "chorus_voice_measures": {"type": "array", "items": voice_measure_schema},
                },
                "required": ["chorus_voice_measures"],
            },
        },
    }

    data = http_json(url, payload, timeout=240)
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)["chorus_voice_measures"]


def estudar_audio_geral_e_harmonia(
    api_key: str,
    model: str,
    alto_coro: list[dict[str, Any]],
    tenor_coro: list[dict[str, Any]],
    bass_coro: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Estuda o Áudio Geral (Audio.mp3) + Partituras de Flauta, Oboé e Fagote,
    e junta com as 3 vozes isoladas já extraídas para montar a grade completa de 55 compassos.
    """
    print("🎼 Estudando Áudio Geral + Grades de Sopro (Flauta, Oboé, Fagote) e unificando com as vozes isoladas...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    prompt = f"""Você é um mestre em transcrição e editoração de partituras vocais (SATB) da Equipe de Louvor.
Você está recebendo:
1. PDF 1: Partitura de Flauta (Mi Maior, 55 compassos).
2. PDF 2: Partitura de Oboé (Mi Maior, 55 compassos).
3. PDF 3: Partitura de Fagote (Clave de Fá, Mi Maior, 55 compassos).
4. Áudio 1: Gravação completa do louvor "Linda Cidade" (Mi Maior, 85 BPM).
5. As transcrições isoladas já feitas a partir dos áudios individuais de Contralto, Tenor e Baixo no Coro:
   - Contralto isolado (c. 17-24): {json.dumps(alto_coro, ensure_ascii=False)}
   - Tenor isolado (c. 17-24): {json.dumps(tenor_coro, ensure_ascii=False)}
   - Baixo isolado (c. 17-24): {json.dumps(bass_coro, ensure_ascii=False)}

TAREFA DE SÍNTESE INTELIGENTE E FIDELIDADE AO ÁUDIO:
Construa a transcrição completa das seções vocais:
- `intro_chords`: acordes dos compassos 1 a 8 (a partir das notas de Flauta, Oboé, Fagote e Áudio 1) + anacruse vocal se houver no final do c. 8.
- `verse1_measures`: compassos 9 a 16 (c. 13 é 2/4 = 8 semicolcheias; os demais são 4/4 = 16 semicolcheias).
- `chorus_measures`: compassos 17 a 24 (4/4 = 16 semicolcheias por compasso).
- `verse2_measures`: compassos 34 a 42 (c. 34 e c. 39 são 2/4 = 8 semicolcheias; os demais são 4/4 = 16 semicolcheias).

ATENÇÃO ESPECIAL AOS 4 PONTOS ABAIXO:
1. **RITMOS REAIS NAS ESTROFES (c. 9-16 e c. 34-42)**:
   - Ouça com muita atenção o cantor no Áudio 1! NÃO coloque tudo em colcheias quadradas (2, 2, 2, 2).
   - Respeite as colcheias pontuadas + semicolcheia (`3 + 1`), as semicolcheias de passagem (`1 + 1`), as síncopes (`2 + 4 + 2`) e as notas longas de repouso no fim de cada frase ("ci-da-de", "ou-ro", "cris-tal", "fim", "mim", "pre-pa-rar", "che-ga-rem", "mo-rar", "en-tre-gar").
   - Nos compassos 9 a 11 (e 35 a 37), apenas a voz principal canta solo (coloque `REST` em contralto, tenor e bass), e na nota longa do c. 12 ("-tal...") e c. 38 ("-ga-rem...") + na segunda metade da estrofe (c. 13-16 e c. 39-42: "Sua beleza..." / "E se tu queres...") entram as vozes harmonizadas!
2. **INTEGRAÇÃO DAS VOZES ISOLADAS NO CORO (c. 17-24)**:
   - No Coro (c. 17-24), alinhe Soprano, Contralto, Tenor e Baixo para que **todas as 4 vozes tenham exatamente as mesmas durações (`sixteenths`) em cada sílaba**, usando o ritmo real cantado e mantendo FIELMENTE as alturas (`pitch`) extraídas dos áudios isolados de Contralto, Tenor e Baixo!
   - Não substitua a linha melódica real do Baixo e do Tenor por fundamentais estáticas! Mantenha o movimento melódico real que eles cantaram nos áudios isolados.
3. **ACORDES REAIS DO ÁUDIO E DOS SOPROS (`chords` por compasso)**:
   - Cada compasso tem uma lista `chords: [{{beat: 1, symbol: "..."}}, {{beat: 3, symbol: "..."}}]`, permitindo 1, 2 ou 3 acordes por compasso nos tempos certos (`beat`: 1, 2, 3 ou 4).
   - Ouça o baixo/piano no Áudio 1 e confira os acidentes escritos na Flauta/Oboé/Fagote:
     - Na 1ª Estrofe:
       - c. 9 ("A Bíblia nos fala de uma ci-"): `E` (tempo 1), `B/D#` (tempo 3)
       - c. 10 ("-dade, onde as ruas são de"): `C#m7` (tempo 1), `E/B` ou `G#m7` (tempo 3)
       - c. 11 ("ouro e os muros de cris-"): `A` (tempo 1), `F#m7` ou `F#7` (tempo 3)
       - c. 12 ("-tal..."): `B7(4)` (tempo 1), `B7` (tempo 3) (olhe o c. 12 da Flauta/Oboé/Fagote!)
       - c. 13 (2/4 - "Sua be-"): `B7`
       - c. 14 ("-leza não tem princípio e nem"): `E` (tempo 1), `Bm7` / `E7` (tempo 3, preparando o A!)
       - c. 15 ("fim, é uma linda cidade que"): `A7M` (tempo 1), `E/G#` ou `C#m7` (tempo 3)
       - c. 16 ("Deus preparou pra mim."): `F#m7` (tempo 1), `B7` (tempo 2), `E` (tempo 3)
     - No Coro (c. 17-24 e 43-50):
       - c. 17 ("Oh! Linda ci-"): `E` (tempo 1), `Bm7` / `E7(b9)` (tempos 2-3, onde os sopros tocam Ré natural e Sol natural!), `A`/`E/G#` (tempo 4)
       - c. 18 ("-dade, cidade"): `A7M` / `C#m7` (tempo 1), `F#m7` (tempo 4)
       - c. 19 ("santa que Jesus foi prepa-"): `F#m7` (tempo 1), `B7(4)` (tempo 3), `B7` (tempo 4)
       - c. 20 ("-rar."): `E` (tempo 1), `B/D#` (tempo 4 na queda do piano!)
       - c. 21 ("Oh! Linda ci-"): `E` (tempo 1), `Bm7` / `E7(b9)` (tempos 2-3)
       - c. 22 ("-dade, cidade"): `A7M` / `C#m7` (tempo 1), `F#m7` (tempo 4)
       - c. 23 ("santa onde os salvos irão mo-"): `F#m7` (tempo 1), `B7(4)` (tempo 3), `B7` (tempo 4)
       - c. 24 ("-rar."): `E` (tempo 1)
   - Confira com o ouvido no Áudio 1 e ajuste qualquer acorde para refletir com exatidão o que é tocado na gravação!
4. **SÍLABAS LIMPAS E ESPAÇADAS**:
   - Não agrupe 3 palavras numa única nota! Dê a cada sílaba cantada a sua própria nota, e quando houver sinalefa curta de duas vogais na mesma nota (ex: "de u-", "de as", "e os"), escreva com espaço simples (`"de u-"`, `"de as"`, `"e os"`), NUNCA com underscore `_`.
"""

    measure_schema = {
        "type": "object",
        "properties": {
            "measure_number": {"type": "integer"},
            "chords": {"type": "array", "items": CHORD_EVENT_SCHEMA},
            "soprano": {"type": "array", "items": NOTE_SCHEMA},
            "contralto": {"type": "array", "items": NOTE_SCHEMA},
            "tenor": {"type": "array", "items": NOTE_SCHEMA},
            "bass": {"type": "array", "items": NOTE_SCHEMA},
        },
        "required": ["measure_number", "chords", "soprano", "contralto", "tenor", "bass"],
    }

    payload = {
        "contents": [
            {
                "parts": [
                    encode_file_part(PDF_FLUTE, "application/pdf"),
                    encode_file_part(PDF_OBOE, "application/pdf"),
                    encode_file_part(PDF_BASSOON, "application/pdf"),
                    encode_file_part(AUDIO_MAIN, "audio/mp3"),
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "object",
                "properties": {
                    "verse1_measures": {"type": "array", "items": measure_schema},
                    "chorus_measures": {"type": "array", "items": measure_schema},
                    "verse2_measures": {"type": "array", "items": measure_schema},
                },
                "required": ["verse1_measures", "chorus_measures", "verse2_measures"],
            },
        },
    }

    data = http_json(url, payload, timeout=300)
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def parse_pitch(pitch_str: str) -> tuple[str, int, int] | None:
    """Converte 'G#4' -> ('G', 1, 4), 'Bb3' -> ('B', -1, 3), 'REST' -> None."""
    p = (pitch_str or "").strip()
    if not p or p.upper() in ("REST", "R"):
        return None
    m = re.match(r"^([A-Ga-g])([#b♯♭]{0,2})(\d)$", p)
    if not m:
        return None
    step = m.group(1).upper()
    acc = m.group(2)
    octave = int(m.group(3))
    alter = 0
    if acc in ("#", "♯"):
        alter = 1
    elif acc in ("##", "x"):
        alter = 2
    elif acc in ("b", "♭"):
        alter = -1
    elif acc in ("bb", "♭♭"):
        alter = -2
    return step, alter, octave


def normalize_voice_events(events: list[dict[str, Any]], target_sixteenths: int) -> list[dict[str, Any]]:
    """Garante matematicamente que a soma de semicolcheias feche exatamente o compasso."""
    if not events:
        return [{"pitch": "REST", "sixteenths": target_sixteenths, "lyric": ""}]

    cleaned: list[dict[str, Any]] = []
    total = 0
    for ev in events:
        dur = max(1, int(ev.get("sixteenths", 4)))
        if total + dur > target_sixteenths:
            rem = target_sixteenths - total
            if rem > 0:
                cleaned.append({
                    "pitch": ev.get("pitch", "REST"),
                    "sixteenths": rem,
                    "lyric": ev.get("lyric", ""),
                })
                total += rem
            break
        cleaned.append({
            "pitch": ev.get("pitch", "REST"),
            "sixteenths": dur,
            "lyric": ev.get("lyric", ""),
        })
        total += dur

    if total < target_sixteenths:
        # Se a última nota for cantada, estende ou adiciona pausa ao final
        cleaned.append({
            "pitch": "REST",
            "sixteenths": target_sixteenths - total,
            "lyric": "",
        })
    return cleaned


def split_unrepresentable_duration(dur: int) -> list[tuple[int, str, bool]]:
    """
    Decompõe uma duração em semicolcheias (1..16) em figuras padrão do MusicXML:
    Retorna lista de (sixteenths, xml_type, is_dotted).
    """
    mapping: dict[int, tuple[str, bool]] = {
        16: ("whole", False),
        12: ("half", True),
        8: ("half", False),
        6: ("quarter", True),
        4: ("quarter", False),
        3: ("eighth", True),
        2: ("eighth", False),
        1: ("16th", False),
    }
    if dur in mapping:
        t, dot = mapping[dur]
        return [(dur, t, dot)]

    result: list[tuple[int, str, bool]] = []
    rem = dur
    for k in sorted(mapping.keys(), reverse=True):
        while rem >= k:
            t, dot = mapping[k]
            result.append((k, t, dot))
            rem -= k
    return result


def build_harmony_element(chord_str: str, offset_sixteenths: int = 0) -> ET.Element | None:
    """Cria um elemento <harmony> posicionado no offset em semicolcheias."""
    c = (chord_str or "").strip()
    if not c or c.upper() in ("REST", "NC", "N.C.", "-"):
        return None
    m = re.match(r"^([A-G])([#b]?)(.*?)(?:/([A-G])([#b]?))?$", c)
    if not m:
        return None
    root_step, root_acc, kind_raw, bass_step, bass_acc = m.groups()
    harm = ET.Element("harmony")
    root = ET.SubElement(harm, "root")
    ET.SubElement(root, "root-step").text = root_step
    if root_acc == "#":
        ET.SubElement(root, "root-alter").text = "1"
    elif root_acc == "b":
        ET.SubElement(root, "root-alter").text = "-1"

    k = (kind_raw or "").strip()
    kind_el = ET.SubElement(harm, "kind", {"text": k})
    if k in ("m", "min"):
        kind_el.text = "minor"
    elif k in ("m7", "min7"):
        kind_el.text = "minor-seventh"
    elif k in ("7",):
        kind_el.text = "dominant"
    elif k in ("maj7", "7M", "M7"):
        kind_el.text = "major-seventh"
    elif k in ("7(4)", "7sus4", "sus4", "4"):
        kind_el.text = "suspended-fourth"
    elif k in ("dim", "°"):
        kind_el.text = "diminished"
    else:
        kind_el.text = "major"

    if bass_step:
        bass = ET.SubElement(harm, "bass")
        ET.SubElement(bass, "bass-step").text = bass_step
        if bass_acc == "#":
            ET.SubElement(bass, "bass-alter").text = "1"
        elif bass_acc == "b":
            ET.SubElement(bass, "bass-alter").text = "-1"

    if offset_sixteenths > 0:
        ET.SubElement(harm, "offset").text = str(offset_sixteenths)

    return harm


def append_voice_notes(
    measure_el: ET.Element,
    events: list[dict[str, Any]],
    voice_num: str,
    staff_num: str,
    stem_dir: str,
    include_lyrics: bool = False,
    hide_rests: bool = False,
) -> None:
    for ev in events:
        parsed = parse_pitch(ev.get("pitch", "REST"))
        lyric_raw = (ev.get("lyric") or "").strip() if include_lyrics else ""
        parts = split_unrepresentable_duration(int(ev["sixteenths"]))

        for idx, (sub_dur, xml_type, is_dotted) in enumerate(parts):
            note_attrs = {"print-object": "no"} if (parsed is None and hide_rests) else {}
            note_el = ET.SubElement(measure_el, "note", note_attrs)
            if parsed is None:
                ET.SubElement(note_el, "rest")
            else:
                step, alter, octave = parsed
                pitch_el = ET.SubElement(note_el, "pitch")
                ET.SubElement(pitch_el, "step").text = step
                if alter != 0:
                    ET.SubElement(pitch_el, "alter").text = str(alter)
                ET.SubElement(pitch_el, "octave").text = str(octave)

            ET.SubElement(note_el, "duration").text = str(sub_dur)
            if parsed is not None and len(parts) > 1:
                if idx == 0:
                    ET.SubElement(note_el, "tie", {"type": "start"})
                elif idx == len(parts) - 1:
                    ET.SubElement(note_el, "tie", {"type": "stop"})
                else:
                    ET.SubElement(note_el, "tie", {"type": "stop"})
                    ET.SubElement(note_el, "tie", {"type": "start"})

            ET.SubElement(note_el, "voice").text = voice_num
            ET.SubElement(note_el, "type").text = xml_type
            if is_dotted:
                ET.SubElement(note_el, "dot")
            if parsed is not None:
                ET.SubElement(note_el, "stem").text = stem_dir
            ET.SubElement(note_el, "staff").text = staff_num

            if parsed is not None and len(parts) > 1:
                notations = ET.SubElement(note_el, "notations")
                if idx == 0:
                    ET.SubElement(notations, "tied", {"type": "start"})
                elif idx == len(parts) - 1:
                    ET.SubElement(notations, "tied", {"type": "stop"})
                else:
                    ET.SubElement(notations, "tied", {"type": "stop"})
                    ET.SubElement(notations, "tied", {"type": "start"})

            if idx == 0 and lyric_raw and parsed is not None:
                lyric_el = ET.SubElement(note_el, "lyric", {"number": "1"})
                starts_hyphen = lyric_raw.startswith("-")
                ends_hyphen = lyric_raw.endswith("-")
                clean_text = (
                    lyric_raw.strip("-")
                    .replace("_", " ")
                    .replace("‿", " ")
                    .strip()
                )
                if starts_hyphen and ends_hyphen:
                    syllabic = "middle"
                elif ends_hyphen:
                    syllabic = "begin"
                elif starts_hyphen:
                    syllabic = "end"
                else:
                    syllabic = "single"
                ET.SubElement(lyric_el, "syllabic").text = syllabic
                ET.SubElement(lyric_el, "text").text = clean_text


# Quebras de sistema explícitas (2 compassos por linha nas seções cantadas para a letra ficar bem espaçada!)
NEW_SYSTEM_MEASURES = {
    9,   # Início da 1ª Estrofe (c. 9-10)
    11,  # c. 11-12
    13,  # c. 13-14
    15,  # c. 15-16
    17,  # Coro 1ª parte (c. 17-18)
    19,  # c. 19-20
    21,  # Coro 2ª parte (c. 21-22)
    23,  # c. 23-24
    25,  # Interlúdio instrumental (c. 25-33)
    34,  # Início da 2ª Estrofe (c. 34-36)
    37,  # c. 37-38
    39,  # c. 39-40
    41,  # c. 41-42
    43,  # Coro Final 1ª parte (c. 43-44)
    45,  # c. 45-46
    47,  # Coro Final 2ª parte (c. 47-48)
    49,  # c. 49-50
    51,  # Final instrumental (c. 51-55)
}


def build_musicxml(transcricao: dict[str, Any], out_xml_path: Path) -> None:
    """Constrói o arquivo .musicxml de 55 compassos com layout espaçado (2 compassos cantados por linha)."""
    by_measure: dict[int, dict[str, Any]] = {}
    for m in transcricao.get("verse1_measures", []):
        by_measure[int(m["measure_number"])] = m
    for m in transcricao.get("chorus_measures", []):
        m_num = int(m["measure_number"])
        by_measure[m_num] = m
        if 17 <= m_num <= 24:
            clone = json.loads(json.dumps(m))
            clone["measure_number"] = m_num + 26
            by_measure[m_num + 26] = clone
    for m in transcricao.get("verse2_measures", []):
        by_measure[int(m["measure_number"])] = m

    score = ET.Element("score-partwise", {"version": "4.0"})

    work = ET.SubElement(score, "work")
    ET.SubElement(work, "work-title").text = "LINDA CIDADE"

    ident = ET.SubElement(score, "identification")
    ET.SubElement(ident, "creator", {"type": "composer"}).text = (
        "Arranjo de Sopro: Matheus Mageski\nArranjo de Cordas: Samuel Prata"
    )
    ET.SubElement(ident, "creator", {"type": "lyricist"}).text = "Vocal\n16/11/2023"
    ET.SubElement(ident, "rights").text = "© Equipe de Louvor - Maanaim de Domingos Martins"

    defaults = ET.SubElement(score, "defaults")
    scaling = ET.SubElement(defaults, "scaling")
    # Escala ligeiramente mais compacta (6.4mm / 40 tenths) para dar bastante largura horizontal à letra
    ET.SubElement(scaling, "millimeters").text = "6.4"
    ET.SubElement(scaling, "tenths").text = "40"

    page_layout = ET.SubElement(defaults, "page-layout")
    ET.SubElement(page_layout, "page-height").text = "1856"
    ET.SubElement(page_layout, "page-width").text = "1312"
    page_margins = ET.SubElement(page_layout, "page-margins", {"type": "both"})
    ET.SubElement(page_margins, "left-margin").text = "55"
    ET.SubElement(page_margins, "right-margin").text = "55"
    ET.SubElement(page_margins, "top-margin").text = "70"
    ET.SubElement(page_margins, "bottom-margin").text = "70"

    ET.SubElement(defaults, "lyric-font", {"font-family": "Edwin", "font-size": "9.5"})

    # Créditos visuais na página 1
    c_title = ET.SubElement(score, "credit", {"page": "1"})
    ET.SubElement(c_title, "credit-type").text = "title"
    ET.SubElement(
        c_title,
        "credit-words",
        {"default-x": "656", "default-y": "1775", "justify": "center", "valign": "top", "font-size": "22", "font-weight": "bold"},
    ).text = "LINDA CIDADE"

    c_sub = ET.SubElement(score, "credit", {"page": "1"})
    ET.SubElement(c_sub, "credit-type").text = "lyricist"
    ET.SubElement(
        c_sub,
        "credit-words",
        {"default-x": "55", "default-y": "1730", "justify": "left", "valign": "top", "font-size": "11"},
    ).text = "Vocal\n16/11/2023"

    c_arr = ET.SubElement(score, "credit", {"page": "1"})
    ET.SubElement(c_arr, "credit-type").text = "composer"
    ET.SubElement(
        c_arr,
        "credit-words",
        {"default-x": "1257", "default-y": "1730", "justify": "right", "valign": "top", "font-size": "10"},
    ).text = "Arranjo de Sopro: Matheus Mageski\nArranjo de Cordas: Samuel Prata"

    c_rights = ET.SubElement(score, "credit", {"page": "1"})
    ET.SubElement(c_rights, "credit-type").text = "rights"
    ET.SubElement(
        c_rights,
        "credit-words",
        {"default-x": "656", "default-y": "60", "justify": "center", "valign": "bottom", "font-size": "9"},
    ).text = "© Equipe de Louvor - Maanaim de Domingos Martins"

    part_list = ET.SubElement(score, "part-list")
    score_part = ET.SubElement(part_list, "score-part", {"id": "P1"})
    ET.SubElement(score_part, "part-name", {"print-object": "no"}).text = "Vocal"
    ET.SubElement(score_part, "part-abbreviation", {"print-object": "no"}).text = "Vo."
    score_inst = ET.SubElement(score_part, "score-instrument", {"id": "P1-I1"})
    ET.SubElement(score_inst, "instrument-name").text = "Choir Aahs"
    midi_inst = ET.SubElement(score_part, "midi-instrument", {"id": "P1-I1"})
    ET.SubElement(midi_inst, "midi-channel").text = "1"
    ET.SubElement(midi_inst, "midi-program").text = "53"

    part = ET.SubElement(score, "part", {"id": "P1"})

    # Acordes da introdução/interlúdio/final conforme grades de sopro (Flauta, Oboé, Fagote) e Áudio Geral
    intro_Measure_Chords: dict[int, list[dict[str, Any]]] = {
        1: [{"beat": 1, "symbol": "B7"}],
        2: [{"beat": 1, "symbol": "B"}, {"beat": 3, "symbol": "B7"}],
        3: [{"beat": 1, "symbol": "E"}],
        4: [{"beat": 1, "symbol": "B7"}],
        5: [{"beat": 1, "symbol": "E"}, {"beat": 3, "symbol": "B7"}],
        6: [{"beat": 1, "symbol": "B"}, {"beat": 3, "symbol": "B7"}],
        7: [{"beat": 1, "symbol": "E"}, {"beat": 3, "symbol": "B7"}],
        8: [{"beat": 1, "symbol": "E"}],
        25: [{"beat": 1, "symbol": "B7"}],
        26: [{"beat": 1, "symbol": "B"}, {"beat": 3, "symbol": "B7"}],
        27: [{"beat": 1, "symbol": "E"}],
        28: [{"beat": 1, "symbol": "B7"}],
        29: [{"beat": 1, "symbol": "E"}, {"beat": 3, "symbol": "B7"}],
        30: [{"beat": 1, "symbol": "B"}, {"beat": 3, "symbol": "B7"}],
        31: [{"beat": 1, "symbol": "E"}, {"beat": 3, "symbol": "B7"}],
        32: [{"beat": 1, "symbol": "E"}],
        33: [{"beat": 1, "symbol": "E"}],
        51: [{"beat": 1, "symbol": "B7"}],
        52: [{"beat": 1, "symbol": "B"}, {"beat": 3, "symbol": "B7"}],
        53: [{"beat": 1, "symbol": "E"}],
        54: [{"beat": 1, "symbol": "B7"}],
        55: [{"beat": 1, "symbol": "E"}],
    }

    current_beats = 4
    for m_num in range(1, TOTAL_MEASURES + 1):
        m_el = ET.SubElement(part, "measure", {"number": str(m_num)})
        beats = 2 if m_num in TWO_FOUR_MEASURES else 4
        target_16ths = beats * 4

        if m_num in NEW_SYSTEM_MEASURES:
            ET.SubElement(m_el, "print", {"new-system": "yes"})

        if m_num == 1 or beats != current_beats:
            attrs = ET.SubElement(m_el, "attributes")
            if m_num == 1:
                ET.SubElement(attrs, "divisions").text = "4"
                key_el = ET.SubElement(attrs, "key")
                ET.SubElement(key_el, "fifths").text = "4"
                time_el = ET.SubElement(attrs, "time", {"symbol": "common"})
                ET.SubElement(time_el, "beats").text = "4"
                ET.SubElement(time_el, "beat-type").text = "4"
                ET.SubElement(attrs, "staves").text = "2"

                clef1 = ET.SubElement(attrs, "clef", {"number": "1"})
                ET.SubElement(clef1, "sign").text = "G"
                ET.SubElement(clef1, "line").text = "2"

                clef2 = ET.SubElement(attrs, "clef", {"number": "2"})
                ET.SubElement(clef2, "sign").text = "F"
                ET.SubElement(clef2, "line").text = "4"
            else:
                time_el = (
                    ET.SubElement(attrs, "time", {"symbol": "common"})
                    if beats == 4
                    else ET.SubElement(attrs, "time")
                )
                ET.SubElement(time_el, "beats").text = str(beats)
                ET.SubElement(time_el, "beat-type").text = "4"
            current_beats = beats

        if m_num == 1:
            direction = ET.SubElement(m_el, "direction", {"placement": "above"})
            dir_type = ET.SubElement(direction, "direction-type")
            metronome = ET.SubElement(dir_type, "metronome")
            ET.SubElement(metronome, "beat-unit").text = "quarter"
            ET.SubElement(metronome, "per-minute").text = "85"
            ET.SubElement(direction, "sound", {"tempo": "85"})

        if m_num in (1, 16, 25, 42):
            barline = ET.SubElement(m_el, "barline", {"location": "right"})
            ET.SubElement(barline, "bar-style").text = "light-light"
        elif m_num == TOTAL_MEASURES:
            barline = ET.SubElement(m_el, "barline", {"location": "right"})
            ET.SubElement(barline, "bar-style").text = "light-heavy"

        m_data = by_measure.get(m_num)
        chords_list = []
        if m_data:
            chords_list = m_data.get("chords", [])
            if not chords_list and m_data.get("chord"):
                chords_list = [{"beat": 1, "symbol": m_data["chord"]}]
        elif m_num in intro_Measure_Chords:
            chords_list = intro_Measure_Chords[m_num]

        for ch_ev in chords_list:
            beat_num = max(1, int(ch_ev.get("beat", 1)))
            offset_16ths = (beat_num - 1) * 4
            harm_el = build_harmony_element(ch_ev.get("symbol", ""), offset_16ths)
            if harm_el is not None:
                m_el.append(harm_el)

        if m_data:
            sop = normalize_voice_events(m_data.get("soprano", []), target_16ths)
            alto = normalize_voice_events(m_data.get("contralto", []), target_16ths)
            ten = normalize_voice_events(m_data.get("tenor", []), target_16ths)
            bass = normalize_voice_events(m_data.get("bass", []), target_16ths)
        else:
            sop = [{"pitch": "REST", "sixteenths": target_16ths, "lyric": ""}]
            alto = []
            ten = [{"pitch": "REST", "sixteenths": target_16ths, "lyric": ""}]
            bass = []

        append_voice_notes(
            m_el, sop, voice_num="1", staff_num="1", stem_dir="up", include_lyrics=True, hide_rests=False
        )

        if any(parse_pitch(e.get("pitch", "REST")) is not None for e in alto):
            backup = ET.SubElement(m_el, "backup")
            ET.SubElement(backup, "duration").text = str(target_16ths)
            append_voice_notes(
                m_el, alto, voice_num="2", staff_num="1", stem_dir="down", include_lyrics=False, hide_rests=True
            )

        backup2 = ET.SubElement(m_el, "backup")
        ET.SubElement(backup2, "duration").text = str(target_16ths)

        append_voice_notes(
            m_el, ten, voice_num="5", staff_num="2", stem_dir="up", include_lyrics=False, hide_rests=False
        )

        if any(parse_pitch(e.get("pitch", "REST")) is not None for e in bass):
            backup3 = ET.SubElement(m_el, "backup")
            ET.SubElement(backup3, "duration").text = str(target_16ths)
            append_voice_notes(
                m_el, bass, voice_num="6", staff_num="2", stem_dir="down", include_lyrics=False, hide_rests=True
            )

    ET.indent(score, space="  ")
    xml_bytes = ET.tostring(score, encoding="utf-8", xml_declaration=True)
    out_xml_path.parent.mkdir(parents=True, exist_ok=True)
    out_xml_path.write_bytes(xml_bytes)
    print(f"✅ MusicXML gerado em: {out_xml_path}")


def compilar_musescore(xml_path: Path, pdf_path: Path, mp3_path: Path | None = None) -> None:
    if not MSCORE_BIN.exists():
        raise FileNotFoundError(f"MuseScore 4 CLI não encontrado em {MSCORE_BIN}")
    print(f"🖨️ Renderizando PDF via MuseScore 4 CLI...")
    if pdf_path.exists():
        pdf_path.unlink()
    subprocess.run([str(MSCORE_BIN), "-o", str(pdf_path), str(xml_path)], check=False)
    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        raise RuntimeError(f"Falha ao gerar PDF em {pdf_path}")
    print(f"✅ PDF gerado em: {pdf_path}")
    if mp3_path:
        if mp3_path.exists():
            mp3_path.unlink()
        subprocess.run([str(MSCORE_BIN), "-o", str(mp3_path), str(xml_path)], check=False)
        if mp3_path.exists() and mp3_path.stat().st_size > 0:
            print(f"🔊 Áudio de conferência gerado em: {mp3_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcreve partitura vocal com estudo isolado por áudio.")
    parser.add_argument("--model", default="", help="Modelo Gemini a utilizar")
    parser.add_argument("--from-json", default="", help="Recompila MusicXML/PDF a partir de um JSON já salvo")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / "linda_cidade_transcricao_v2.json"
    xml_path = OUT_DIR / "Linda cidade - Vocal -16 11 2023-.musicxml"
    pdf_path = OUT_DIR / "Linda cidade - Vocal -16 11 2023-.pdf"
    mp3_path = OUT_DIR / "Linda cidade - Vocal -16 11 2023-preview.mp3"

    if args.from_json:
        saved = json.loads(Path(args.from_json).read_text(encoding="utf-8"))
        build_musicxml(saved["transcricao"], xml_path)
        compilar_musescore(xml_path, pdf_path, mp3_path)
        return

    api_key = obter_api_key()
    if not api_key:
        print("❌ GEMINI_API_KEY não encontrada no ambiente nem em ~/.zshrc", file=sys.stderr)
        sys.exit(1)

    disponiveis = listar_modelos_gemini(api_key)
    model = args.model or escolher_modelo(
        disponiveis,
        [
            "gemini-3.1-pro-preview",
            "gemini-3.8-flash",
            "gemini-3-pro",
        ],
    )
    print(f"🤖 Modelo Gemini selecionado: {model}")

    # 1. Estudo isolado do Contralto (a cappella)
    alto_coro = estudar_voz_isolada_coro(
        api_key,
        model,
        "Contralto",
        AUDIO_ALTO,
        "Voz feminina 100% a cappella cantando a linha de Contralto do Coro",
    )

    # 2. Estudo isolado do Tenor
    tenor_coro = estudar_voz_isolada_coro(
        api_key,
        model,
        "Tenor",
        AUDIO_TENOR,
        "Voz masculina de Tenor em primeiro plano com piano guia ao fundo",
    )

    # 3. Estudo isolado do Baixo
    bass_coro = estudar_voz_isolada_coro(
        api_key,
        model,
        "Baixo",
        AUDIO_BASS,
        "Voz masculina grave (Barítono/Baixo) em primeiro plano com piano guia ao fundo",
    )

    # 4. Estudo focado do Áudio Geral + Sopros + Unificação das 4 vozes
    transcricao = estudar_audio_geral_e_harmonia(
        api_key,
        model,
        alto_coro,
        tenor_coro,
        bass_coro,
    )

    full_payload = {
        "praise_id": PRAISE_ID,
        "model": model,
        "isolated_voices": {
            "contralto_coro": alto_coro,
            "tenor_coro": tenor_coro,
            "bass_coro": bass_coro,
        },
        "transcricao": transcricao,
    }
    json_path.write_text(json.dumps(full_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"💾 JSON V2 salvo em: {json_path}")

    build_musicxml(transcricao, xml_path)
    compilar_musescore(xml_path, pdf_path, mp3_path)


if __name__ == "__main__":
    main()
