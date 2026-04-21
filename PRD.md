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
- `praise_materials` (array): Lista de materiais. *Nota: o YAML legado usa a grafia errada `praise_materiais`.*
  - `praise_material_id` (UUID): Identificador do material
  - `material_kind` (UUID): Tipo do material (ref: `material_kinds_unique.csv`)
  - `type` (string): Extensão do arquivo (pdf, mp3, chord, gestures)
  - `file_path_legacy` (string): Caminho legado
  - `source_material_id` (UUID, opcional): Material de origem para derivados
  - `url` (string, opcional): Link externo (YouTube, Google Drive, Spotify, etc.) para materiais sem arquivo local
  - `material_type` (string, legado): Sinônimo de `type` presente em alguns YAMLs antigos; deve ser normalizado para `type` durante a ingestão

**Referência de catálogos (tabelas lookup no D1):**
- `material_kinds_unique.csv` → tabela `material_kinds`: ~100 tipos (Audio, Score, MIDI, Lyrics, Chord Chart, Vozes, Instrumentos, etc.)
- `praise_tags_unique.csv` → tabela `tags`: Tags fixas (Coletânea, Avulsos, CIAs, GLTM, PES, Migrados, Diversos)

**Regras de ingestão:**
- Ignorar completamente `metadata.yml` vazio (ex: 0 bytes).
- Ignorar completamente arquivos auxiliares como `metadata_from_chords.yml`.
- Normalizar `material_type` → `type` quando encontrado no YAML legado.
- Preservar `url` quando presente; nesses casos não há arquivo local para upload ao R2.

## 2. Stack Tecnológico
* **Backend / API:** Cloudflare Workers (com Hono.js).
* **Banco de Dados:** Cloudflare D1 (SQLite serverless).
* **Armazenamento:** Cloudflare R2.
* **Frontend:** Cloudflare Pages (React com Vite ou Next.js).
* **Deploy:** Cloudflare Wrangler CLI.

## 3. Modelo de Dados (Schema D1)

O schema D1 contém **5 entidades** e **4 relacionamentos** com as seguintes cardinalidades:

### Entidades

| # | Entidade | Descrição | PK |
|---|----------|-----------|----|
| 1 | `praises` | Louvores/hinos da coletânea | `id` (UUID) |
| 2 | `tags` | Tags de classificação dos louvores | `id` (UUID) |
| 3 | `material_kinds` | Tipos de material (instrumento, áudio, partitura etc.) | `id` (UUID) |
| 4 | `praise_materials` | Materiais/arquivos de cada louvor | `id` (UUID) |
| 5 | `praise_tags` | Tabela de junção N:M entre praises e tags | (`praise_id`, `tag_id`) |

### Relacionamentos e Cardinalidades

| # | Entidades Envolvidas | Cardinalidade | Descrição | FK(s) |
|---|----------------------|---------------|-----------|-------|
| R1 | `praises` → `praise_materials` | **1:N** | Um louvor pode ter muitos materiais. Cada material pertence a exatamente um louvor. | `praise_materials.praise_id` → `praises.id` |
| R2 | `material_kinds` → `praise_materials` | **1:N** | Um tipo de material pode estar em muitos materiais. Cada material tem exatamente um tipo. | `praise_materials.material_kind` → `material_kinds.id` |
| R3 | `praises` ↔ `tags` | **N:M** | Um louvor pode ter várias tags. Uma tag pode estar em vários louvores. Implementado via `praise_tags`. | `praise_tags.praise_id` + `praise_tags.tag_id` |
| R4 | `praise_materials` → `praise_materials` | **1:N** (auto-relacionamento) | Um material pode ser fonte de muitos materiais derivados. Um material derivado tem no máximo uma fonte. | `praise_materials.source_material_id` → `praise_materials.id` (sem constraint FK) |

### Atributos por Entidade

#### `praises`
- `id`: UUID, PK, NOT NULL
- `name`: string, NOT NULL
- `number`: string (número na coletânea), opcional
- `author`: string (autor/tradutor), opcional
- `rhythm`: string, opcional
- `tonality`: string, opcional
- `category`: string, opcional
- `lyrics`: text, opcional
- `created_at`: datetime, DEFAULT CURRENT_TIMESTAMP
- `updated_at`: datetime, DEFAULT CURRENT_TIMESTAMP

#### `tags`
- `id`: UUID, PK, NOT NULL
- `name`: string, NOT NULL, UNIQUE

#### `material_kinds`
- `id`: UUID, PK, NOT NULL
- `name`: string, NOT NULL, UNIQUE

#### `praise_materials`
- `id`: UUID, PK, NOT NULL
- `praise_id`: UUID, NOT NULL, FK → `praises.id` (ON DELETE CASCADE)
- `material_kind`: UUID, NOT NULL, FK → `material_kinds.id`
- `type`: string, NOT NULL (valores: `pdf`, `mp3`, `chord`, `gestures`)
- `r2_key`: string, **NULLABLE** — caminho no R2. É NULL quando `url` está presente.
- `file_path_legacy`: string, opcional — caminho legado do arquivo
- `source_material_id`: UUID, opcional — material de origem para derivados. **Sem constraint FK**.
- `url`: string, opcional — link externo (YouTube, Google Drive, Spotify etc.) para materiais sem arquivo local
- `created_at`: datetime, DEFAULT CURRENT_TIMESTAMP

#### `praise_tags`
- `praise_id`: UUID, NOT NULL, FK → `praises.id` (ON DELETE CASCADE)
- `tag_id`: UUID, NOT NULL, FK → `tags.id` (ON DELETE CASCADE)
- PK composta: (`praise_id`, `tag_id`)

## 4. Requisitos (Épicos)
**Épico 1: Ingestão de Dados (Script Local)**
- Script em Node.js que varre diretórios locais lendo `metadata.yml`.
- Faz upload dos arquivos referenciados para o R2 (chave: `assets/praises/{praise_id}/{material_id}.{type}`).
- Gera as queries SQL (ou insere direto no D1 local/remoto) para popular as tabelas.

**Épico 2: API (Workers + Hono)**
- Rota GET `/api/praises` com busca textual (LIKE) nos campos de título e letra.
- Rota GET `/api/praises/:id` com JOIN na tabela `praise_materials`.

**Épico 3: Frontend**
- Interface de busca e listagem em formato de tabela/grid.
- Página de detalhes do louvor com player de áudio HTML5 embutido e visualizador/link para PDF.

## 5. Deploy

### Estratégia de Deploy

O projeto utiliza duas estratégias de deploy distintas:

#### 5.1 Deploy via GitHub (Recomendado)
O deploy de código (Frontend e API) é feito automaticamente através de GitHub Actions:
- **Frontend**: Deploy para Cloudflare Pages triggers automaticamente ao fazer commit na branch `main` no diretório `web/`.
- **API**: Deploy para Cloudflare Workers triggers automaticamente ao fazer commit na branch `main` no diretório `api/`.

Basta fazer o commit que os workflows já configurados lidam com o resto.

#### 5.2 Deploy via Wrangler CLI (Infraestrutura)
Recursos de infraestrutura que não podem ser gerenciados via GitHub são feitos manualmente com Wrangler:
- **D1 (Banco de Dados)**: Criação e migração do banco de dados.
- **R2 (Armazenamento)**: Upload de arquivos/assets.

Comandos típicos:
```bash
# Executar SQL no D1
npx wrangler d1 execute coldigom --local --file=schema.sql
npx wrangler d1 execute coldigom --remote --file=ingestion.sql
```