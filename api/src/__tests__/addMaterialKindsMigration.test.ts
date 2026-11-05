import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { lerSqlDaApi } from './sqliteD1';

const PRE_024 = `
CREATE TABLE material_kinds (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);`;

const MIGRACAO_024 = lerSqlDaApi('migrations/024_material_kind_classes.sql');
const MIGRACAO_031 = lerSqlDaApi('migrations/031_add_material_kinds.sql');

const kindsDeProducao = JSON.parse(
  lerSqlDaApi('src/__tests__/fixtures/materialKinds.prod-2026-09-24.json'),
) as { id: string; name: string }[];

/** Pai que não é raiz, pai de outra classe, ou kind pai de si mesmo — deve voltar vazio. */
const VIOLACOES = `
SELECT c.id FROM material_kinds c
JOIN material_kinds p ON p.id = c.parent_id
WHERE p.parent_id IS NOT NULL OR c.class_id IS NOT p.class_id OR c.id = c.parent_id`;

function bancoMigradoAte031(): DatabaseSync {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(PRE_024);
  const inserir = sqlite.prepare('INSERT INTO material_kinds (id, name) VALUES (?, ?)');
  for (const k of kindsDeProducao) inserir.run(k.id, k.name);
  sqlite.exec(MIGRACAO_024);
  // Tabela de traduções (criada na migração 002 em prod)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS material_kind_translations (
      material_kind_id TEXT NOT NULL,
      locale TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY (material_kind_id, locale),
      FOREIGN KEY (material_kind_id) REFERENCES material_kinds(id) ON DELETE CASCADE
    );
  `);
  sqlite.exec(MIGRACAO_031);
  return sqlite;
}

describe('migração 031 — novos material kinds', () => {
  it('insere todos os 17 novos material kinds', () => {
    const sqlite = bancoMigradoAte031();
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM material_kinds').get() as { n: number };
    // 104 de produção + 17 novos = 121
    expect(count.n).toBe(121);
  });

  it('classifica corretamente cada novo material kind por classe e pai', () => {
    const sqlite = bancoMigradoAte031();
    const consultar = sqlite.prepare(`
      SELECT k.name, k.class_id, p.name AS pai_nome, k.sort_order, t.label AS rotulo_pt
      FROM material_kinds k
      LEFT JOIN material_kinds p ON p.id = k.parent_id
      LEFT JOIN material_kind_translations t ON t.material_kind_id = k.id AND t.locale = 'pt-BR'
      WHERE k.id = ?
    `);

    // Audio
    expect(consultar.get('d336b4ef-7cee-4b6e-8d7a-cdb15264e70d')).toMatchObject({
      name: 'Audio (Studio)',
      class_id: 'audio',
      pai_nome: 'Áudio',
      rotulo_pt: 'Áudio (estúdio)',
      sort_order: 32,
    });
    expect(consultar.get('dd947eae-1d84-4f82-9bae-c6bce23f7bf2')).toMatchObject({
      name: 'Audio (Church)',
      class_id: 'audio',
      pai_nome: 'Áudio',
      rotulo_pt: 'Áudio (igreja)',
      sort_order: 34,
    });

    // Flute
    expect(consultar.get('e4d3baf3-c5f5-4c87-af45-298217d8a66f')).toMatchObject({
      name: 'Flute I',
      class_id: 'madeiras',
      pai_nome: 'Flauta',
      rotulo_pt: 'Flauta I',
      sort_order: 32,
    });
    expect(consultar.get('3ba482c9-fb5f-4a80-a62b-11d71e5f5be6')).toMatchObject({
      name: 'Flute II',
      class_id: 'madeiras',
      pai_nome: 'Flauta',
      rotulo_pt: 'Flauta II',
      sort_order: 34,
    });
    expect(consultar.get('ac1ee2a5-0dfa-4fb5-999f-e6f2025c0cc2')).toMatchObject({
      name: 'Flutes',
      class_id: 'madeiras',
      pai_nome: 'Flauta',
      rotulo_pt: 'Flautas',
      sort_order: 36,
    });

    // Trumpet
    expect(consultar.get('5989b562-aa89-465c-a869-4dc06efc19fc')).toMatchObject({
      name: 'Trumpet I',
      class_id: 'metais',
      pai_nome: 'Trompete',
      rotulo_pt: 'Trompete I',
      sort_order: 102,
    });
    expect(consultar.get('8b647c5f-bf5b-40fa-9a2b-aefb8bddd541')).toMatchObject({
      name: 'Trumpet II',
      class_id: 'metais',
      pai_nome: 'Trompete',
      rotulo_pt: 'Trompete II',
      sort_order: 104,
    });
    expect(consultar.get('9a2e9a05-44cf-4d88-b51b-09e6e32cd722')).toMatchObject({
      name: 'Trumpets',
      class_id: 'metais',
      pai_nome: 'Trompete',
      rotulo_pt: 'Trompetes',
      sort_order: 106,
    });

    // Trombone
    expect(consultar.get('0084abef-6e3e-4003-9882-afab27107713')).toMatchObject({
      name: 'Trombone I',
      class_id: 'metais',
      pai_nome: 'Trombone',
      rotulo_pt: 'Trombone I',
      sort_order: 142,
    });
    expect(consultar.get('71f3dd8f-02ae-434a-8e6a-0ba37fc736cc')).toMatchObject({
      name: 'Trombone II',
      class_id: 'metais',
      pai_nome: 'Trombone',
      rotulo_pt: 'Trombone II',
      sort_order: 144,
    });
    expect(consultar.get('1c73024a-872a-44ad-bd63-4536a28a3063')).toMatchObject({
      name: 'Trombones',
      class_id: 'metais',
      pai_nome: 'Trombone',
      rotulo_pt: 'Trombones',
      sort_order: 146,
    });

    // Clarinet
    expect(consultar.get('bf62dc10-4a2e-48d2-8d4f-1f182c8fe6f9')).toMatchObject({
      name: 'Clarinet I',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinete I',
      sort_order: 52,
    });
    expect(consultar.get('085c34e3-1129-4ef3-8e48-e10d31c9579f')).toMatchObject({
      name: 'Clarinet II',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinete II',
      sort_order: 54,
    });
    expect(consultar.get('9a931e47-fade-4965-891b-790d8d90164a')).toMatchObject({
      name: 'Clarinets',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinetes',
      sort_order: 56,
    });
    expect(consultar.get('baa2b993-c37a-4f96-ae5f-8560d2e4b6d8')).toMatchObject({
      name: 'Clarinet in Sib I',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinete em Si bemol I',
      sort_order: 62,
    });
    expect(consultar.get('b5b61ce6-6ad1-41da-9889-eeabed58ffd2')).toMatchObject({
      name: 'Clarinet in Sib II',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinete em Si bemol II',
      sort_order: 64,
    });
    expect(consultar.get('b403be03-b66c-47c7-b28c-c8e248f99df5')).toMatchObject({
      name: 'Clarinets in Sib',
      class_id: 'madeiras',
      pai_nome: 'Clarinete',
      rotulo_pt: 'Clarinetes em Si bemol',
      sort_order: 66,
    });
  });

  it('preserva estritamente a hierarquia de famílias (1 nível)', () => {
    const sqlite = bancoMigradoAte031();
    expect(sqlite.prepare(VIOLACOES).all()).toEqual([]);
  });

  it('impede exclusão de instrumento pai que tem filhos', () => {
    const sqlite = bancoMigradoAte031();
    expect(() => sqlite.prepare("DELETE FROM material_kinds WHERE name = 'Flauta'").run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});
