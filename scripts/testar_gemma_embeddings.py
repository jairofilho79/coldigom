#!/usr/bin/env python3
"""
scripts/testar_gemma_embeddings.py

Script para testar e validar o uso do modelo Gemma Embedding 2 (via Ollama local)
na análise semântica dos dados do Coldigom.

Funcionalidades:
1. Diagnóstico do Ollama e do modelo `embeddinggemma-2:latest`
2. Classificação semântica de arquivos (Zero-Shot Classifier contra os 121 material_kinds)
3. Comparação de similaridade entre materiais (detecção de duplicatas reais vs falsos positivos)
4. Diagnóstico de grupos de materiais conflitantes
"""

import json
import math
import os
import sys
import urllib.request
from pathlib import Path

OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL_NAME = "embeddinggemma-2:latest"
REPO_ROOT = Path(__file__).resolve().parent.parent
KINDS_PATH = REPO_ROOT / "curadoria-pages" / "data" / "material_kinds.json"


def obter_embeddings(textos: list[str]) -> list[list[float]]:
    """Gera vetores de embedding para uma lista de textos via Ollama."""
    payload = json.dumps({"model": MODEL_NAME, "input": textos}).encode("utf-8")
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("embeddings", [])
    except Exception as e:
        print(f"❌ Erro ao conectar ao Ollama: {e}", file=sys.stderr)
        sys.exit(1)


def similaridade_cosseno(v1: list[float], v2: list[float]) -> float:
    """Calcula a similaridade de cosseno entre dois vetores (0.0 a 1.0)."""
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


class AvaliadorSemanticoGemma:
    def __init__(self):
        print(f"🔄 Carregando catálogo de tipos de material...")
        with open(KINDS_PATH, "r", encoding="utf-8") as f:
            self.kinds = json.load(f)

        # Monta descrições ricas em português e inglês para o catálogo
        self.kind_labels = [
            f"{k['label']} ({k['name']}) - categoria: {k.get('class_id', '')}"
            for k in self.kinds
        ]
        print(f"🔄 Gerando embeddings para {len(self.kinds)} tipos de material no Gemma...")
        self.kind_embeddings = obter_embeddings(self.kind_labels)
        print("✅ Catálogo pronto para classificação!\n")

    def classificar(self, nome_arquivo: str, tipo_formato: str = None, top_n: int = 3) -> list[tuple[dict, float]]:
        """Prevê quais tipos de material melhor correspondem ao arquivo.
        
        Permite filtrar pelo tipo_formato ('pdf', 'mp3', 'chord') para evitar ruído entre áudio e partituras.
        """
        emb = obter_embeddings([nome_arquivo])[0]
        candidatos = []
        for kind, k_emb in zip(self.kinds, self.kind_embeddings):
            # Se especificado tipo_formato, prioriza ou filtra
            if tipo_formato:
                cid = kind.get("class_id", "")
                if tipo_formato == "pdf" and cid in ["audio", "midi"]:
                    continue
                if tipo_formato == "mp3" and cid in ["partituras", "madeiras", "metais", "cordas", "percussao"]:
                    # No Coldigom, instrumentos de orquestra em PDF são partituras, em MP3 são vozes/áudio
                    pass
            sim = similaridade_cosseno(emb, k_emb)
            candidatos.append((kind, sim))
            
        candidatos.sort(key=lambda x: x[1], reverse=True)
        return candidatos[:top_n]

    def comparar_par(self, arq1: str, arq2: str, tipo_formato: str = None) -> dict:
        """Compara dois arquivos e diagnostica a relação semântica entre eles."""
        e1, e2 = obter_embeddings([arq1, arq2])
        sim_direta = similaridade_cosseno(e1, e2)

        pred1 = self.classificar(arq1, tipo_formato=tipo_formato, top_n=1)[0]
        pred2 = self.classificar(arq2, tipo_formato=tipo_formato, top_n=1)[0]

        mesmo_papel = pred1[0]["id"] == pred2[0]["id"]

        if mesmo_papel:
            status = "🚨 DUPLICATA REAL / REVISÃO (Mesmo papel musical detectado)"
            detalhe = f"Ambos correspondem a '{pred1[0]['label']}'."
        else:
            status = "✅ FALSO POSITIVO DE DUPLICATA (Papéis musicais diferentes)"
            detalhe = f"Arquivo 1 é '{pred1[0]['label']}' e Arquivo 2 é '{pred2[0]['label']}'."

        return {
            "arquivo_1": arq1,
            "pred_1": f"{pred1[0]['label']} ({pred1[1]:.1%})",
            "arquivo_2": arq2,
            "pred_2": f"{pred2[0]['label']} ({pred2[1]:.1%})",
            "similaridade_nome": f"{sim_direta:.1%}",
            "diagnostico": status,
            "detalhe": detalhe,
        }


def main():
    print("=" * 75)
    print(" 🎼 COLDIGOM — AVALIADOR SEMÂNTICO COM GEMMA EMBEDDING 2 (Ollama)")
    print("=" * 75)

    avaliador = AvaliadorSemanticoGemma()

    print("--- CASO 1: Classificação Semântica Automática (Zero-Shot) ---")
    arquivos_teste = [
        ("04 - QUANDO TE - 1° CONTRALTO.mp3", "mp3"),
        ("04 - QUANDO TE - 2° CONTRALTO.mp3", "mp3"),
        ("04 - QUANDO TE - 1° TENOR.mp3", "mp3"),
        ("04 - QUANDO TE - 2° TENOR.mp3", "mp3"),
        ("Clamando Estou - Saxalto - OK.pdf", "pdf"),
        ("Clamando Estou - Alto Saxophone.pdf", "pdf"),
        ("Clamando Estou - trompete - OK.pdf", "pdf"),
        ("ÁUDIO - Clamando Estou - Geral.mp3", "mp3"),
        ("ÁUDIO - Clamando Estou - Instrumental (Final desatualizado).mp3", "mp3"),
        ("Deixa Meu Povo Ir - Cifra.chord", "chord"),
    ]

    for arq, fmt in arquivos_teste:
        preds = avaliador.classificar(arq, tipo_formato=fmt, top_n=2)
        top = preds[0]
        print(f"📄 Arquivo: {arq}")
        print(f"   -> Sugestão principal: {top[0]['label']} ({top[0]['name']}) | Afinidade: {top[1]:.1%}")
        if len(preds) > 1:
            segundo = preds[1]
            print(f"   -> 2ª Opção:          {segundo[0]['label']} ({segundo[0]['name']}) | Afinidade: {segundo[1]:.1%}")
        print()

    print("--- CASO 2: Diagnóstico Semântico de Conflitos do Acervo ---")
    pares_conflitantes = [
        (
            "04 - QUANDO TE - 1° CONTRALTO.mp3",
            "04 - QUANDO TE - 2° CONTRALTO.mp3",
            "mp3"
        ),
        (
            "Clamando Estou - Saxalto - OK.pdf",
            "Clamando Estou - Alto Saxophone.pdf",
            "pdf"
        ),
        (
            "ÁUDIO - Clamando Estou - Geral.mp3",
            "ÁUDIO - Clamando Estou - Instrumental (Final desatualizado).mp3",
            "mp3"
        ),
    ]

    for a1, a2, fmt in pares_conflitantes:
        diag = avaliador.comparar_par(a1, a2, tipo_formato=fmt)
        print(f"Par Conflitante:")
        print(f"  [Arquivo 1] {diag['arquivo_1']} -> {diag['pred_1']}")
        print(f"  [Arquivo 2] {diag['arquivo_2']} -> {diag['pred_2']}")
        print(f"  Diagnóstico: {diag['diagnostico']}")
        print(f"  Explicação:  {diag['detalhe']}\n")

    print("=" * 75)
    print("✅ Todos os testes foram executados com sucesso no modelo local!")
    print("=" * 75)


if __name__ == "__main__":
    main()
