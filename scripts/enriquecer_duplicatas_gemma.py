#!/usr/bin/env python3
"""
scripts/enriquecer_duplicatas_gemma.py

Refatora e enriquece o arquivo curadoria-pages/data/duplicatas.json
com diagnósticos semânticos inteligentes gerados pelo modelo Gemma Embedding 2 (Ollama).

Para cada um dos 1.794 grupos:
- Classifica os materiais contra o catálogo de 121 tipos musicais;
- Calcula a similaridade cosseno direta entre os arquivos;
- Diagnostica se é Falso Positivo (Reclassificar), Duplicata Real (Remover),
  Variação de Arranjo (Manter Ambos) ou Avaliação Manual;
- Fornece recomendação de ação em 1 clique para a interface do curador.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import sys
import time
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL_NAME = "embeddinggemma-2:latest"
REPO_ROOT = Path(__file__).resolve().parent.parent
KINDS_PATH = REPO_ROOT / "curadoria-pages" / "data" / "material_kinds.json"
DUPLICATAS_PATH = REPO_ROOT / "curadoria-pages" / "data" / "duplicatas.json"
DUPLICATAS_BAK_PATH = REPO_ROOT / "curadoria-pages" / "data" / "duplicatas.json.bak"


def norm(v: list[float]) -> list[float]:
    s = math.sqrt(sum(x * x for x in v))
    return [x / s for x in v] if s else v


def dot(v1: list[float], v2: list[float]) -> float:
    return sum(a * b for a, b in zip(v1, v2))


def get_embeddings_batch(texts: list[str], batch_size: int = 128) -> list[list[float]]:
    all_embs = []
    total = len(texts)
    print(f"🔄 Gerando embeddings para {total} arquivos via Ollama ({MODEL_NAME})...")
    t0 = time.time()

    for i in range(0, total, batch_size):
        chunk = [t[:3000].strip() or "arquivo" for t in texts[i : i + batch_size]]
        payload = json.dumps({"model": MODEL_NAME, "input": chunk}).encode("utf-8")
        req = urllib.request.Request(
            OLLAMA_URL,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                embs = data.get("embeddings", [])
                all_embs.extend(embs)
        except Exception as e:
            print(f"❌ Erro na requisição ao Ollama (lote {i}-{i+len(chunk)}): {e}", file=sys.stderr)
            sys.exit(1)

        pct = len(all_embs) / total * 100
        print(f"  -> Progresso: {len(all_embs)}/{total} ({pct:.1f}%) em {time.time() - t0:.1f}s")

    return all_embs


class DomainClassifier:
    def __init__(self, kinds: list[dict]):
        self.kinds = kinds
        self.synonyms = {
            "Alto Voice I": "Voz Contralto I, Primeiro Contralto, 1° Contralto, 1º Contralto, Contralto 1",
            "Alto Voice II": "Voz Contralto II, Segundo Contralto, 2° Contralto, 2º Contralto, Contralto 2",
            "Tenor Voice I": "Voz Tenor I, Primeiro Tenor, 1° Tenor, 1º Tenor, Tenor 1",
            "Tenor Voice II": "Voz Tenor II, Segundo Tenor, 2° Tenor, 2º Tenor, Tenor 2",
            "Soprano Voice I": "Voz Soprano I, Primeiro Soprano, 1° Soprano, 1º Soprano, Soprano 1",
            "Soprano Voice II": "Voz Soprano II, Segundo Soprano, 2° Soprano, 2º Soprano, Soprano 2",
            "Bass Voice": "Voz Baixo, Baixo cantado, 1° Baixo, Primeiro Baixo",
            "Baritone Voice": "Voz Barítono, Barítono cantado",
            "Alto Saxophone": "Saxofone Alto, Sax Alto, Alto Sax",
            "Tenor Saxophone": "Saxofone Tenor, Sax Tenor, Tenor Sax",
            "Soprano Saxophone": "Saxofone Soprano, Sax Soprano",
            "Baritone Saxophone": "Saxofone Barítono, Sax Barítono",
            "Trumpet in Bb": "Trompete em Si bemol, Trompete em Sib, Trompete",
            "Trumpet I": "Trompete I, 1° Trompete, Primeiro Trompete",
            "Trumpet II": "Trompete II, 2° Trompete, Segundo Trompete",
            "Clarinet in Bb": "Clarinete em Si bemol, Clarinete em Sib, Clarinete",
            "Clarinet in Sib I": "Clarinete em Si bemol I, Clarinete em Sib I, 1° Clarinete",
            "Clarinet in Sib II": "Clarinete em Si bemol II, Clarinete em Sib II, 2° Clarinete",
            "Flute": "Flauta, Flauta transversal",
            "Flute I": "Flauta I, 1ª Flauta, Primeira Flauta",
            "Flute II": "Flauta II, 2ª Flauta, Segunda Flauta",
            "Trombone": "Trombone, Trombones",
            "Trombone I": "Trombone I, 1° Trombone",
            "Trombone II": "Trombone II, 2° Trombone",
            "French Horn in F": "Trompa em Fá, Trompas em Fá, Trompa",
            "Tuba": "Tuba",
            "Violin I": "Violino I, 1° Violino, Primeiro Violino",
            "Violin II": "Violino II, 2° Violino, Segundo Violino",
            "Viola": "Viola, Violas",
            "Cello": "Violoncelo, Cello, Cellos",
            "Contra Bass": "Contrabaixo, Contrabaixos, Baixo acústico",
            "Score": "Grade, Grade Completa, Partitura geral",
            "Base": "Base instrumental, Guia de base",
            "Audio": "Áudio geral cantado, Áudio completo",
            "Audio Solo": "Áudio solo, playback instrumental, sem voz",
            "Chord Chart": "Cifra, Cifra geral",
            "Chord Chart I": "Cifra I, Cifra 1",
            "Chord Chart II": "Cifra II, Cifra 2",
        }

        print("🔄 Preparando embeddings para os 121 tipos de materiais com enriquecimento musical...")
        kind_texts = []
        for k in self.kinds:
            syn = self.synonyms.get(k["name"], "")
            txt = f"{k.get('label', k['name'])} ({k['name']}) - {k.get('class_id', '')}"
            if syn:
                txt += f" | Sinônimos: {syn}"
            kind_texts.append(txt)

        raw_embs = get_embeddings_batch(kind_texts, batch_size=128)
        self.norm_kind_embs = [norm(v) for v in raw_embs]
        print("✅ Catálogo musical pronto!")

    def classify_vector(self, text_emb: list[float], material_type: str = None) -> tuple[dict, float]:
        norm_v = norm(text_emb)
        best_score = -1.0
        best_idx = 0

        for i, (ke, k) in enumerate(zip(self.norm_kind_embs, self.kinds)):
            cid = k.get("class_id", "")
            # Restrições de formato para evitar erros grosseiros entre áudio e partituras
            if material_type == "pdf" and cid in ["audio", "midi"]:
                continue
            if material_type == "mp3" and cid in ["partituras", "midi"]:
                continue

            score = dot(norm_v, ke)
            if score > best_score:
                best_score = score
                best_idx = i

        return self.kinds[best_idx], best_score


def diagnosticar_par(
    group: dict,
    mat_a: dict,
    mat_b: dict,
    emb_a: list[float],
    emb_b: list[float],
    classifier: DomainClassifier
) -> dict:
    """Produz o diagnóstico semântico e sugestão de ação da IA para o par."""
    mtype = group.get("material_type", "pdf")
    pname = group.get("praise_name", "")
    current_label = group.get("material_kind_label", "")
    current_kind_id = group.get("material_kind_id", "")

    path_a = mat_a.get("file_path_legacy") or ""
    path_b = mat_b.get("file_path_legacy") or ""

    sim_direta = dot(norm(emb_a), norm(emb_b))

    pred_a, conf_a = classifier.classify_vector(emb_a, material_type=mtype)
    pred_b, conf_b = classifier.classify_vector(emb_b, material_type=mtype)

    # 1. Se ambos os caminhos forem vazios -> Avaliação manual necessária
    if not path_a and not path_b:
        return {
            "categoria": "manual",
            "badge": "❓ Avaliação Manual",
            "cor": "#f59e0b",
            "titulo": "Arquivos sem caminho legado no banco",
            "explicacao": f"Ambos os arquivos têm nomes legados não preservados. Avalie visualmente os arquivos no leitor.",
            "acao_sugerida": "avaliar_manual",
            "sugestao_a": {"id": current_kind_id, "label": current_label, "confianca": 0.0},
            "sugestao_b": {"id": current_kind_id, "label": current_label, "confianca": 0.0},
            "similaridade": round(sim_direta * 100, 1),
            "confianca_geral": 50.0
        }

    # 2. Caso: Papéis musicais diferentes (Falso positivo de duplicata)
    if pred_a["id"] != pred_b["id"]:
        return {
            "categoria": "falso_positivo",
            "badge": "⚡ Falso Positivo (Reclassificar)",
            "cor": "#38bdf8",
            "titulo": f"Papéis diferentes detectados ({pred_a['label']} vs {pred_b['label']})",
            "explicacao": (
                f"O arquivo A corresponde a '{pred_a['label']}' ({conf_a:.1%}) e o arquivo B "
                f"corresponde a '{pred_b['label']}' ({conf_b:.1%}). Não exclua nenhum! "
                f"Recomendado reclassificar ambos os materiais."
            ),
            "acao_sugerida": "reclassificar_ambos",
            "sugestao_a": {"id": pred_a["id"], "label": pred_a["label"], "confianca": round(conf_a * 100, 1)},
            "sugestao_b": {"id": pred_b["id"], "label": pred_b["label"], "confianca": round(conf_b * 100, 1)},
            "similaridade": round(sim_direta * 100, 1),
            "confianca_geral": round(min(conf_a, conf_b) * 100, 1)
        }

    # 3. Caso: Mesmo papel musical (Duplicata Real ou Revisão)
    pa_lower = path_a.lower()
    pb_lower = path_b.lower()

    desatualizado_kw = ["desatualizado", "(nao usar)", "(não usar)", "antigo", "rascunho", "old", "antiga"]
    atualizado_kw = ["- ok", "_ok", "rev", "revisado", "novo", "atualizado", "final", "corrigido"]

    a_desat = any(k in pa_lower for k in desatualizado_kw)
    b_desat = any(k in pb_lower for k in desatualizado_kw)
    a_ok = any(k in pa_lower for k in atualizado_kw)
    b_ok = any(k in pb_lower for k in atualizado_kw)

    # B está desatualizado ou A é a versão OK/Rev -> Remover B
    if b_desat or (a_ok and not b_ok):
        motivo = "Arquivo A possui indicação de revisão/OK enquanto o Arquivo B parece legado/antigo."
        return {
            "categoria": "duplicata_real",
            "badge": "🚨 Duplicata Real (Remover B)",
            "cor": "#ef4444",
            "titulo": f"Duplicata real de {pred_a['label']} — Manter A e Remover B",
            "explicacao": f"Ambos são '{pred_a['label']}'. {motivo} Sugestão: remover o arquivo B.",
            "acao_sugerida": "remover_b",
            "remover_material_id": mat_b["id"],
            "sugestao_a": {"id": pred_a["id"], "label": pred_a["label"], "confianca": round(conf_a * 100, 1)},
            "sugestao_b": {"id": pred_b["id"], "label": pred_b["label"], "confianca": round(conf_b * 100, 1)},
            "similaridade": round(sim_direta * 100, 1),
            "confianca_geral": round(max(conf_a, conf_b) * 100, 1)
        }

    # A está desatualizado ou B é a versão OK/Rev -> Remover A
    if a_desat or (b_ok and not a_ok):
        motivo = "Arquivo B possui indicação de revisão/OK enquanto o Arquivo A parece legado/antigo."
        return {
            "categoria": "duplicata_real",
            "badge": "🚨 Duplicata Real (Remover A)",
            "cor": "#ef4444",
            "titulo": f"Duplicata real de {pred_a['label']} — Manter B e Remover A",
            "explicacao": f"Ambos são '{pred_a['label']}'. {motivo} Sugestão: remover o arquivo A.",
            "acao_sugerida": "remover_a",
            "remover_material_id": mat_a["id"],
            "sugestao_a": {"id": pred_a["id"], "label": pred_a["label"], "confianca": round(conf_a * 100, 1)},
            "sugestao_b": {"id": pred_b["id"], "label": pred_b["label"], "confianca": round(conf_b * 100, 1)},
            "similaridade": round(sim_direta * 100, 1),
            "confianca_geral": round(max(conf_a, conf_b) * 100, 1)
        }

    # Se há indicação de variação de arranjo ou playback
    if ("geral" in pa_lower and "instrumental" in pb_lower) or ("instrumental" in pa_lower and "geral" in pb_lower):
        return {
            "categoria": "outro_arranjo",
            "badge": "🎼 Outro Arranjo (Cantado vs Playback)",
            "cor": "#a855f7",
            "titulo": "Versão Cantada vs Instrumental / Playback",
            "explicacao": "Um arquivo é áudio geral completo e o outro é instrumental/playback. Recomenda-se manter ambos.",
            "acao_sugerida": "outro_arranjo",
            "sugestao_a": {"id": pred_a["id"], "label": pred_a["label"], "confianca": round(conf_a * 100, 1)},
            "sugestao_b": {"id": pred_b["id"], "label": pred_b["label"], "confianca": round(conf_b * 100, 1)},
            "similaridade": round(sim_direta * 100, 1),
            "confianca_geral": round(max(conf_a, conf_b) * 100, 1)
        }

    # Duplicata real genérica (mesmo papel, nomes muito parecidos)
    return {
        "categoria": "duplicata_real",
        "badge": "🚨 Duplicata Provável (Remover B)",
        "cor": "#ef4444",
        "titulo": f"Mesmo papel musical detectado ({pred_a['label']})",
        "explicacao": (
            f"Ambos correspondem a '{pred_a['label']}' com alta similaridade ({sim_direta:.1%}). "
            f"Sugestão padrão: manter o arquivo A e remover a duplicata B."
        ),
        "acao_sugerida": "remover_b",
        "remover_material_id": mat_b["id"],
        "sugestao_a": {"id": pred_a["id"], "label": pred_a["label"], "confianca": round(conf_a * 100, 1)},
        "sugestao_b": {"id": pred_b["id"], "label": pred_b["label"], "confianca": round(conf_b * 100, 1)},
        "similaridade": round(sim_direta * 100, 1),
        "confianca_geral": round(max(conf_a, conf_b) * 100, 1)
    }


def main():
    print("=" * 70)
    print(" 🎼 COLDIGOM — REFATORAÇÃO DE SUGESTÕES DE CURADORIA COM GEMMA")
    print("=" * 70)

    # 1. Carrega dados
    with open(KINDS_PATH, "r", encoding="utf-8") as f:
        kinds = json.load(f)

    with open(DUPLICATAS_PATH, "r", encoding="utf-8") as f:
        groups = json.load(f)

    print(f"📊 Carregados {len(groups)} grupos de duplicatas.")

    # 2. Prepara catalog
    classifier = DomainClassifier(kinds)

    # 3. Coleta textos de todos os materiais
    material_keys = []
    material_texts = []
    for g in groups:
        pname = g.get("praise_name", "")
        for m in g.get("materials", []):
            mid = m["id"]
            if mid not in material_keys:
                material_keys.append(mid)
                path = m.get("file_path_legacy") or m.get("r2_key") or ""
                material_texts.append(f"{pname} - {path}")

    # 4. Gera embeddings de todos os materiais em batch
    embeddings_list = get_embeddings_batch(material_texts, batch_size=128)
    emb_cache = {mid: emb for mid, emb in zip(material_keys, embeddings_list)}

    # 5. Processa cada grupo
    print("\n🔄 Gerando diagnósticos semânticos para cada grupo...")
    stats = {
        "falso_positivo": 0,
        "duplicata_real": 0,
        "outro_arranjo": 0,
        "manual": 0
    }

    enriched_groups = []
    for g in groups:
        mats = g.get("materials", [])
        if len(mats) >= 2:
            mA = mats[0]
            mB = mats[1]
            eA = emb_cache.get(mA["id"], [0.0] * 768)
            eB = emb_cache.get(mB["id"], [0.0] * 768)

            diag = diagnosticar_par(g, mA, mB, eA, eB, classifier)
            g["ai_diagnosis"] = diag
            stats[diag["categoria"]] = stats.get(diag["categoria"], 0) + 1
        else:
            g["ai_diagnosis"] = {
                "categoria": "manual",
                "badge": "❓ Avaliação Manual",
                "cor": "#f59e0b",
                "titulo": "Apenas 1 material no grupo",
                "explicacao": "Grupo sem segundo material para comparação.",
                "acao_sugerida": "manter_ambos",
                "similaridade": 0.0,
                "confianca_geral": 0.0
            }
            stats["manual"] += 1

        enriched_groups.append(g)

    # 6. Salva backup e novo arquivo
    if not DUPLICATAS_BAK_PATH.exists():
        shutil.copy2(DUPLICATAS_PATH, DUPLICATAS_BAK_PATH)
        print(f"💾 Backup do arquivo original salvo em: {DUPLICATAS_BAK_PATH}")

    with open(DUPLICATAS_PATH, "w", encoding="utf-8") as f:
        json.dump(enriched_groups, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print("🎉 REFATORAÇÃO CONCLUÍDA COM SUCESSO!")
    print(f"📁 Arquivo atualizado: {DUPLICATAS_PATH}")
    print("\n📈 Distribuição dos Diagnósticos Gerados pela IA:")
    print(f"  • ⚡ Falsos Positivos (Reclassificação sugerida): {stats['falso_positivo']}")
    print(f"  • 🚨 Duplicatas Reais (Remoção sugerida):         {stats['duplicata_real']}")
    print(f"  • 🎼 Variações de Arranjo (Manter ambos):        {stats['outro_arranjo']}")
    print(f"  • ❓ Avaliação Manual necessária:               {stats['manual']}")
    print("=" * 70)


if __name__ == "__main__":
    main()
