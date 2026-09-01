import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';
import { isFtsError, resolveTagFilterGroups } from '../praiseQuery';

describe('isFtsError', () => {
  it('reconhece falha vinda do índice de texto', () => {
    expect(isFtsError(new Error('no such table: praises_fts'))).toBe(true);
    expect(isFtsError(new Error('fts5: syntax error near "*"'))).toBe(true);
    expect(isFtsError(new Error('unable to use function MATCH in the requested context'))).toBe(true);
  });

  it('não confunde erro de SQL comum com falha de FTS', () => {
    // O laço tratava QUALQUER exceção como "o FTS falhou, tenta sem ele". Um
    // alias errado numa cláusula de filtro virava warning api.praises.fts_fallback
    // e depois 500 genérico: a mensagem mentia sobre a causa.
    expect(isFtsError(new Error('no such column: p.ritmo'))).toBe(false);
    expect(isFtsError(new Error('D1_ERROR: near ")": syntax error'))).toBe(false);
    expect(isFtsError(new Error('network timeout'))).toBe(false);
  });
});

describe('GET /api/praises — diagnóstico de falha', () => {
  function dbQueSempreFalha(mensagem: string) {
    let tentativas = 0;
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            tentativas++;
            throw new Error(mensagem);
          }),
          first: vi.fn(async () => ({ total: 0 })),
        })),
        all: vi.fn(async () => {
          tentativas++;
          throw new Error(mensagem);
        }),
        first: vi.fn(async () => ({ total: 0 })),
      })),
    };
    return { db, tentativas: () => tentativas };
  }

  it('não tenta de novo quando o erro não é do índice de texto', async () => {
    const { db, tentativas } = dbQueSempreFalha('no such column: p.ritmo');
    const res = await app.request('/api/praises?q=graca', {}, { DB: db, ASSETS: {} } as never);
    expect(res.status).toBe(500);
    expect(tentativas()).toBe(1);
  });

  it('tenta sem o índice de texto quando a falha é dele', async () => {
    const { db, tentativas } = dbQueSempreFalha('no such table: praises_fts');
    const res = await app.request('/api/praises?q=graca', {}, { DB: db, ASSETS: {} } as never);
    expect(res.status).toBe(500);
    expect(tentativas()).toBe(2);
  });
});

describe('resolveTagFilterGroups', () => {
  function dbTags(filhosPorPai: Record<string, string[]>) {
    const consultas: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        consultas.push(sql);
        return {
          bind: vi.fn((...ids: unknown[]) => ({
            all: vi.fn(async () => ({
              results: ids.flatMap((id) =>
                (filhosPorPai[String(id)] ?? []).map((f) => ({ id: f, parent_id: String(id) }))
              ),
            })),
          })),
        };
      }),
    } as unknown as D1Database;
    return { db, consultas };
  }

  it('resolve todas as tags numa consulta só', async () => {
    // Era uma consulta por tag, em série: filtrar por cinco tags custava cinco
    // viagens ao D1 antes da consulta principal.
    const { db, consultas } = dbTags({ a: ['a1', 'a2'], b: ['b1'], c: [] });
    await resolveTagFilterGroups(db, ['a', 'b', 'c']);
    expect(consultas).toHaveLength(1);
  });

  it('troca a tag pelos filhos, e mantém a própria tag quando não tem filho', async () => {
    const { db } = dbTags({ a: ['a1', 'a2'], b: ['b1'], c: [] });
    const grupos = await resolveTagFilterGroups(db, ['a', 'b', 'c']);
    expect(grupos).toEqual([['a1', 'a2'], ['b1'], ['c']]);
  });

  it('preserva a ordem das tags pedidas', async () => {
    const { db } = dbTags({ z: ['z1'], a: ['a1'] });
    expect(await resolveTagFilterGroups(db, ['z', 'a'])).toEqual([['z1'], ['a1']]);
  });

  it('não consulta nada quando não há tag', async () => {
    const { db, consultas } = dbTags({});
    expect(await resolveTagFilterGroups(db, [])).toEqual([]);
    expect(consultas).toHaveLength(0);
  });
});
