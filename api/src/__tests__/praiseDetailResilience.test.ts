import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

/**
 * has_content é um N+1 no R2 dentro do mesmo try do handler: um head que lança
 * derrubava GET /api/praises/:id inteiro com 500 — nome, letra, tags e todos os
 * materiais sumiam por causa de uma flag opcional.
 */
const LOUVOR = 'praise-1';

function ambiente(head: (key: string) => Promise<unknown>) {
  const praise = {
    id: LOUVOR,
    name: 'Grande Deus',
    number: '001',
    lyrics: 'Letra do louvor',
    tag_ids: null,
    group_id: null,
  };
  const materiais = [
    {
      id: 'ch1',
      praise_id: LOUVOR,
      material_kind: 'kind1',
      type: 'chord',
      r2_key: `assets/praises/${LOUVOR}/ch1.chord`,
    },
    {
      id: 'ch2',
      praise_id: LOUVOR,
      material_kind: 'kind1',
      type: 'chord',
      r2_key: `assets/praises/${LOUVOR}/ch2.chord`,
    },
    { id: 'p1', praise_id: LOUVOR, material_kind: 'kind1', type: 'pdf', r2_key: 'x.pdf' },
  ];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(async () => praise),
      all: vi.fn(async () => {
        if (sql.includes('COALESCE(t.label')) return { results: [{ id: 'kind1', label: 'Cifra' }] };
        if (sql.includes('praise_materials')) return { results: materiais };
        return { results: [] };
      }),
    })),
  };

  return { env: { DB: db, ASSETS: { head: vi.fn(head) } }, praise };
}

describe('GET /api/praises/:id — has_content não pode derrubar o louvor', () => {
  it('devolve o louvor mesmo quando todo head do R2 lança', async () => {
    const { env } = ambiente(async () => {
      throw new Error('R2 fora do ar');
    });

    const res = await app.request(`/api/praises/${LOUVOR}`, {}, env as never);

    expect(res.status).toBe(200);
    const json = await res.json() as { data: { name: string; materials: { id: string; has_content?: boolean }[] } };
    expect(json.data.name).toBe('Grande Deus');
    expect(json.data.materials).toHaveLength(3);
    for (const m of json.data.materials) {
      expect(m.has_content).toBeUndefined();
    }
  });

  it('isola o head que falha: a outra cifra mantém a flag', async () => {
    const { env } = ambiente(async (key: string) => {
      if (key.endsWith('ch1.chord')) throw new Error('R2 fora do ar');
      return { size: 611 };
    });

    const res = await app.request(`/api/praises/${LOUVOR}`, {}, env as never);
    expect(res.status).toBe(200);

    const json = await res.json() as { data: { materials: { id: string; has_content?: boolean }[] } };
    const porId = Object.fromEntries(json.data.materials.map((m) => [m.id, m.has_content]));
    expect(porId.ch1).toBeUndefined();
    expect(porId.ch2).toBe(true);
    expect(porId.p1).toBeUndefined();
  });
});
