-- api/migrations/023_praise_short_id.sql
-- short_id do praise (spec coldigui docs/superpowers/specs/2026-09-23-fim-fonte-plpcg-design.md §7.1).
--
-- Id curto do LOUVOR, para o link de lista do app PLPCG (`?p=1a2-0c3`):
-- hex minúsculo `printf('%03x', n)` — 000…fff e depois 1000… sozinho —,
-- único, imutável e nunca reutilizado (louvor apagado ou fundido queima o id).
--
-- Quem atribui é o banco, não a rota: praises nascem por POST /api/praises,
-- por scripts/ingest.ts, pelo SQL gerado em scripts/import-youtube-playlist e
-- pelo apply.py do validate-acervo. Um gatilho cobre todas as portas. Ele roda
-- dentro do INSERT: se o INSERT falha, ou o lote do D1 em que ele está é
-- revertido, o contador volta junto — falha não gasta id.
--
-- Um INSERT com short_id explícito só passa se o valor já foi emitido (é o
-- --undo do apply.py repondo o louvor que ele mesmo apagou); valor à frente do
-- contador colidiria com um id futuro e travaria toda criação de louvor.
--
-- Aplicar UMA vez (o ALTER não se repete), ANTES do deploy do Worker que lê a coluna:
--   cd api && wrangler d1 execute coldigom --remote --file=migrations/023_praise_short_id.sql

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

ALTER TABLE praises ADD COLUMN short_id TEXT;

-- O gatilho de short_id faz um UPDATE dentro do INSERT, e o SQLite dispara os
-- gatilhos AFTER na ordem inversa da criação: o nosso roda ANTES do praises_ai.
-- Com o praises_au antigo (qualquer UPDATE), esse UPDATE mandava ao FTS um
-- 'delete' de uma linha ainda não indexada, e o FTS5 de conteúdo externo
-- corrompe ("database disk image is malformed"). O praises_au passa a olhar só
-- as colunas indexadas — de quebra, editar ritmo ou tom deixa de reindexar.
DROP TRIGGER IF EXISTS praises_au;
CREATE TRIGGER IF NOT EXISTS praises_au AFTER UPDATE OF name, lyrics ON praises BEGIN
    INSERT INTO praises_fts(praises_fts, rowid, name, lyrics) VALUES('delete', old.rowid, old.name, old.lyrics);
    INSERT INTO praises_fts(rowid, name, lyrics) VALUES (new.rowid, new.name, new.lyrics);
END;

-- Backfill determinístico: ordem de criação, id como desempate.
UPDATE praises
SET short_id = r.sid
FROM (
  SELECT id, printf('%03x', ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) AS sid
  FROM praises
) AS r
WHERE praises.id = r.id AND praises.short_id IS NULL;

INSERT OR IGNORE INTO app_meta (key, value)
SELECT 'short_id_next', COUNT(*) FROM praises;

CREATE UNIQUE INDEX IF NOT EXISTS idx_praises_short_id ON praises(short_id);

CREATE TRIGGER IF NOT EXISTS praises_short_id_ai AFTER INSERT ON praises
WHEN NEW.short_id IS NULL
BEGIN
  UPDATE praises
  SET short_id = (SELECT printf('%03x', value) FROM app_meta WHERE key = 'short_id_next')
  WHERE id = NEW.id;
  UPDATE app_meta SET value = value + 1 WHERE key = 'short_id_next';
END;

CREATE TRIGGER IF NOT EXISTS praises_short_id_bi BEFORE INSERT ON praises
WHEN NEW.short_id IS NOT NULL AND (
  NEW.short_id GLOB '*[^0-9a-f]*'
  OR length(NEW.short_id) < 3
  OR (length(NEW.short_id) > 3 AND substr(NEW.short_id, 1, 1) = '0')
  OR length(NEW.short_id) > length((SELECT printf('%03x', value) FROM app_meta WHERE key = 'short_id_next'))
  OR (
    length(NEW.short_id) = length((SELECT printf('%03x', value) FROM app_meta WHERE key = 'short_id_next'))
    AND NEW.short_id >= (SELECT printf('%03x', value) FROM app_meta WHERE key = 'short_id_next')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'praises.short_id: só um valor já emitido pode ser reposto');
END;

CREATE TRIGGER IF NOT EXISTS praises_short_id_bu BEFORE UPDATE OF short_id ON praises
WHEN OLD.short_id IS NOT NULL AND NEW.short_id IS NOT OLD.short_id
BEGIN
  SELECT RAISE(ABORT, 'praises.short_id é imutável');
END;
