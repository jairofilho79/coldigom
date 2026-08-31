import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const CHAVE = 'assets/praises/praise-1/mat-1.chord';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-mat' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function ambiente(material: { type?: string; r2_key?: string | null } = {}) {
  const gravados: { sql: string; args: unknown[] }[] = [];
  const apagados: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return {
              id: 'mat-1',
              praise_id: 'praise-1',
              type: material.type ?? 'chord',
              r2_key: 'r2_key' in material ? material.r2_key : CHAVE,
            };
          }
          if (sql.includes('FROM praises p')) return { id: args[0], name: 'Louvor', tag_ids: null };
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          gravados.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };

  const assets = {
    head: vi.fn(async () => null),
    put: vi.fn(async () => ({})),
    delete: vi.fn(async (key: string) => {
      apagados.push(key);
    }),
  };

  return {
    gravados,
    apagados,
    assets,
    env: {
      DB: db,
      ASSETS: assets,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    },
  };
}

async function patch(corpo: object, material?: Parameters<typeof ambiente>[0]) {
  const ctx = ambiente(material);
  const jwt = await sessao();
  const res = await app.request(
    '/api/materials/mat-1',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify(corpo),
    },
    ctx.env as never
  );
  return { res, ...ctx };
}

describe('PATCH /api/materials/:id — type é validado como na criação', () => {
  it('recusa type com travessia de caminho', async () => {
    // As rotas de criação já chamavam isSafeMaterialType; a edição não. O type
    // vira extensão da entrada do ZIP público de download.
    const { res, gravados } = await patch({ type: '../../outro/roubado.pdf' });

    expect(res.status).toBe(400);
    expect(gravados).toHaveLength(0);
  });

  it('recusa type com caractere que quebra a chave', async () => {
    for (const tipo of ['PDF', 'pdf ', 'pdf?x=1', '', 'a'.repeat(300)]) {
      const { res, gravados } = await patch({ type: tipo });
      expect(res.status).toBe(400);
      expect(gravados).toHaveLength(0);
    }
  });

  it('continua aceitando os tipos reais do acervo', async () => {
    const { res } = await patch({ type: 'pdf' });

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/materials/:id — url não pode abandonar o objeto no R2', () => {
  it('recusa trocar por url um material que tem r2_key', async () => {
    // SET url = ?, r2_key = NULL apagava o ponteiro sem apagar o objeto: o
    // .chord ficava órfão no R2 e sem volta pelo banco.
    const { res, gravados, apagados } = await patch({ url: 'https://drive.google.com/x' });

    expect(res.status).toBe(400);
    expect(gravados).toHaveLength(0);
    expect(apagados).toHaveLength(0);
  });

  it('aceita url em material que não tem arquivo guardado', async () => {
    const { res, gravados } = await patch(
      { url: 'https://drive.google.com/x' },
      { type: 'link', r2_key: null }
    );

    expect(res.status).toBe(200);
    expect(gravados.map((g) => g.sql).join(' ')).toContain('r2_key = NULL');
  });
});

describe('PATCH /api/materials/:id — quem revisou é carimbo do servidor', () => {
  it('grava reviewed_by com a identidade da sessão, não a do corpo', async () => {
    const { res, gravados } = await patch({ is_reviewed: true, reviewed_by: 'presidente' });

    expect(res.status).toBe(200);
    const update = gravados.find((g) => g.sql.includes('is_reviewed = ?'));
    expect(update).toBeDefined();
    expect(update!.args).toContain('admin@test.com');
    expect(update!.args).not.toContain('presidente');
  });

  it('grava reviewed_at como instante do servidor, não valor do corpo', async () => {
    const { gravados } = await patch({ is_reviewed: true, reviewed_at: '1999-01-01T00:00:00.000Z' });

    const update = gravados.find((g) => g.sql.includes('reviewed_at = ?'));
    const carimbo = update!.args.find(
      (a) => typeof a === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(a)
    ) as string;
    expect(carimbo).toBeDefined();
    expect(carimbo).not.toBe('1999-01-01T00:00:00.000Z');
    expect(Date.now() - Date.parse(carimbo)).toBeLessThan(10_000);
  });

  it('desmarcar limpa quem revisou e quando', async () => {
    const { gravados } = await patch({ is_reviewed: false });

    const update = gravados.find((g) => g.sql.includes('is_reviewed = ?'));
    expect(update!.sql).toContain('reviewed_at = ?');
    expect(update!.sql).toContain('reviewed_by = ?');
    // is_reviewed 0 e os dois acompanhantes em null, na ordem em que entram.
    expect(update!.args.slice(0, 3)).toEqual([0, null, null]);
  });

  it('recusa is_reviewed que não seja booleano', async () => {
    const { res } = await patch({ is_reviewed: 'sim' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/materials/:id', () => {
  async function apagar(material?: Parameters<typeof ambiente>[0], assetsOverride?: object) {
    const ctx = ambiente(material);
    if (assetsOverride) Object.assign(ctx.assets, assetsOverride);
    const jwt = await sessao();
    const res = await app.request(
      '/api/materials/mat-1',
      {
        method: 'DELETE',
        headers: { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
      },
      ctx.env as never
    );
    return { res, ...ctx };
  }

  it('apaga a linha e o objeto do R2', async () => {
    const { res, gravados, apagados } = await apagar();

    expect(res.status).toBe(200);
    expect(gravados.map((g) => g.sql).join(' ')).toContain('DELETE FROM praise_materials');
    expect(apagados).toEqual([`storage/${CHAVE}`]);
  });

  it('normaliza r2_key com barra inicial ao apagar', async () => {
    const { apagados } = await apagar({ r2_key: `/${CHAVE}` });

    expect(apagados).toEqual([`storage/${CHAVE}`]);
  });

  it('não chama o R2 quando o material não tem arquivo', async () => {
    const { res, apagados } = await apagar({ type: 'youtube', r2_key: null });

    expect(res.status).toBe(200);
    expect(apagados).toHaveLength(0);
  });

  it('falha do R2 não derruba a remoção da linha', async () => {
    const { res } = await apagar(undefined, {
      delete: vi.fn(async () => {
        throw new Error('R2 fora do ar');
      }),
    });

    expect(res.status).toBe(200);
  });

  it('devolve 404 quando o material não existe', async () => {
    const ctx = ambiente();
    ctx.env.DB.prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({})),
      })),
    })) as never;
    const jwt = await sessao();
    const res = await app.request(
      '/api/materials/mat-1',
      {
        method: 'DELETE',
        headers: { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
      },
      ctx.env as never
    );

    expect(res.status).toBe(404);
  });
});
