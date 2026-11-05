import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

/**
 * Filtrar por tag pai traz os louvores ligados ao pai E às subtags
 * (spec 2026-09-24 seções da Coletânea, §3.1 / fato F6).
 *
 * O bug de produção: filtrar por PES trazia só os 8 louvores de «PES · 9.2026»
 * e ignorava os ~237 ligados direto à raiz. SQLite de verdade, porque o que
 * importa aqui é o resultado da consulta, não o texto dela.
 */
function ambiente() {
  const sqlite = sqliteComSchema();
  const env = {
    DB: d1DeSqlite(sqlite),
    ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
  };
  return { sqlite, env };
}

function tag(sqlite: DatabaseSync, id: string, nome: string, pai: string | null = null) {
  sqlite.prepare('INSERT INTO tags (id, name, parent_id) VALUES (?, ?, ?)').run(id, nome, pai);
}

function louvor(sqlite: DatabaseSync, id: string, numero: string, tags: string[]) {
  sqlite.prepare('INSERT INTO praises (id, name, number) VALUES (?, ?, ?)').run(id, `Louvor ${id}`, numero);
  for (const t of tags) {
    sqlite.prepare('INSERT INTO praise_tags (praise_id, tag_id) VALUES (?, ?)').run(id, t);
  }
}

/**
 * pes (raiz) ─ pes-9 («PES · 9.2026»); avulsos (raiz, sem filho).
 * - na-raiz: só PES
 * - na-sub: só PES · 9.2026
 * - nos-dois: PES e PES · 9.2026 (não pode sair duplicado)
 * - avulso-pes: Avulsos e PES
 * - fora: só Avulsos
 */
function acervo() {
  const { sqlite, env } = ambiente();
  tag(sqlite, 'pes', 'PES');
  tag(sqlite, 'pes-9', '9.2026', 'pes');
  tag(sqlite, 'avulsos', 'Avulsos');
  louvor(sqlite, 'na-raiz', '001', ['pes']);
  louvor(sqlite, 'na-sub', '002', ['pes-9']);
  louvor(sqlite, 'nos-dois', '003', ['pes', 'pes-9']);
  louvor(sqlite, 'avulso-pes', '004', ['avulsos', 'pes']);
  louvor(sqlite, 'fora', '005', ['avulsos']);
  return { sqlite, env };
}

type Lista = { data: { id: string }[]; pagination: { total: number } };

async function listar(env: object, rota: string): Promise<Lista> {
  const res = await app.request(rota, {}, env as never);
  expect(res.status).toBe(200);
  return (await res.json()) as Lista;
}

const ids = (lista: Lista) => lista.data.map((p) => p.id).sort();

describe('GET /api/praises?tags= — tag pai', () => {
  it('traz os louvores da raiz e os da subtag, sem duplicar', async () => {
    const { env } = acervo();
    const lista = await listar(env, '/api/praises?tags=pes');
    expect(ids(lista)).toEqual(['avulso-pes', 'na-raiz', 'na-sub', 'nos-dois']);
    expect(lista.pagination.total).toBe(4);
  });

  it('subtag continua trazendo só a subtag', async () => {
    const { env } = acervo();
    expect(ids(await listar(env, '/api/praises?tags=pes-9'))).toEqual(['na-sub', 'nos-dois']);
  });

  it('tag raiz sem filho continua trazendo só ela', async () => {
    const { env } = acervo();
    expect(ids(await listar(env, '/api/praises?tags=avulsos'))).toEqual(['avulso-pes', 'fora']);
  });

  it('duas tags continuam sendo E: pai (com filhos) E outra raiz', async () => {
    const { env } = acervo();
    expect(ids(await listar(env, '/api/praises?tags=pes,avulsos'))).toEqual(['avulso-pes']);
  });

  it('pai e filho juntos: o filho restringe', async () => {
    const { env } = acervo();
    expect(ids(await listar(env, '/api/praises?tags=pes,pes-9'))).toEqual(['na-sub', 'nos-dois']);
  });
});

describe('GET /api/plpcg/praises?tags= — tag pai', () => {
  it('usa o mesmo resolver: raiz e subtag', async () => {
    const { env } = acervo();
    const lista = await listar(env, '/api/plpcg/praises?tags=pes');
    expect(ids(lista)).toEqual(['avulso-pes', 'na-raiz', 'na-sub', 'nos-dois']);
    expect(lista.pagination.total).toBe(4);
  });
});

describe('GET /api/praises/filters — contagem do pai bate com a lista', () => {
  it('a contagem da faceta PES é igual ao total filtrado por PES', async () => {
    // A faceta já somava pai + filhos; a lista trazia só os filhos. Os dois
    // números precisam concordar, senão o chip promete 4 e a lista mostra 2.
    const { env } = acervo();
    const res = await app.request('/api/praises/filters', {}, env as never);
    expect(res.status).toBe(200);
    const facetas = (await res.json()) as { tags: { id: string; count: number }[] };
    const pes = facetas.tags.find((t) => t.id === 'pes');

    const lista = await listar(env, '/api/praises?tags=pes');
    expect(pes?.count).toBe(lista.pagination.total);
  });
});
