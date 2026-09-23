import { describe, expect, it } from 'vitest';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

describe('sqliteD1 — o D1 de verdade dos testes', () => {
  it('carrega o schema.sql inteiro, FTS5 incluído', () => {
    const sqlite = sqliteComSchema();
    const tabelas = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'trigger') ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tabelas).toEqual(expect.arrayContaining(['praises', 'praises_fts', 'praises_ai', 'plpcg_crosswalk']));
  });

  it('prepare/bind/first/all/run como o D1', async () => {
    const db = d1DeSqlite(sqliteComSchema());
    const escrita = await db
      .prepare('INSERT INTO praises (id, name) VALUES (?, ?)')
      .bind('p1', 'Grande Deus')
      .run();
    expect(escrita.meta.changes).toBe(1);

    expect(await db.prepare('SELECT id, name FROM praises WHERE id = ?').bind('p1').first()).toEqual({
      id: 'p1',
      name: 'Grande Deus',
    });
    expect(await db.prepare('SELECT name FROM praises WHERE id = ?').bind('p1').first('name')).toBe('Grande Deus');
    expect(await db.prepare('SELECT id FROM praises WHERE id = ?').bind('nada').first()).toBeNull();
    expect((await db.prepare('SELECT id FROM praises').all()).results).toEqual([{ id: 'p1' }]);
  });

  it('batch é tudo ou nada, como no D1', async () => {
    const db = d1DeSqlite(sqliteComSchema());
    await expect(
      db.batch([
        db.prepare('INSERT INTO praises (id, name) VALUES (?, ?)').bind('p1', 'A'),
        db.prepare('INSERT INTO praises (id, name) VALUES (?, ?)').bind('p1', 'repetido'),
      ]),
    ).rejects.toThrow(/UNIQUE constraint failed: praises\.id/);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM praises').first()) as { n: number }).toEqual({ n: 0 });
  });
});
