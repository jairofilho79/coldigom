import { describe, expect, it } from 'vitest';

import { listPlpcgPraises } from '../plpcgPraises';
import {
  buildOrderClause,
  buildWhereClause,
  resolveTagFilterGroups,
  TAG_LABEL_SQL,
  VALID_SORT_FIELDS,
  type SortField,
} from '../praiseQuery';

type Row = {
  id: string;
  name: string;
  number: string | null;
  author: string | null;
  rhythm: string | null;
  tonality: string | null;
  category: string | null;
  group_id: string | null;
  tag_ids: string | null;
  tag_names: string | null;
  has_lyrics: number;
};

function fakeDb(rows: Row[], lyricsById: Record<string, string>) {
  return {
    prepare: (sql: string) => {
      if (sql.includes('FROM material_kinds')) {
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      }
      if (sql.trim().startsWith('SELECT COUNT(*)')) {
        return { bind: (..._b: unknown[]) => ({ first: async () => ({ total: rows.length }) }) };
      }
      if (sql.includes('FROM praise_materials')) {
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      }
      if (sql.includes('SELECT id, lyrics FROM praises')) {
        return {
          bind: (...ids: string[]) => ({
            all: async () => ({
              results: ids
                .filter((id) => id in lyricsById)
                .map((id) => ({ id, lyrics: lyricsById[id] })),
            }),
          }),
        };
      }
      return { bind: () => ({ all: async () => ({ results: rows }) }) };
    },
  } as unknown as D1Database;
}

const deps = {
  buildWhereClause,
  buildOrderClause: (sort: string, order: 'ASC' | 'DESC', search?: string) =>
    buildOrderClause(sort as SortField, order, search),
  validSortFields: VALID_SORT_FIELDS,
  resolveTagFilterGroups,
  tagLabelSql: TAG_LABEL_SQL,
};

function row(over: Partial<Row>): Row {
  return {
    id: 'p1',
    name: 'Refúgio e Fortaleza',
    number: '087',
    author: null,
    rhythm: null,
    tonality: null,
    category: null,
    group_id: null,
    tag_ids: null,
    tag_names: null,
    has_lyrics: 1,
    ...over,
  };
}

describe('listPlpcgPraises — lyrics_excerpt', () => {
  it('preenche lyrics_excerpt quando a busca textual bate na letra', async () => {
    const db = fakeDb(
      [row({})],
      { p1: 'Ainda que a terra se abale, eu não temerei, pois Tu és comigo.' }
    );

    const result = await listPlpcgPraises(
      db,
      { search: 'não temerei', page: 1, limit: 20, offset: 0, order: 'ASC' },
      deps
    );

    expect(result.data[0].lyrics_excerpt).toContain('não temerei');
  });

  it('não busca letra nem preenche lyrics_excerpt em busca numérica', async () => {
    const db = fakeDb([row({})], { p1: 'letra que contém 87 em algum lugar' });
    let lyricsQueryCalled = false;
    const original = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
      if (sql.includes('SELECT id, lyrics FROM praises')) lyricsQueryCalled = true;
      return original(sql);
    };

    const result = await listPlpcgPraises(
      db,
      { search: '87', page: 1, limit: 20, offset: 0, order: 'ASC' },
      deps
    );

    expect(result.data[0].lyrics_excerpt).toBeNull();
    expect(lyricsQueryCalled).toBe(false);
  });

  it('sem busca, nenhuma linha ganha lyrics_excerpt e não há query extra', async () => {
    const db = fakeDb([row({})], { p1: 'não temerei' });
    let lyricsQueryCalled = false;
    const original = db.prepare.bind(db);
    (db as unknown as { prepare: typeof db.prepare }).prepare = (sql: string) => {
      if (sql.includes('SELECT id, lyrics FROM praises')) lyricsQueryCalled = true;
      return original(sql);
    };

    const result = await listPlpcgPraises(
      db,
      { search: '', page: 1, limit: 20, offset: 0, order: 'ASC' },
      deps
    );

    expect(result.data[0].lyrics_excerpt).toBeNull();
    expect(lyricsQueryCalled).toBe(false);
  });

  it('linha sem letra (has_lyrics=0) não entra na busca de trecho', async () => {
    const db = fakeDb([row({ has_lyrics: 0 })], { p1: 'não temerei' });

    const result = await listPlpcgPraises(
      db,
      { search: 'não temerei', page: 1, limit: 20, offset: 0, order: 'ASC' },
      deps
    );

    expect(result.data[0].lyrics_excerpt).toBeNull();
  });
});
