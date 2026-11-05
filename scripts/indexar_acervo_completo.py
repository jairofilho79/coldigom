#!/usr/bin/env python3
"""
scripts/indexar_acervo_completo.py

Indexador Semântico Completo do Coldigom usando Gemma Embedding 2 (Ollama).
Processa os dados limpos do acervo:
1. Louvores (1.845): Metadados + Tags + Letra Completa
2. Cifras ChordPro (5.590): Metadados musicais + Acordes estruturados
3. Materiais (20.384): Classificação Semântica + Detecção de Anomalias/Conflitos

Armazenamento: data/embeddings/acervo_embeddings.sqlite
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sqlite3
import struct
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

OLLAMA_URL = "http://127.0.0.1:11434/api/embed"
MODEL_NAME = "embeddinggemma-2:latest"
REPO_ROOT = Path(__file__).resolve().parent.parent
DB_SCHEMA_PATH = REPO_ROOT / "migration" / "d1-schema.sql"
INGESTION_SQL_PATH = REPO_ROOT / "ingestion.sql"
MATERIAL_KINDS_PATH = REPO_ROOT / "curadoria-pages" / "data" / "material_kinds.json"
CHORDPRO_STAGING_DIR = REPO_ROOT / "storage" / "chordpro_staging"
DATA_DIR = REPO_ROOT / "data" / "embeddings"
SQLITE_OUT_PATH = DATA_DIR / "acervo_embeddings.sqlite"
REPORT_OUT_PATH = DATA_DIR / "relatorio_curadoria_semantica.json"
BIBLICAL_CONSOLIDATED_PATH = REPO_ROOT / "data" / "louvores-biblia-consolidado.json"


def carregar_dados_biblicos(path: Path) -> dict[str, dict[str, Any]]:
    """Carrega os metadados bíblicos consolidados canônicos se disponíveis."""
    if not path.exists():
        print(f"⚠️ Metadados bíblicos não encontrados em {path}.")
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            print(f"📖 {len(data)} louvores com metadados bíblicos carregados de {path.name}.")
            return data
    except Exception as e:
        print(f"⚠️ Falha ao ler {path}: {e}")
        return {}


def vector_to_blob(vec: list[float]) -> bytes:
    """Converte lista de floats em bytes compactos (float32)."""
    return struct.pack(f"{len(vec)}f", *vec)


def blob_to_vector(b: bytes) -> list[float]:
    """Converte bytes compactos em lista de floats."""
    n = len(b) // 4
    return list(struct.unpack(f"{n}f", b))


def normalize(v: list[float]) -> list[float]:
    """Normaliza um vetor para norma 1 (unitária)."""
    norm = sum(x * x for x in v) ** 0.5
    if norm == 0:
        return v
    return [x / norm for x in v]


def dot_product(v1: list[float], v2: list[float]) -> float:
    """Produto escalar entre vetores unitários (similaridade de cosseno)."""
    return sum(a * b for a, b in zip(v1, v2))


class OllamaClient:
    def __init__(self, model: str = MODEL_NAME, url: str = OLLAMA_URL):
        self.model = model
        self.url = url
        self._test_connection()

    def _test_connection(self) -> None:
        try:
            embs = self.get_embeddings(["coldigom teste"])
            if not embs or len(embs[0]) == 0:
                raise RuntimeError("Resposta vazia do modelo.")
            print(f"✅ Conexão com Ollama ativa! Modelo '{self.model}', dimensão: {len(embs[0])}d")
        except Exception as e:
            print(f"❌ Erro ao conectar ao Ollama ({self.url}): {e}", file=sys.stderr)
            print("Certifique-se de que o Ollama está aberto com o modelo baixado.", file=sys.stderr)
            sys.exit(1)

    def get_embeddings(self, texts: list[str], max_retries: int = 3) -> list[list[float]]:
        if not texts:
            return []
        
        # Limita textos muito longos por segurança (contexto seguro: 30k caracteres)
        cleaned_texts = [t[:32000].strip() or "texto vazio" for t in texts]

        payload = json.dumps({"model": self.model, "input": cleaned_texts}).encode("utf-8")
        req = urllib.request.Request(
            self.url,
            data=payload,
            headers={"Content-Type": "application/json"}
        )

        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data.get("embeddings", [])
            except Exception as e:
                if attempt == max_retries - 1:
                    raise RuntimeError(f"Falha na requisição ao Ollama após {max_retries} tentativas: {e}")
                time.sleep(1.0 * (attempt + 1))
        return []


class SemanticCatalog:
    def __init__(self, client: OllamaClient, kinds_data: list[dict]):
        self.client = client
        self.kinds = kinds_data
        self.kind_ids = [k["id"] for k in self.kinds]
        self.kind_names = [k["name"] for k in self.kinds]
        self.kind_labels = [k.get("label", k["name"]) for k in self.kinds]
        self.kind_classes = [k.get("class_id", "") for k in self.kinds]

        # Descrição rica para orientar o embedding de cada tipo de material
        self.rich_descriptions = [
            f"{k.get('label', k['name'])} ({k['name']}) - categoria: {k.get('class_id', '')}"
            for k in self.kinds
        ]

        print(f"🔄 Gerando embeddings de referência para {len(self.kinds)} tipos de materiais...")
        raw_embs = self.client.get_embeddings(self.rich_descriptions)
        self.norm_embs = [normalize(v) for v in raw_embs]
        print("✅ Embeddings do catálogo de materiais prontos!")

    def classify(self, text_emb: list[float], material_type: str = None) -> tuple[str, str, float]:
        """Classifica um material contra o catálogo e retorna (predicted_id, predicted_label, confidence)."""
        norm_v = normalize(text_emb)
        best_idx = -1
        best_score = -1.0

        for i, (k_emb, cid) in enumerate(zip(self.norm_embs, self.kind_classes)):
            # Heurística suave de formato para evitar ruídos extremos
            if material_type == "pdf" and cid in ["audio", "midi"]:
                continue
            if material_type == "mp3" and cid in ["partituras", "midi"]:
                continue

            score = dot_product(norm_v, k_emb)
            if score > best_score:
                best_score = score
                best_idx = i

        if best_idx >= 0:
            return self.kind_ids[best_idx], self.kind_labels[best_idx], best_score
        return self.kind_ids[0], self.kind_labels[0], 0.0


def init_db(db_path: Path) -> sqlite3.Connection:
    """Inicializa banco SQLite de embeddings com schema estruturado."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS praises_semantic (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                number TEXT,
                author TEXT,
                category TEXT,
                rhythm TEXT,
                tonality TEXT,
                tags TEXT,
                has_lyrics INTEGER,
                biblical_reference TEXT,
                biblical_summary TEXT,
                homiletic_themes TEXT,
                text_indexed TEXT,
                embedding BLOB,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        # Migração idempotente se a tabela já existia sem as novas colunas
        cursor = conn.cursor()
        cols = {row[1] for row in cursor.execute("PRAGMA table_info(praises_semantic)").fetchall()}
        for col_name, col_type in [
            ("biblical_reference", "TEXT"),
            ("biblical_summary", "TEXT"),
            ("homiletic_themes", "TEXT"),
        ]:
            if col_name not in cols:
                conn.execute(f"ALTER TABLE praises_semantic ADD COLUMN {col_name} {col_type};")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS materials_semantic (
                id TEXT PRIMARY KEY,
                praise_id TEXT NOT NULL,
                praise_name TEXT,
                type TEXT,
                file_path_legacy TEXT,
                current_kind_id TEXT,
                current_kind_name TEXT,
                predicted_kind_id TEXT,
                predicted_kind_name TEXT,
                confidence REAL,
                is_mismatch INTEGER,
                text_indexed TEXT,
                embedding BLOB,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chords_semantic (
                id TEXT PRIMARY KEY,
                praise_id TEXT,
                material_id TEXT,
                filename TEXT,
                title TEXT,
                subtitle TEXT,
                key TEXT,
                rhythm TEXT,
                text_indexed TEXT,
                embedding BLOB,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mat_praise ON materials_semantic (praise_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mat_mismatch ON materials_semantic (is_mismatch, confidence);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chords_praise ON chords_semantic (praise_id);")
    return conn


def carregar_dados_ingestao() -> tuple[list[dict], list[dict]]:
    """Carrega praises e praise_materials do SQL em memória."""
    print("🔄 Carregando acervo oficial a partir do esquema e ingestão...")
    t0 = time.time()
    mem_conn = sqlite3.connect(":memory:")
    with open(DB_SCHEMA_PATH, "r", encoding="utf-8") as f:
        mem_conn.executescript(f.read())
    with open(INGESTION_SQL_PATH, "r", encoding="utf-8") as f:
        mem_conn.executescript(f.read())

    c = mem_conn.cursor()
    # 1. Praises com tags agregadas
    praises_raw = c.execute("""
        SELECT p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics,
               GROUP_CONCAT(t.name, ', ') AS tags
        FROM praises p
        LEFT JOIN praise_tags pt ON pt.praise_id = p.id
        LEFT JOIN tags t ON t.id = pt.tag_id
        GROUP BY p.id
        ORDER BY CAST(p.number AS INTEGER), p.name
    """).fetchall()

    praises = [
        {
            "id": r[0],
            "name": r[1] or "",
            "number": r[2] or "",
            "author": r[3] or "",
            "rhythm": r[4] or "",
            "tonality": r[5] or "",
            "category": r[6] or "",
            "lyrics": r[7] or "",
            "tags": r[8] or ""
        }
        for r in praises_raw
    ]

    # 2. Materials com nomes de praises e current kind
    materials_raw = c.execute("""
        SELECT pm.id, pm.praise_id, p.name AS praise_name, pm.type, pm.file_path_legacy,
               pm.material_kind AS current_kind_id,
               COALESCE(mk.name, '') AS current_kind_name
        FROM praise_materials pm
        JOIN praises p ON p.id = pm.praise_id
        LEFT JOIN material_kinds mk ON mk.id = pm.material_kind
        ORDER BY p.name, pm.type
    """).fetchall()

    materials = [
        {
            "id": r[0],
            "praise_id": r[1],
            "praise_name": r[2] or "",
            "type": r[3] or "",
            "file_path_legacy": r[4] or "",
            "current_kind_id": r[5] or "",
            "current_kind_name": r[6] or ""
        }
        for r in materials_raw
    ]

    mem_conn.close()
    print(f"✅ Acervo carregado em {time.time() - t0:.2f}s: {len(praises)} louvores e {len(materials)} materiais.")
    return praises, materials


def carregar_cifras_chordpro() -> list[dict]:
    """Carrega os arquivos .chordpro limpos em storage/chordpro_staging/."""
    print("🔄 Localizando arquivos .chordpro estruturados...")
    cifras = []
    source_caches = {}

    for source_file in CHORDPRO_STAGING_DIR.glob("*/_source.json"):
        try:
            with open(source_file, "r", encoding="utf-8") as f:
                source_caches[source_file.parent.name] = json.load(f)
        except Exception:
            pass

    for chord_path in CHORDPRO_STAGING_DIR.glob("*/*.chordpro"):
        parent_dir = chord_path.parent.name
        source = source_caches.get(parent_dir, {})

        try:
            content = chord_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Extrai tags ChordPro
        title_m = re.search(r"\{title:\s*([^}]+)\}", content, re.IGNORECASE)
        subtitle_m = re.search(r"\{subtitle:\s*([^}]+)\}", content, re.IGNORECASE)
        key_m = re.search(r"\{key:\s*([^}]+)\}", content, re.IGNORECASE)
        rhythm_m = re.search(r"\{rhythm:\s*([^}]+)\}", content, re.IGNORECASE)

        title = title_m.group(1).strip() if title_m else chord_path.stem
        subtitle = subtitle_m.group(1).strip() if subtitle_m else ""
        key = key_m.group(1).strip() if key_m else ""
        rhythm = rhythm_m.group(1).strip() if rhythm_m else ""

        cifras.append({
            "id": f"{parent_dir}_{chord_path.name}",
            "praise_id": source.get("praise_id", ""),
            "material_id": parent_dir,
            "filename": chord_path.name,
            "title": title,
            "subtitle": subtitle,
            "key": key,
            "rhythm": rhythm,
            "body": content[:8000]  # Corpo cifrado
        })

    print(f"✅ Encontradas {len(cifras)} cifras ChordPro estruturadas.")
    return cifras


def processar_louvores(
    client: OllamaClient,
    conn: sqlite3.Connection,
    praises: list[dict],
    batch_size: int = 64,
    reindex: bool = False,
    biblical_data: dict[str, dict[str, Any]] | None = None
) -> None:
    """Indexa e gera embeddings para louvores e letras enriquecidos com metadados bíblicos."""
    print("\n" + "=" * 60)
    print(f"🎼 ETAPA 1/3: INDEXANDO LOUVORES E LETRAS ({len(praises)} registros)")
    print("=" * 60)

    if biblical_data is None:
        biblical_data = carregar_dados_biblicos(BIBLICAL_CONSOLIDATED_PATH)

    # Identifica o que processar
    if not reindex:
        existing_ids = set(r[0] for r in conn.execute("SELECT id FROM praises_semantic").fetchall())
        to_process = [p for p in praises if p["id"] not in existing_ids]
    else:
        to_process = praises

    if not to_process:
        print(f"✅ Todos os {len(praises)} louvores já estão indexados no banco!")
        return

    print(f"🔄 Processando {len(to_process)} louvores {'(reindexação forçada) ' if reindex else ''}em lotes de {batch_size}...")
    t0 = time.time()

    for i in range(0, len(to_process), batch_size):
        batch = to_process[i : i + batch_size]
        textos = []
        meta_extra = []

        for p in batch:
            bib = biblical_data.get(p["id"]) if biblical_data else None
            ref_principal = ""
            resumo_1l = ""
            temas_str = ""
            msg_central = ""
            pericopes_desc = []

            if bib:
                ref_principal = (bib.get("referencia_principal") or "").strip()
                resumo_1l = (bib.get("resumo_uma_linha") or "").strip()
                temas = bib.get("temas_homileticos") or []
                temas_str = ", ".join(t.strip() for t in temas if t.strip())
                msg_central = (bib.get("mensagem_central") or "").strip()
                pericopes = bib.get("pericopes_relacionadas") or []
                for per in pericopes[:3]:
                    ref = per.get("referencia", "").strip()
                    tit = per.get("titulo", "").strip()
                    if ref and tit:
                        pericopes_desc.append(f"{ref} ({tit})")
                    elif ref:
                        pericopes_desc.append(ref)

            linhas = [
                f"Louvor: {p['name']} (Nº {p['number'] or 'S/N'})",
                f"Autor: {p['author'] or 'Desconhecido'} | Categoria: {p['category'] or 'Geral'}",
                f"Ritmo: {p['rhythm'] or '-'} | Tom: {p['tonality'] or '-'} | Tags: {p['tags'] or '-'}",
            ]
            if ref_principal:
                linhas.append(f"Referência Bíblica: {ref_principal}")
            if temas_str:
                linhas.append(f"Temas Homiléticos: {temas_str}")
            if msg_central:
                linhas.append(f"Mensagem Teológica: {msg_central}")
            if pericopes_desc:
                linhas.append(f"Passagens Relacionadas: {'; '.join(pericopes_desc)}")
            linhas.append(f"Letra Completa:\n{p['lyrics'] or '(sem letra cadastrada)'}")
            texto = "\n".join(linhas)

            textos.append(texto)
            meta_extra.append((ref_principal, resumo_1l, temas_str))

        embs = client.get_embeddings(textos)

        rows = []
        for p, txt, emb, (ref, res, tem) in zip(batch, textos, embs, meta_extra):
            has_lyrics = 1 if p["lyrics"].strip() else 0
            rows.append((
                p["id"], p["name"], p["number"], p["author"], p["category"],
                p["rhythm"], p["tonality"], p["tags"], has_lyrics,
                ref, res, tem, txt,
                vector_to_blob(emb)
            ))

        with conn:
            conn.executemany("""
                INSERT OR REPLACE INTO praises_semantic 
                (id, name, number, author, category, rhythm, tonality, tags, has_lyrics,
                 biblical_reference, biblical_summary, homiletic_themes, text_indexed, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, rows)

        pct = (i + len(batch)) / len(to_process) * 100
        print(f"  -> Progresso: {i + len(batch)}/{len(to_process)} ({pct:.1f}%) louvores indexados...")

    print(f"✅ Etapa 1 concluída em {time.time() - t0:.1f}s!")


def processar_cifras(client: OllamaClient, conn: sqlite3.Connection, cifras: list[dict], batch_size: int = 64) -> None:
    """Indexa e gera embeddings para cifras ChordPro."""
    print("\n" + "=" * 60)
    print(f"🎸 ETAPA 2/3: INDEXANDO CIFRAS CHORDPRO ({len(cifras)} registros)")
    print("=" * 60)

    existing_ids = set(r[0] for r in conn.execute("SELECT id FROM chords_semantic").fetchall())
    to_process = [c for c in cifras if c["id"] not in existing_ids]

    if not to_process:
        print(f"✅ Todas as {len(cifras)} cifras já estão indexadas no banco!")
        return

    print(f"🔄 Processando {len(to_process)} cifras pendentes em lotes de {batch_size}...")
    t0 = time.time()

    for i in range(0, len(to_process), batch_size):
        batch = to_process[i : i + batch_size]
        textos = []

        for c in batch:
            texto = (
                f"Cifra: {c['title']} ({c['subtitle']})\n"
                f"Tom: {c['key']} | Ritmo: {c['rhythm']}\n"
                f"Conteúdo:\n{c['body']}"
            )
            textos.append(texto)

        embs = client.get_embeddings(textos)

        rows = []
        for c, txt, emb in zip(batch, textos, embs):
            rows.append((
                c["id"], c["praise_id"], c["material_id"], c["filename"],
                c["title"], c["subtitle"], c["key"], c["rhythm"], txt,
                vector_to_blob(emb)
            ))

        with conn:
            conn.executemany("""
                INSERT OR REPLACE INTO chords_semantic 
                (id, praise_id, material_id, filename, title, subtitle, key, rhythm, text_indexed, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, rows)

        pct = (i + len(batch)) / len(to_process) * 100
        print(f"  -> Progresso: {i + len(batch)}/{len(to_process)} ({pct:.1f}%) cifras indexadas...")

    print(f"✅ Etapa 2 concluída em {time.time() - t0:.1f}s!")


def processar_materiais(
    client: OllamaClient,
    conn: sqlite3.Connection,
    catalog: SemanticCatalog,
    materials: list[dict],
    batch_size: int = 128
) -> None:
    """Indexa, gera embeddings e classifica materiais contra o catálogo."""
    print("\n" + "=" * 60)
    print(f"📁 ETAPA 3/3: INDEXANDO E CLASSIFICANDO MATERIAIS ({len(materials)} registros)")
    print("=" * 60)

    existing_ids = set(r[0] for r in conn.execute("SELECT id FROM materials_semantic").fetchall())
    to_process = [m for m in materials if m["id"] not in existing_ids]

    if not to_process:
        print(f"✅ Todos os {len(materials)} materiais já estão indexados no banco!")
        return

    print(f"🔄 Processando {len(to_process)} materiais em lotes de {batch_size}...")
    t0 = time.time()
    mismatches_count = 0

    for i in range(0, len(to_process), batch_size):
        batch = to_process[i : i + batch_size]
        textos = []

        for m in batch:
            texto = (
                f"Louvor: {m['praise_name']}. "
                f"Arquivo: {m['file_path_legacy'] or m['id']}. "
                f"Formato: {m['type']}."
            )
            textos.append(texto)

        embs = client.get_embeddings(textos)

        rows = []
        for m, txt, emb in zip(batch, textos, embs):
            pred_id, pred_label, conf = catalog.classify(emb, material_type=m["type"])
            is_mismatch = 1 if (pred_id != m["current_kind_id"] and conf >= 0.70) else 0
            if is_mismatch:
                mismatches_count += 1

            rows.append((
                m["id"], m["praise_id"], m["praise_name"], m["type"],
                m["file_path_legacy"], m["current_kind_id"], m["current_kind_name"],
                pred_id, pred_label, float(conf), is_mismatch, txt,
                vector_to_blob(emb)
            ))

        with conn:
            conn.executemany("""
                INSERT OR REPLACE INTO materials_semantic 
                (id, praise_id, praise_name, type, file_path_legacy, current_kind_id, current_kind_name,
                 predicted_kind_id, predicted_kind_name, confidence, is_mismatch, text_indexed, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, rows)

        pct = (i + len(batch)) / len(to_process) * 100
        print(f"  -> Progresso: {i + len(batch)}/{len(to_process)} ({pct:.1f}%) materiais processados...")

    print(f"✅ Etapa 3 concluída em {time.time() - t0:.1f}s! Mismatches identificados neste lote: {mismatches_count}")


def gerar_relatorio_curadoria(conn: sqlite3.Connection) -> dict:
    """Gera relatório analítico consolidado sobre a saúde e curadoria do acervo."""
    print("\n" + "=" * 60)
    print("📊 GERANDO RELATÓRIO CONSOLIDADO DE CURADORIA SEMÂNTICA...")
    print("=" * 60)

    total_praises = conn.execute("SELECT COUNT(*) FROM praises_semantic").fetchone()[0]
    total_praises_lyrics = conn.execute("SELECT COUNT(*) FROM praises_semantic WHERE has_lyrics = 1").fetchone()[0]
    total_chords = conn.execute("SELECT COUNT(*) FROM chords_semantic").fetchone()[0]
    total_materials = conn.execute("SELECT COUNT(*) FROM materials_semantic").fetchone()[0]

    # Materiais com mismatch de alta confiança (divergência clara)
    high_conf_mismatches = conn.execute("""
        SELECT praise_name, file_path_legacy, type, current_kind_name, predicted_kind_name, confidence
        FROM materials_semantic
        WHERE is_mismatch = 1 AND confidence >= 0.85
        ORDER BY confidence DESC
        LIMIT 50
    """).fetchall()

    total_mismatches = conn.execute("SELECT COUNT(*) FROM materials_semantic WHERE is_mismatch = 1").fetchone()[0]
    total_high_conf = conn.execute("SELECT COUNT(*) FROM materials_semantic WHERE is_mismatch = 1 AND confidence >= 0.85").fetchone()[0]

    relatorio = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "estatisticas_gerais": {
            "total_louvores": total_praises,
            "louvores_com_letra": total_praises_lyrics,
            "total_cifras_chordpro": total_chords,
            "total_materiais": total_materials,
            "total_divergencias_classificacao": total_mismatches,
            "divergencias_alta_confianca_85pct": total_high_conf
        },
        "amostra_divergencias_prioritarias": [
            {
                "louvor": r[0],
                "arquivo": r[1],
                "formato": r[2],
                "classificacao_atual": r[3],
                "classificacao_sugerida": r[4],
                "confianca": round(r[5] * 100, 1)
            }
            for r in high_conf_mismatches
        ]
    }

    with open(REPORT_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(relatorio, f, indent=2, ensure_ascii=False)

    print(f"📈 Resumo do Acervo:")
    print(f"  • Louvores Indexados:        {total_praises} ({total_praises_lyrics} com letras completas)")
    print(f"  • Cifras ChordPro Indexadas: {total_chords}")
    print(f"  • Materiais Indexados:       {total_materials}")
    print(f"  • Divergências Identificadas:{total_mismatches} (sendo {total_high_conf} com >85% de certeza)")
    print(f"✅ Relatório salvo em: {REPORT_OUT_PATH}")

    return relatorio


def main():
    parser = argparse.ArgumentParser(description="Indexador Semântico do Coldigom via Gemma Embedding 2")
    parser.add_argument("--limit", type=int, default=0, help="Limita quantidade para teste piloto (0 = sem limite)")
    parser.add_argument("--batch-size", type=int, default=64, help="Tamanho do lote de embedding")
    parser.add_argument("--relatorio-only", action="store_true", help="Apenas gera o relatório com dados existentes")
    parser.add_argument("--reindex-praises", action="store_true", help="Força reindexação de todos os louvores enriquecidos")
    parser.add_argument("--only-praises", action="store_true", help="Executa apenas a etapa de louvores (pula cifras e materiais)")
    args = parser.parse_args()

    conn = init_db(SQLITE_OUT_PATH)

    if args.relatorio_only:
        gerar_relatorio_curadoria(conn)
        return

    client = OllamaClient()

    if args.only_praises:
        praises, _ = carregar_dados_ingestao()
        if args.limit > 0:
            print(f"\n⚠️  MODO PILOTO ATIVO: Limitando a {args.limit} louvores.")
            praises = praises[: args.limit]
        biblical_data = carregar_dados_biblicos(BIBLICAL_CONSOLIDATED_PATH)
        processar_louvores(client, conn, praises, batch_size=args.batch_size, reindex=args.reindex_praises, biblical_data=biblical_data)
        conn.close()
        print("\n" + "=" * 60)
        print("🎉 INDEXAÇÃO SEMÂNTICA DE LOUVORES CONCLUÍDA COM SUCESSO!")
        print(f"📁 Banco de dados atualizado: {SQLITE_OUT_PATH}")
        print("=" * 60)
        return

    with open(MATERIAL_KINDS_PATH, "r", encoding="utf-8") as f:
        kinds_data = json.load(f)

    catalog = SemanticCatalog(client, kinds_data)

    praises, materials = carregar_dados_ingestao()
    cifras = carregar_cifras_chordpro()

    if args.limit > 0:
        print(f"\n⚠️  MODO PILOTO ATIVO: Limitando a {args.limit} registros de cada entidade.")
        praises = praises[: args.limit]
        cifras = cifras[: args.limit]
        materials = materials[: args.limit]

    biblical_data = carregar_dados_biblicos(BIBLICAL_CONSOLIDATED_PATH)

    # Processamento sequencial das 3 etapas limpas
    processar_louvores(client, conn, praises, batch_size=args.batch_size, reindex=args.reindex_praises, biblical_data=biblical_data)
    processar_cifras(client, conn, cifras, batch_size=args.batch_size)
    processar_materiais(client, conn, catalog, materials, batch_size=min(128, args.batch_size * 2))

    gerar_relatorio_curadoria(conn)
    conn.close()

    print("\n" + "=" * 60)
    print("🎉 INDEXAÇÃO SEMÂNTICA CONCLUÍDA COM SUCESSO!")
    print(f"📁 Banco de dados gerado: {SQLITE_OUT_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
