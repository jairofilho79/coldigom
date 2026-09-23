import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { d1DeSqlite, lerSqlDaApi, sqliteComSchema } from './sqliteD1';

/**
 * praises.short_id (migração 023): o banco atribui, nunca repete, nunca muda.
 * SQLite de verdade — gatilho, índice único e rollback não existem no D1 falso.
 */

/** praises como estava antes da 023, com o FTS e os três gatilhos dele (como em produção). */
const PRE_023 = `
CREATE TABLE praises (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, number TEXT, author TEXT, rhythm TEXT,
  tonality TEXT, category TEXT, lyrics TEXT, group_id TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE praises_fts USING fts5(name, lyrics, content='praises', content_rowid='rowid');
CREATE TRIGGER praises_ai AFTER INSERT ON praises BEGIN
  INSERT INTO praises_fts(rowid, name, lyrics) VALUES (new.rowid, new.name, new.lyrics);
END;
CREATE TRIGGER praises_ad AFTER DELETE ON praises BEGIN
  INSERT INTO praises_fts(praises_fts, rowid, name, lyrics) VALUES('delete', old.rowid, old.name, old.lyrics);
END;
CREATE TRIGGER praises_au AFTER UPDATE ON praises BEGIN
  INSERT INTO praises_fts(praises_fts, rowid, name, lyrics) VALUES('delete', old.rowid, old.name, old.lyrics);
  INSERT INTO praises_fts(rowid, name, lyrics) VALUES (new.rowid, new.name, new.lyrics);
END;`;

const MIGRACAO = lerSqlDaApi('migrations/023_praise_short_id.sql');

function shortIds(sqlite: DatabaseSync): Record<string, string | null> {
  const linhas = sqlite.prepare('SELECT id, short_id FROM praises ORDER BY id').all() as {
    id: string;
    short_id: string | null;
  }[];
  return Object.fromEntries(linhas.map((l) => [l.id, l.short_id]));
}

function contador(sqlite: DatabaseSync): number {
  return (sqlite.prepare("SELECT value FROM app_meta WHERE key = 'short_id_next'").get() as { value: number }).value;
}

function inserir(sqlite: DatabaseSync, id: string, shortId?: string) {
  if (shortId === undefined) {
    sqlite.prepare('INSERT INTO praises (id, name) VALUES (?, ?)').run(id, `Louvor ${id}`);
  } else {
    sqlite.prepare('INSERT INTO praises (id, name, short_id) VALUES (?, ?, ?)').run(id, `Louvor ${id}`, shortId);
  }
}

/** FTS5 externo desalinhado corrompe a busca em silêncio; o integrity-check acusa. */
function ftsIntegro(sqlite: DatabaseSync) {
  sqlite.exec("INSERT INTO praises_fts(praises_fts, rank) VALUES('integrity-check', 1)");
}

/** Ids achados pela busca de texto, como o `useFts` de praiseQuery.ts faz. */
function achados(sqlite: DatabaseSync, termo: string): string[] {
  return (
    sqlite
      .prepare(
        'SELECT p.id FROM praises_fts f JOIN praises p ON p.rowid = f.rowid WHERE praises_fts MATCH ? ORDER BY p.id',
      )
      .all(termo) as { id: string }[]
  ).map((r) => r.id);
}

describe('migração 023 — backfill', () => {
  function migrado() {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(PRE_023);
    const ins = sqlite.prepare('INSERT INTO praises (id, name, lyrics, created_at) VALUES (?, ?, ?, ?)');
    ins.run('b', 'B', 'letra b', '2024-01-02 10:00:00');
    ins.run('a', 'A', 'letra a', '2024-01-02 10:00:00'); // empate: o id desempata
    ins.run('c', 'C', 'letra c', '2024-01-01 09:00:00');
    ins.run('d', 'D', null, null); // created_at nulo vem primeiro, como no ORDER BY do SQLite
    sqlite.exec(MIGRACAO);
    return sqlite;
  }

  it('único e contíguo, na ordem de criação com o id de desempate', () => {
    const sqlite = migrado();
    expect(shortIds(sqlite)).toEqual({ d: '000', c: '001', a: '002', b: '003' });
  });

  it('o contador começa em COUNT(*): o próximo praise ganha o id seguinte', () => {
    const sqlite = migrado();
    expect(contador(sqlite)).toBe(4);
    inserir(sqlite, 'e');
    expect(shortIds(sqlite).e).toBe('004');
  });

  it('troca o praises_au: sem isso, o primeiro insert num FTS vazio corrompe o índice', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(PRE_023);
    sqlite.exec(MIGRACAO);
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    expect(shortIds(sqlite)).toEqual({ p1: '000', p2: '001' });
    expect(() => ftsIntegro(sqlite)).not.toThrow();
    expect(achados(sqlite, 'p2')).toEqual(['p2']);
  });

  it('o FTS continua íntegro e achando depois do backfill e de inserts', () => {
    const sqlite = migrado();
    for (const id of ['e', 'f', 'g']) inserir(sqlite, id);
    expect(() => ftsIntegro(sqlite)).not.toThrow();
    expect(achados(sqlite, 'f')).toEqual(['f']);
    expect(achados(sqlite, 'letra')).toEqual(['a', 'b', 'c']);
  });
});

describe('praises.short_id — atribuição e invariantes (schema.sql)', () => {
  it('cada insert gasta um id, em sequência', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    expect(shortIds(sqlite)).toEqual({ p1: '000', p2: '001' });
    expect(contador(sqlite)).toBe(2);
    expect(() => ftsIntegro(sqlite)).not.toThrow();
  });

  it('insert que falha não gasta id', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    expect(() => inserir(sqlite, 'p1')).toThrow(/UNIQUE constraint failed: praises\.id/);
    expect(() => sqlite.prepare('INSERT INTO praises (id, name) VALUES (?, NULL)').run('p2')).toThrow(/NOT NULL/);
    expect(contador(sqlite)).toBe(1);
    inserir(sqlite, 'p3');
    expect(shortIds(sqlite).p3).toBe('001');
  });

  it('lote do D1 revertido devolve o id', async () => {
    const sqlite = sqliteComSchema();
    const db = d1DeSqlite(sqlite);
    await expect(
      db.batch([
        db.prepare('INSERT INTO praises (id, name) VALUES (?, ?)').bind('p1', 'A'),
        db.prepare('INSERT INTO praise_tags (praise_id, tag_id) VALUES (?, ?)').bind('p1', 'tag-que-nao-existe'),
      ]),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect(contador(sqlite)).toBe(0);
    inserir(sqlite, 'p2');
    expect(shortIds(sqlite)).toEqual({ p2: '000' });
  });

  it('o cliente não escolhe: valor ainda não emitido é recusado', () => {
    const sqlite = sqliteComSchema();
    expect(() => inserir(sqlite, 'p1', '000')).toThrow(/só um valor já emitido/);
    inserir(sqlite, 'p1');
    for (const ruim of ['001', '0ff', 'fff', '1000', '00', '0000', 'ABC', '-01', 'zz1']) {
      expect(() => inserir(sqlite, 'x', ruim), ruim).toThrow(/só um valor já emitido/);
    }
    expect(contador(sqlite)).toBe(1);
  });

  it('imutável: nem trocar, nem apagar; editar o resto não mexe nele', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    expect(() => sqlite.prepare("UPDATE praises SET short_id = 'fff' WHERE id = 'p1'").run()).toThrow(/imutável/);
    expect(() => sqlite.prepare("UPDATE praises SET short_id = NULL WHERE id = 'p1'").run()).toThrow(/imutável/);
    sqlite.prepare("UPDATE praises SET name = 'Outro', short_id = short_id WHERE id = 'p1'").run();
    expect(shortIds(sqlite).p1).toBe('000');
  });

  it('apagado queima o id: o próximo não o reutiliza', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    sqlite.prepare("DELETE FROM praises WHERE id = 'p1'").run();
    inserir(sqlite, 'p3');
    expect(shortIds(sqlite)).toEqual({ p2: '001', p3: '002' });
  });

  it('o --undo do apply.py repõe o louvor apagado com o próprio id; um id vivo não se repete', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    sqlite.prepare("DELETE FROM praises WHERE id = 'p1'").run();
    inserir(sqlite, 'p1', '000');
    expect(shortIds(sqlite)).toEqual({ p1: '000', p2: '001' });
    expect(() => inserir(sqlite, 'p9', '001')).toThrow(/UNIQUE constraint failed: praises\.short_id/);
    expect(contador(sqlite)).toBe(2);
  });

  it('o upsert do --undo de set_praise_field (linha inteira do snapshot) passa e não gasta id', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    sqlite
      .prepare(
        `INSERT INTO praises (id, name, short_id) VALUES ('p1', 'Nome antigo', '000')
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_id = excluded.short_id`,
      )
      .run();
    expect(sqlite.prepare("SELECT name, short_id FROM praises WHERE id = 'p1'").get()).toEqual({
      name: 'Nome antigo',
      short_id: '000',
    });
    expect(contador(sqlite)).toBe(1);
    expect(() => ftsIntegro(sqlite)).not.toThrow();
  });

  it('o FTS acompanha: novo e renomeado são achados, índice íntegro', () => {
    const sqlite = sqliteComSchema();
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    sqlite.prepare("UPDATE praises SET name = 'Aleluia' WHERE id = 'p2'").run();
    sqlite.prepare("UPDATE praises SET rhythm = 'Valsa' WHERE id = 'p1'").run();
    expect(achados(sqlite, 'p1')).toEqual(['p1']);
    expect(achados(sqlite, 'aleluia')).toEqual(['p2']);
    expect(achados(sqlite, 'p2')).toEqual([]);
    expect(() => ftsIntegro(sqlite)).not.toThrow();
  });

  it('largura dinâmica: fff e depois 1000', () => {
    const sqlite = sqliteComSchema();
    sqlite.prepare("UPDATE app_meta SET value = 4095 WHERE key = 'short_id_next'").run();
    inserir(sqlite, 'p1');
    inserir(sqlite, 'p2');
    expect(shortIds(sqlite)).toEqual({ p1: 'fff', p2: '1000' });
  });
});
