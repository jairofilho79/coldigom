import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-gestos' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` };
}

const LINHA = {
  id: 'c687580e7682', name: 'Quero', description: '', example_triggers: '[]',
  image_key: 'assets/cia/gestures/c687580e7682.png', gif_key: null,
  status: 'active', replaced_by: null, created_at: 't0', updated_at: 't0',
};

/** Banco falso que guarda os lotes; a leitura depois do batch devolve a linha "de agora". */
function banco(linhas: Record<string, unknown>[] = [LINHA]) {
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: 1 };
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({})),
        __sql: sql,
        __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
  };
  return { db, lotes };
}

function r2() {
  const escritos: { key: string; tipo: string | undefined }[] = [];
  return {
    r2: {
      put: vi.fn(async (key: string, _body: unknown, opts?: R2PutOptions) => {
        escritos.push({ key, tipo: opts?.httpMetadata && 'contentType' in opts.httpMetadata ? opts.httpMetadata.contentType : undefined });
        return { httpEtag: '"x"' };
      }),
      head: vi.fn(async () => null),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
    },
    escritos,
  };
}

function env(db: unknown, assets: unknown) {
  return { DB: db, ASSETS: assets, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never;
}

const bumpNoFim = (lote: { sql: string }[]) =>
  expect(lote[lote.length - 1].sql).toMatch(/UPDATE gesture_dictionary_meta SET version = version \+ 1/);

describe('POST /api/gestures/dictionary', () => {
  async function criar(campos: Record<string, string | File>, linhas?: Record<string, unknown>[]) {
    const { db, lotes } = banco(linhas ?? []);
    const { r2: assets, escritos } = r2();
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    const res = await app.request(
      '/api/gestures/dictionary',
      { method: 'POST', headers: await sessao(), body: form },
      env(db, assets)
    );
    return { res, lotes, escritos };
  }
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'g.png', { type: 'image/png' });

  it('exige sessão', async () => {
    const res = await app.request('/api/gestures/dictionary', { method: 'POST', headers: { origin: ORIGEM }, body: new FormData() }, env(banco().db, r2().r2));
    expect(res.status).toBe(401);
  });

  it('cria com id aleatório de 12 hex, grava a figura e sobe a versão', async () => {
    const { res, lotes, escritos } = await criar({ name: 'Quero', description: 'd', exampleTriggers: '["Quero"]', image: png() });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { id: string; image: string; exampleTriggers: string[] } };
    expect(data.id).toMatch(/^[0-9a-f]{12}$/);
    expect(data.image).toBe(`assets/cia/gestures/${data.id}.png`);
    expect(escritos).toEqual([{ key: `storage/assets/cia/gestures/${data.id}.png`, tipo: 'image/png' }]);
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].sql).toContain('INSERT INTO gesture_dictionary');
    bumpNoFim(lotes[0]);
  });

  it('aceita id informado e recusa id repetido com 409', async () => {
    const ok = await criar({ name: 'X', id: 'abcdefabcdef', image: png() });
    expect(ok.res.status).toBe(201);
    const dup = await criar({ name: 'X', id: 'c687580e7682', image: png() }, [LINHA]);
    expect(dup.res.status).toBe(409);
    expect(dup.lotes).toHaveLength(0);
  });

  it('recusa id fora da forma, nome vazio, figura ausente e figura acima de 2 MB', async () => {
    expect((await criar({ name: 'X', id: 'ZZZ', image: png() })).res.status).toBe(400);
    expect((await criar({ name: '  ', image: png() })).res.status).toBe(400);
    expect((await criar({ name: 'X' })).res.status).toBe(400);
    const grande = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'g.png', { type: 'image/png' });
    const { res, escritos } = await criar({ name: 'X', image: grande });
    expect(res.status).toBe(413);
    expect(escritos).toHaveLength(0);
  });

  it('recusa exampleTriggers que não é lista de strings', async () => {
    expect((await criar({ name: 'X', exampleTriggers: '{"a":1}', image: png() })).res.status).toBe(400);
  });

  it('se o batch falhar depois da figura subir, apaga o objeto e responde 500', async () => {
    const { db } = banco([]);
    (db.batch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('D1_ERROR: constraint failed'));
    const { r2: assets, escritos } = r2();
    const form = new FormData();
    form.set('name', 'X');
    form.set('image', png());
    const res = await app.request('/api/gestures/dictionary', { method: 'POST', headers: await sessao(), body: form }, env(db, assets));
    expect(res.status).toBe(500);
    expect(escritos).toHaveLength(1);
    expect(assets.delete).toHaveBeenCalledWith(escritos[0].key);
  });
});

describe('PATCH /api/gestures/dictionary/:id', () => {
  async function editar(corpo: unknown, id = 'c687580e7682') {
    const { db, lotes } = banco();
    const res = await app.request(
      `/api/gestures/dictionary/${id}`,
      { method: 'PATCH', headers: { ...(await sessao()), 'content-type': 'application/json' }, body: JSON.stringify(corpo) },
      env(db, r2().r2)
    );
    return { res, lotes };
  }

  it('atualiza nome, descrição, exemplos e status num batch com bump', async () => {
    const { res, lotes } = await editar({ name: 'Desejo', description: 'nova', exampleTriggers: ['a', 'b'], status: 'deprecated' });
    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].sql).toMatch(/UPDATE gesture_dictionary SET/);
    expect(lotes[0][0].args).toEqual(['Desejo', 'nova', '["a","b"]', 'deprecated', null, 'c687580e7682']);
    bumpNoFim(lotes[0]);
  });

  it('404 para id desconhecido, 400 para status fora do CHECK e para corpo vazio', async () => {
    expect((await editar({ name: 'x' }, '000000000000')).res.status).toBe(404);
    expect((await editar({ status: 'apagado' })).res.status).toBe(400);
    expect((await editar({})).res.status).toBe(400);
  });

  it('voltar para active limpa replaced_by, para o alias não seguir a partir de um gesto ativo', async () => {
    const depreciado = { ...LINHA, id: 'deadbeef0001', status: 'deprecated', replaced_by: 'x' };
    const { db, lotes } = banco([depreciado]);
    const res = await app.request(
      `/api/gestures/dictionary/${depreciado.id}`,
      { method: 'PATCH', headers: { ...(await sessao()), 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active' }) },
      env(db, r2().r2)
    );
    expect(res.status).toBe(200);
    expect(lotes[0][0].sql).toMatch(/replaced_by = \?/);
    expect(lotes[0][0].args).toEqual(['Quero', '', '[]', 'active', null, 'deadbeef0001']);
  });
});

describe('POST /api/gestures/dictionary/:id/image', () => {
  async function subir(caminho: string, file: File) {
    const { db, lotes } = banco();
    const { r2: assets, escritos } = r2();
    const form = new FormData();
    form.set('file', file);
    const res = await app.request(caminho, { method: 'POST', headers: await sessao(), body: form }, env(db, assets));
    return { res, lotes, escritos };
  }

  it('troca a figura e sobe a versão', async () => {
    const { res, lotes, escritos } = await subir('/api/gestures/dictionary/c687580e7682/image', new File(['x'], 'a.png', { type: 'image/png' }));
    expect(res.status).toBe(200);
    expect(escritos[0]).toEqual({ key: 'storage/assets/cia/gestures/c687580e7682.png', tipo: 'image/png' });
    expect(lotes[0][0].sql).toMatch(/SET image_key = \?/);
    bumpNoFim(lotes[0]);
  });

  it('GIF saiu de uso: a rota …/gif não existe mais e nada é escrito', async () => {
    const { res, escritos, lotes } = await subir('/api/gestures/dictionary/c687580e7682/gif', new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(res.status).toBe(404);
    expect(escritos).toEqual([]);
    expect(lotes).toEqual([]);
  });

  it('recusa tipo errado e acima de 5 MB', async () => {
    expect((await subir('/api/gestures/dictionary/c687580e7682/image', new File(['x'], 'a.gif', { type: 'image/gif' }))).res.status).toBe(400);
    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' });
    expect((await subir('/api/gestures/dictionary/c687580e7682/image', grande)).res.status).toBe(413);
  });
});
