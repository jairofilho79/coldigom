# PRD: COLetanea DIGital Object Manager (coldigom)

## 1. Visão Geral
**Objetivo:** Criar um sistema de gestão de ativos digitais focado em organização, indexação e busca avançada de partituras (PDFs), áudios de vozes e midis (MP3) pertencentes a uma coletânea musical.
**Desafio:** Estruturar arquivos massivos através da leitura de arquivos locais `metadata.yml`, transferindo arquivos para Cloudflare R2 e metadados para Cloudflare D1.

## 1.1 Dados Atuais (Legacy)
Atualmente, toda a base de dados está na pasta `storage/` no workspace, com a seguinte estrutura:

```
storage/
├── assets/praises/<praise_id>/
│   ├── metadata.yml              # Metadados do louvor (nome, autor, letras, tags, materiais)
│   ├── <praise_material_id>.<material_kind_id>.<type>  # Arquivos (pdf, mp3, chord)
│   └── ...
├── material_kinds_unique.csv     # Catálogo de tipos de material (UUID -> nome)
└── praise_tags_unique.csv        # Catálogo de tags de louvores (UUID -> nome)
```

**Estrutura de arquivos:**
- Path: `<praise_id>/<praise_material_id>.<material_kind_id>.<type>`
- Exemplo: `5631112f-f3d7-4b7f-a53d-3897a4c69c2b/83f2bc41-ed69-4078-a84a-0d2b102b979f.5a9d9ced-a5e3-4848-adac-f02a14b56038.pdf`

**Campos do `metadata.yml`:**
- `praise_id` (UUID): Identificador único do louvor
- `praise_name` (string): Nome do louvor
- `praise_number` (string): Número na coletânea
- `praise_author` (string): Autor/Tradutor
- `praise_rhythm` (string): Ritmo
- `praise_tonality` (string): Tom
- `praise_category` (string): Categoria
- `praise_lyrics` (string): Letra completa
- `praise_tags` (array of UUIDs): Tags do louvor (ref: `praise_tags_unique.csv`)
- `praise_materiais` (array): Lista de materiais
  - `praise_material_id` (UUID): Identificador do material
  - `material_kind` (UUID): Tipo do material (ref: `material_kinds_unique.csv`)
  - `type` (string): Extensão do arquivo (pdf, mp3, chord)
  - `file_path_legacy` (string): Caminho legado
  - `source_material_id` (UUID, opcional): Material de origem para derivados

**Referência de catálogos:**
- `material_kinds_unique.csv`: ~100 tipos (Audio, Score, MIDI, Lyrics, Chord Chart, Vozes, Instrumentos, etc.)
- `praise_tags_unique.csv`: Tagsfixas (Coletânea, Avulsos, CIAs, GLTM, PES, Migrados, Diversos)

## 2. Stack Tecnológico
* **Backend / API:** Cloudflare Workers (com Hono.js).
* **Banco de Dados:** Cloudflare D1 (SQLite serverless).
* **Armazenamento:** Cloudflare R2.
* **Frontend:** Cloudflare Pages (React com Vite ou Next.js).
* **Deploy:** Cloudflare Wrangler CLI.

## 3. Modelo de Dados (Schema D1)
- **praises** (Louvores): `id` (PK, UUID), `name`, `number`, `author`, `rhythm`, `tonality`, `category`, `lyrics`.
- **materials** (Arquivos): `id` (PK, UUID), `praise_id` (FK), `material_kind` (UUID), `type` (mp3, pdf, chord), `r2_key` (caminho no R2), `file_path_legacy`, `source_material_id`.
- **praise_tags**: `praise_id`, `tag_id`.

## 4. Requisitos (Épicos)
**Épico 1: Ingestão de Dados (Script Local)**
- Script em Node.js que varre diretórios locais lendo `metadata.yml`.
- Faz upload dos arquivos referenciados para o R2 (chave: `assets/praises/{praise_id}/{material_id}.{type}`).
- Gera as queries SQL (ou insere direto no D1 local/remoto) para popular as tabelas.

**Épico 2: API (Workers + Hono)**
- Rota GET `/api/praises` com busca textual (LIKE) nos campos de título e letra.
- Rota GET `/api/praises/:id` com JOIN na tabela `materials`.

**Épico 3: Frontend**
- Interface de busca e listagem em formato de tabela/grid.
- Página de detalhes do louvor com player de áudio HTML5 embutido e visualizador/link para PDF.