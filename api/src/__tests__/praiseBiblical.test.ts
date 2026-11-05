import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { buildPlpcgCatalog } from '../plpcgPraises';
import { TAG_LABEL_SQL } from '../praiseQuery';

const PRAISE_ID = 'praise-biblical-1';

function mockEnvWithBiblical(biblicalRow: Record<string, unknown> | null, throwOnBiblical = false) {
  const praise = {
    id: PRAISE_ID,
    name: 'Quero viver para sempre com Jesus',
    number: '182',
    lyrics: 'Letra do louvor',
    tag_ids: null,
    group_id: null,
  };

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(async () => {
        if (sql.includes('FROM praise_biblical')) {
          if (throwOnBiblical) throw new Error('Table praise_biblical does not exist');
          return biblicalRow;
        }
        return praise;
      }),
      all: vi.fn(async () => {
        if (sql.includes('COALESCE(t.label')) return { results: [] };
        if (sql.includes('praise_materials')) return { results: [] };
        return { results: [] };
      }),
    })),
  };

  return { env: { DB: db, ASSETS: { head: vi.fn().mockResolvedValue(null) } } };
}

describe('praise_biblical na API Coldigom', () => {
  describe('GET /api/praises/:id', () => {
    it('devolve biblical estruturado com campos e JSONs desserializados', async () => {
      const biblicalRow = {
        tem_citacao_direta: 1,
        referencia_principal: 'Gênesis 2:9',
        resumo_uma_linha: 'Gênesis 2:9 · Haja luz',
        resumo_formatado: '📖 Gênesis 2:9 · Haja luz',
        citacoes_diretas_json: JSON.stringify([
          { referencia: 'Gênesis 2:9', livro: 'Gênesis', capitulo: 2, versiculo_inicio: 9, versiculo_fim: 9 },
        ]),
        mensagem_central: 'A perseverança e a vida eterna.',
        temas_homileticos_json: JSON.stringify(['Vida Eterna', 'Renúncia']),
        passagem_origem_direta: 'Gênesis 2:9',
        pericopes_relacionadas_json: JSON.stringify([
          { referencia: 'Gênesis 1:1 - 2:3', titulo: 'Haja luz', similarity: 100 },
        ]),
      };

      const { env } = mockEnvWithBiblical(biblicalRow);
      const res = await app.request(`/api/praises/${PRAISE_ID}`, {}, env as never);
      expect(res.status).toBe(200);

      const json = await res.json() as { data: { biblical: Record<string, unknown> } };
      expect(json.data.biblical).toBeTruthy();
      expect(json.data.biblical.tem_citacao_direta).toBe(true);
      expect(json.data.biblical.referencia_principal).toBe('Gênesis 2:9');
      expect(json.data.biblical.resumo_uma_linha).toBe('Gênesis 2:9 · Haja luz');
      expect(json.data.biblical.resumo_formatado).toBe('📖 Gênesis 2:9 · Haja luz');
      expect(json.data.biblical.mensagem_central).toBe('A perseverança e a vida eterna.');
      expect(json.data.biblical.citacoes_diretas).toEqual([
        { referencia: 'Gênesis 2:9', livro: 'Gênesis', capitulo: 2, versiculo_inicio: 9, versiculo_fim: 9 },
      ]);
      expect(json.data.biblical.temas_homileticos).toEqual(['Vida Eterna', 'Renúncia']);
      expect(json.data.biblical.pericopes_relacionadas).toEqual([
        { referencia: 'Gênesis 1:1 - 2:3', titulo: 'Haja luz', similarity: 100 },
      ]);
    });

    it('devolve biblical: null quando o louvor não tem registro bíblico', async () => {
      const { env } = mockEnvWithBiblical(null);
      const res = await app.request(`/api/praises/${PRAISE_ID}`, {}, env as never);
      expect(res.status).toBe(200);

      const json = await res.json() as { data: { biblical: unknown } };
      expect(json.data.biblical).toBeNull();
    });

    it('devolve biblical: null sem derrubar o louvor se a tabela falhar ou não existir', async () => {
      const { env } = mockEnvWithBiblical(null, true);
      const res = await app.request(`/api/praises/${PRAISE_ID}`, {}, env as never);
      expect(res.status).toBe(200);

      const json = await res.json() as { data: { id: string; biblical: unknown } };
      expect(json.data.id).toBe(PRAISE_ID);
      expect(json.data.biblical).toBeNull();
    });
  });

  describe('buildPlpcgCatalog — biblicalSummary para sincronização offline', () => {
    it('inclui biblicalSummary quando o louvor possui resumo bíblico de uma linha', async () => {
      const dbMock = {
        prepare: vi.fn((sql: string) => ({
          bind: () => ({ all: async () => ({ results: [] }) }),
          all: async () => {
            if (sql.includes('FROM praises p')) {
              return {
                results: [
                  {
                    id: 'p1',
                    name: 'Louvor 1',
                    number: '01',
                    biblical_summary: 'Gênesis 2:9 · Árvore da vida',
                  },
                ],
              };
            }
            return { results: [] };
          },
        })),
      } as unknown as D1Database;

      const resultado = await buildPlpcgCatalog(dbMock, { tagLabelSql: TAG_LABEL_SQL }, undefined);
      expect(resultado.status).toBe(200);

      const catalog = JSON.parse(resultado.body) as { praises: Array<Record<string, unknown>> };
      expect(catalog.praises[0].biblicalSummary).toBe('Gênesis 2:9 · Árvore da vida');
    });

    it('omite a chave biblicalSummary quando o louvor não tem resumo bíblico', async () => {
      const dbMock = {
        prepare: vi.fn((sql: string) => ({
          bind: () => ({ all: async () => ({ results: [] }) }),
          all: async () => {
            if (sql.includes('FROM praises p')) {
              return {
                results: [
                  {
                    id: 'p2',
                    name: 'Louvor 2',
                    number: '02',
                    biblical_summary: null,
                  },
                ],
              };
            }
            return { results: [] };
          },
        })),
      } as unknown as D1Database;

      const resultado = await buildPlpcgCatalog(dbMock, { tagLabelSql: TAG_LABEL_SQL }, undefined);
      expect(resultado.status).toBe(200);

      const catalog = JSON.parse(resultado.body) as { praises: Array<Record<string, unknown>> };
      expect(catalog.praises[0]).not.toHaveProperty('biblicalSummary');
    });
  });
});
