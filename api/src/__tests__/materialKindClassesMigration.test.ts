import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { lerSqlDaApi, sqliteComSchema } from './sqliteD1';

/**
 * Classes e famílias de material kind (migração 024; spec coldigui
 * 2026-09-24-filtro-materiais-classes §2 e §3.1). SQLite de verdade: FK,
 * índice único e ALTER não existem no D1 falso.
 */

/** material_kinds como está em produção antes da 024. */
const PRE_024 = `
CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);`;

const MIGRACAO = lerSqlDaApi('migrations/024_material_kind_classes.sql');

/** Os 104 kinds de produção em 2026-09-24 (`GET /api/materials/kinds`). */
const kindsDeProducao = JSON.parse(
  lerSqlDaApi('src/__tests__/fixtures/materialKinds.prod-2026-09-24.json'),
) as { id: string; name: string }[];

/** Pai que não é raiz, pai de outra classe, ou kind pai de si mesmo — deve voltar vazio. */
const VIOLACOES = `
SELECT c.id FROM material_kinds c
JOIN material_kinds p ON p.id = c.parent_id
WHERE p.parent_id IS NOT NULL OR c.class_id IS NOT p.class_id OR c.id = c.parent_id`;

function producaoMigrada(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(PRE_024);
  const inserir = sqlite.prepare('INSERT INTO material_kinds (id, name) VALUES (?, ?)');
  for (const k of kindsDeProducao) inserir.run(k.id, k.name);
  sqlite.exec(MIGRACAO);
  return sqlite;
}

function kind(sqlite: DatabaseSync, nome: string) {
  return sqlite
    .prepare(
      `SELECT k.class_id, p.name AS pai, k.sort_order FROM material_kinds k
       LEFT JOIN material_kinds p ON p.id = k.parent_id WHERE k.name = ?`
    )
    .get(nome) as { class_id: string | null; pai: string | null; sort_order: number | null };
}

describe('migração 024 — classes e famílias de material kind', () => {
  it('cria as 10 classes na ordem da grade', () => {
    const sqlite = producaoMigrada();
    const classes = sqlite
      .prepare('SELECT id, label FROM material_kind_classes ORDER BY sort_order')
      .all()
      .map((r) => ({ ...(r as object) }));
    expect(classes).toEqual([
      { id: 'regencia', label: 'Regência e geral' },
      { id: 'letra', label: 'Letra e projeção' },
      { id: 'vozes', label: 'Vozes' },
      { id: 'madeiras', label: 'Madeiras' },
      { id: 'metais', label: 'Metais' },
      { id: 'percussao', label: 'Percussão' },
      { id: 'banda', label: 'Banda' },
      { id: 'cordas', label: 'Cordas' },
      { id: 'audio', label: 'Áudio e acompanhamento' },
      { id: 'midi', label: 'MIDI de ensaio' },
    ]);
  });

  it('classifica todos os kinds de produção, menos «Desconhecido»', () => {
    const sqlite = producaoMigrada();
    const semClasse = sqlite
      .prepare('SELECT name FROM material_kinds WHERE class_id IS NULL ORDER BY name')
      .all()
      .map((r) => (r as { name: string }).name);
    expect(semClasse).toEqual(['Desconhecido']);
    const semOrdem = sqlite
      .prepare('SELECT COUNT(*) AS n FROM material_kinds WHERE class_id IS NOT NULL AND sort_order IS NULL')
      .get() as { n: number };
    expect(semOrdem.n).toBe(0);
  });

  it('respeita as decisões do dono (spec §2.2)', () => {
    const sqlite = producaoMigrada();
    expect(kind(sqlite, 'Harmonia')).toMatchObject({ class_id: 'metais', pai: null });
    expect(kind(sqlite, 'Saxofone')).toMatchObject({ class_id: 'metais', pai: null });
    expect(kind(sqlite, 'Saxofone alto')).toMatchObject({ class_id: 'metais', pai: 'Saxofone' });
    expect(kind(sqlite, 'Cifra II')).toMatchObject({ class_id: 'banda', pai: 'Cifra' });
    expect(kind(sqlite, 'Base')).toMatchObject({ class_id: 'banda', pai: null });
    expect(kind(sqlite, 'Coro e piano')).toMatchObject({ class_id: 'banda', pai: null });
    expect(kind(sqlite, 'Coro')).toMatchObject({ class_id: 'vozes', pai: null });
    expect(kind(sqlite, 'MIDI tenor I')).toMatchObject({ class_id: 'midi', pai: 'MIDI tenor' });
    expect(kind(sqlite, 'MIDI')).toMatchObject({ class_id: 'midi', pai: null });
    // Ordem de grade, não alfabética: Flautim antes de Fagote.
    expect(kind(sqlite, 'Flautim').sort_order!).toBeLessThan(kind(sqlite, 'Fagote').sort_order!);
  });

  it('não viola as regras de família', () => {
    const sqlite = producaoMigrada();
    expect(sqlite.prepare(VIOLACOES).all()).toEqual([]);
  });

  it('não deixa apagar um pai que ainda tem filhos', () => {
    const sqlite = producaoMigrada();
    expect(() => sqlite.prepare("DELETE FROM material_kinds WHERE name = 'Saxofone'").run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('o schema.sql de um D1 novo já traz as classes e as colunas', () => {
    const sqlite = sqliteComSchema();
    const n = sqlite.prepare('SELECT COUNT(*) AS n FROM material_kind_classes').get() as { n: number };
    expect(n.n).toBe(10);
    sqlite
      .prepare("INSERT INTO material_kinds (id, name, class_id, sort_order) VALUES ('k1', 'Tuba', 'metais', 10)")
      .run();
    expect(
      sqlite.prepare("SELECT class_id FROM material_kinds WHERE id = 'k1'").get(),
    ).toMatchObject({ class_id: 'metais' });
  });
});
