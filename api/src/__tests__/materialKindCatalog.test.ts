import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

/** O catálogo real do acervo tem estes ids; qualquer outro é lixo. */
const CATALOGO = ['kind1', 'kind2'];

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-kind' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function banco() {
  const escritas: string[] = [];
  const consultasAoCatalogo: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
          if (sql.includes('FROM google_drive_credentials')) return { ok: 1 };
          if (sql.includes('FROM import_jobs WHERE id')) return { id: args[0], status: 'pending' };
          if (sql.includes('FROM praises p')) return { id: args[0], name: 'Louvor', tag_ids: null };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM material_kinds WHERE id IN')) {
            consultasAoCatalogo.push(sql);
            return { results: args.filter((id) => CATALOGO.includes(String(id))).map((id) => ({ id })) };
          }
          return { results: [] };
        }),
        run: vi.fn(async () => {
          escritas.push(sql);
          return {};
        }),
        __sql: sql,
      })),
    })),
    batch: vi.fn(async (stmts: { __sql: string }[]) => {
      for (const s of stmts) escritas.push(s.__sql);
      return [];
    }),
  };

  return { db, escritas, consultasAoCatalogo };
}

function ambiente(db: unknown, r2: unknown) {
  return {
    DB: db,
    ASSETS: r2,
    AUTH_JWT_SECRET: SEGREDO,
    AUTH_ALLOWED_EMAILS: '*',
    WEB_ORIGIN: ORIGEM,
  } as never;
}

function r2Espiao() {
  const escritos: string[] = [];
  return {
    escritos,
    r2: {
      put: vi.fn(async (key: string) => {
        escritos.push(key);
        return {};
      }),
      delete: vi.fn(async () => undefined),
      head: vi.fn(async () => null),
    },
  };
}

async function cabecalhos(json = true) {
  const jwt = await sessao();
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    origin: ORIGEM,
    cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
  };
}

async function postMaterial(materialKind: string) {
  const { db, escritas } = banco();
  const { r2 } = r2Espiao();
  const res = await app.request(
    '/api/praises/praise-1/materials',
    {
      method: 'POST',
      headers: await cabecalhos(),
      body: JSON.stringify({ material_kind: materialKind, type: 'pdf' }),
    },
    ambiente(db, r2)
  );
  return { res, escritas };
}

async function bulkUpload(kinds: string[]) {
  const { db, escritas, consultasAoCatalogo } = banco();
  const { r2, escritos } = r2Espiao();
  const itens = kinds.map((kind, i) => ({ key: `f${i}`, material_kind: kind, type: 'pdf' }));
  const form = new FormData();
  form.set('items', JSON.stringify(itens));
  for (const it of itens) form.set(it.key, new File(['x'], `${it.key}.pdf`));

  const res = await app.request(
    '/api/praises/praise-1/materials/bulk-upload',
    { method: 'POST', headers: await cabecalhos(false), body: form },
    ambiente(db, r2)
  );
  return { res, escritas, escritos, consultasAoCatalogo };
}

async function driveImport(kinds: string[]) {
  const { db, escritas, consultasAoCatalogo } = banco();
  const { r2 } = r2Espiao();
  const res = await app.request(
    '/api/praises/praise-1/materials/drive-import',
    {
      method: 'POST',
      headers: await cabecalhos(),
      body: JSON.stringify({
        items: kinds.map((kind, i) => ({
          drive_file_id: `file-${i}`,
          material_kind: kind,
          type: 'pdf',
        })),
      }),
    },
    ambiente(db, r2)
  );
  return { res, escritas, consultasAoCatalogo };
}

describe('material_kind é validado contra o catálogo', () => {
  it('recusa no POST de material', async () => {
    // praise_materials não tem FK para material_kinds, e a rota só exigia
    // string não vazia: o material era aceito com 200 e sumia dos filtros por
    // categoria, porque nenhuma categoria tem esse id.
    const { res, escritas } = await postMaterial('lixo');

    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { error?: string };
    expect(corpo.error).toContain('lixo');
    expect(escritas.join(' | ')).not.toContain('INSERT INTO praise_materials');
  });

  it('recusa no bulk-upload, sem subir nada ao R2', async () => {
    const { res, escritos, escritas } = await bulkUpload(['kind1', 'lixo']);

    expect(res.status).toBe(400);
    expect(escritos).toHaveLength(0);
    expect(escritas.join(' | ')).not.toContain('INSERT INTO praise_materials');
  });

  it('recusa no drive-import', async () => {
    const { res, escritas } = await driveImport(['lixo']);

    expect(res.status).toBe(400);
    expect(escritas.join(' | ')).not.toContain('INSERT INTO import_jobs');
  });

  it('confere o lote inteiro numa consulta só', async () => {
    // 200 arquivos não podem virar 200 idas ao D1 antes da primeira escrita.
    const kinds = Array.from({ length: 200 }, (_, i) => (i % 2 ? 'kind1' : 'kind2'));
    const { consultasAoCatalogo } = await bulkUpload(kinds);

    expect(consultasAoCatalogo).toHaveLength(1);
  });

  it('deixa passar as categorias que existem', async () => {
    const { res, escritas } = await postMaterial('kind1');

    expect(res.status).not.toBe(400);
    expect(escritas.join(' | ')).toContain('INSERT INTO praise_materials');
  });
});
