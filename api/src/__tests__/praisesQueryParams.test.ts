import { describe, expect, it } from 'vitest';

import { app } from '../index';
import { MAX_PAGE_SIZE } from '../queryParams';

/** D1 falso que guarda o SQL e os bindings de cada consulta. */
function dbEspiao() {
  const chamadas: { sql: string; bindings: unknown[] }[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => {
        chamadas.push({ sql, bindings });
        return {
          all: async () => ({ results: [] }),
          first: async () => ({ total: 0 }),
          run: async () => ({}),
        };
      },
      all: async () => ({ results: [] }),
      first: async () => ({ total: 0 }),
    }),
  };
  return { db, chamadas };
}

async function pedir(url: string) {
  const { db, chamadas } = dbEspiao();
  const res = await app.request(url, {}, { DB: db, ASSETS: {} } as never);
  return { res, chamadas };
}

/** Bindings de LIMIT/OFFSET da consulta principal. */
function limiteEOffset(chamadas: { sql: string; bindings: unknown[] }[]) {
  const principal = chamadas.find((c) => c.sql.includes('LIMIT ? OFFSET ?'));
  return principal ? principal.bindings.slice(-2) : null;
}

for (const base of ['/api/praises', '/api/plpcg/praises']) {
  describe(`validação de parâmetros em ${base}`, () => {
    it('recusa limit que não é inteiro', async () => {
      // Antes: LIMIT NaN, HTTP 200 e totalPages null.
      const { res } = await pedir(`${base}?limit=abc`);
      expect(res.status).toBe(400);
    });

    it('recusa page que não é inteiro', async () => {
      const { res } = await pedir(`${base}?page=xyz`);
      expect(res.status).toBe(400);
    });

    it('recusa page menor que 1', async () => {
      // Antes: page=-5 virava OFFSET -120.
      expect((await pedir(`${base}?page=-5`)).res.status).toBe(400);
      expect((await pedir(`${base}?page=0`)).res.status).toBe(400);
    });

    it('recusa numberMin e numberMax não numéricos', async () => {
      // Antes: binding null, "CAST(...) >= NULL" nunca verdadeiro, zero
      // resultados com HTTP 200 — o pior dos casos, porque parecia resposta boa.
      expect((await pedir(`${base}?numberMin=abc`)).res.status).toBe(400);
      expect((await pedir(`${base}?numberMax=abc`)).res.status).toBe(400);
    });

    it('recusa limit com sufixo, que o parseInt aceitava calado', async () => {
      const { res } = await pedir(`${base}?limit=20abc`);
      expect(res.status).toBe(400);
    });

    it('a mensagem de erro diz qual parâmetro está errado', async () => {
      const { res } = await pedir(`${base}?numberMin=abc`);
      const corpo = (await res.json()) as { error?: string };
      expect(corpo.error).toMatch(/numberMin/);
    });

    it('limita o tamanho de página em vez de devolver o acervo inteiro', async () => {
      const { res, chamadas } = await pedir(`${base}?limit=999999`);
      expect(res.status).toBe(200);
      expect(limiteEOffset(chamadas)).toEqual([MAX_PAGE_SIZE, 0]);
    });

    it('deixa passar parâmetros válidos', async () => {
      const { res, chamadas } = await pedir(`${base}?page=3&limit=25&numberMin=1&numberMax=99`);
      expect(res.status).toBe(200);
      expect(limiteEOffset(chamadas)).toEqual([25, 50]);
    });

    it('funciona sem nenhum parâmetro', async () => {
      const { res, chamadas } = await pedir(base);
      expect(res.status).toBe(200);
      expect(limiteEOffset(chamadas)).toEqual([20, 0]);
    });
  });
}
