import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { lerSqlDaApi } from './sqliteD1';

/**
 * DROP COLUMN praises.category (migração 025). SQLite de verdade, com o
 * schema.sql de ANTES da 025 (coluna, índice, FTS5 e triggers como em
 * produção): o D1 falso não sabe ALTER TABLE.
 */
const MIGRACAO = lerSqlDaApi('migrations/025_drop_praise_category.sql');

function producaoAntes(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(lerSqlDaApi('src/__tests__/fixtures/schema.pre-025.sql'));
  sqlite.exec(`INSERT INTO praises (id, name, number, category, lyrics) VALUES
    ('p1', 'Ainda há tempo', '001', NULL, 'como é forte ouvir'),
    ('p2', 'Clamor A', '002', NULL, 'letra dois');`);
  return sqlite;
}

const colunas = (s: DatabaseSync) =>
  (s.prepare('PRAGMA table_info(praises)').all() as { name: string }[]).map((c) => c.name);

describe('migração 025: DROP COLUMN praises.category', () => {
  it('tira a coluna e o índice e preserva as linhas', () => {
    const s = producaoAntes();
    expect(colunas(s)).toContain('category');
    s.exec(MIGRACAO);
    expect(colunas(s)).not.toContain('category');
    const indices = (s.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[])
      .map((i) => i.name);
    expect(indices).not.toContain('idx_praises_category');
    expect(s.prepare('SELECT id, name, number FROM praises ORDER BY id').all().map((r) => ({ ...r }))).toEqual([
      { id: 'p1', name: 'Ainda há tempo', number: '001' },
      { id: 'p2', name: 'Clamor A', number: '002' },
    ]);
  });

  it('o FTS continua sincronizado depois da migração', () => {
    const s = producaoAntes();
    s.exec(MIGRACAO);
    s.exec("UPDATE praises SET name = 'Novo nome' WHERE id = 'p2'");
    s.exec("INSERT INTO praises (id, name) VALUES ('p3', 'Terceiro')");
    const achados = (q: string) =>
      (s.prepare('SELECT p.id FROM praises_fts f JOIN praises p ON p.rowid = f.rowid WHERE praises_fts MATCH ?')
        .all(q) as { id: string }[]).map((r) => r.id);
    expect(achados('novo')).toEqual(['p2']);
    expect(achados('terceiro')).toEqual(['p3']);
    expect(achados('forte')).toEqual(['p1']);
  });
});
