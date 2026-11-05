# Ingestão do acervo legado (coldigom)

Pipeline: `storage/` → SQL → R2 → D1 remoto.

Use **`wrangler`** global 4.x (não `npx wrangler`).

## Pré-requisitos

- Pasta `storage/assets/praises/<praise_id>/metadata.yml` no workspace.
- `storage/material_kinds_unique.csv` e `storage/praise_tags_unique.csv`.
- Credenciais R2 (para upload): `CF_ACCOUNT_ID`, `CF_ACCESS_KEY_ID`, `CF_SECRET_ACCESS_KEY`, `CF_R2_BUCKET=coldigom-assets`.
- `wrangler` autenticado (`wrangler login`).

## 1. Schema D1 (banco vazio ou primeira vez)

```bash
cd api
wrangler d1 execute coldigom --remote --file=schema.sql
```

### Traduções PT-BR dos tipos de material (após ingestão)

Rótulos exibidos na app vêm da tabela `material_kind_translations` no D1 (SSOT). Em bancos já populados com `material_kinds` em inglês, aplique:

```bash
cd api
wrangler d1 execute coldigom --remote --file=migrations/002_material_kind_translations_pt-BR.sql
wrangler d1 execute coldigom --remote --file=migrations/003_material_kind_translations_pt-BR_fixes.sql
```

A migração `003` corrige rótulos (Score → Grade, Sheet Music → Partitura, Choir → Coro). A ordenação alfabética na API usa `Intl.Collator('pt-BR')` (ex.: Áudio antes de Baixo).

Ambiente local: troque `--remote` por `--local` se estiver usando D1 local.

### Revisão humana de louvores (migração 022)

`praises.is_reviewed` registra que alguém revisou o louvor em algum momento;
`reviewed_at` e `reviewed_by` registram a última marcação. Como a migração 022
descreve uma marca de passagem pela curadoria e o PATCH só a altera quando
`is_reviewed` é informado, a marca é **histórica**, não garantia de que os
metadados e tags atuais permaneçam revisados. Edições não a desmarcam;
desmarcar explicitamente limpa os três campos. Isso preserva o comportamento
existente, sem presumir uma regra de invalidação não especificada.

Os GETs públicos de louvor retornam a marca e a data, mas não `reviewed_by`.
Para consultar também a identidade, use `GET /api/admin/praises/:id/review`,
com a mesma autenticação e autorização das operações administrativas.

O deploy do Worker é automático quando a API entra na `main`; portanto a
coluna precisa existir **antes do merge/deploy**, apesar do número 022 ser
anterior a migrações já presentes na main. A operação em produção é separada:

1. Verifique a identidade do banco, histórico de aplicação, backup/recuperação e
   o estado das três colunas e do índice, por exemplo com `PRAGMA table_info(praises)`
   e consulta a `sqlite_master`. Não conclua que a migração falta só pelo número.
2. Em uma cópia isolada representativa, valide a migração e os endpoints. Se as
   três colunas e o índice já existirem conforme a definição, não reaplique.
   Se houver estado parcial ou divergente, interrompa e prepare reparo específico.
3. Só com autorização operacional e esquema anterior intacto, aplique uma vez
   `cd api && wrangler d1 execute coldigom --remote --file=migrations/022_praise_is_reviewed.sql`.
   Os `ALTER TABLE` não são idempotentes. Confira novamente o schema e os dados
   antes de integrar o Worker. Se o deploy falhar, a versão anterior da API
   continua compatível com as colunas adicionais; não remova dados sem plano.

### Fila de revisão da validação (P2)

```bash
npx wrangler d1 execute coldigom --remote --file=migrations/017_validation_findings.sql   # fila de revisão da validação
```

## 2. Ingestão

| Comando | Ação |
|---------|------|
| `npm run ingest:dry-run` | Relatório sem gravar |
| `npm run ingest` | Gera `ingestion.sql` na raiz do repo |
| `npm run ingest:upload` | SQL + upload R2 |
| `npm run ingest:execute` | SQL + `wrangler d1 execute` remoto |
| `npm run ingest:full` | SQL + R2 + D1 + relatório |

Variáveis de ambiente para R2 (upload):

```bash
export CF_ACCOUNT_ID=...
export CF_ACCESS_KEY_ID=...
export CF_SECRET_ACCESS_KEY=...
export CF_R2_BUCKET=coldigom-assets
```

## 3. Verificação

```bash
npm run ingest:verify
```

Compara pastas com `metadata.yml` válido vs `SELECT COUNT(*) FROM praises` no D1 remoto.

### Amostra manual de assets

Após ingestão, abra um louvor na web e confirme PDF/MP3. Ou:

```bash
curl -I "https://coldigom-api.jairofilho79.workers.dev/assets/assets/praises/<praise_id>/<material_id>.pdf"
```

## Regras (PRD)

- Ignorar `metadata.yml` vazio e `metadata_from_chords.yml`.
- Normalizar `material_type` → `type`.
- Materiais com `url` não fazem upload R2 (`r2_key` NULL).
- Arquivo local: `{material_id}.{type}` ou `{material_id}.{material_kind}.{type}`.

## Re-ingestão

`ingestion.sql` usa `BEGIN TRANSACTION`. Para recarga completa, limpe tabelas no D1 antes ou adapte o script (futuro: flag `--replace`).

## Fallback

[`api/upload-r2-remote.sh`](../api/upload-r2-remote.sh) — retomada de upload em massa com skip de arquivos já enviados.
