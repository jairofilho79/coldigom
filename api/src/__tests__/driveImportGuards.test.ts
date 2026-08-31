import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';
import { MAX_UPLOAD_ITEMS } from '../uploadLimits';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-drive' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function bancoDeImportacao() {
  const escritas: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
          if (sql.includes('FROM google_drive_credentials')) return { ok: 1 };
          if (sql.includes('FROM import_jobs WHERE id')) return { id: args[0], status: 'pending' };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM material_kinds')) return { results: args.map((id) => ({ id })) };
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

  return { db, escritas };
}

async function importar(itens: object[]) {
  const { db, escritas } = bancoDeImportacao();
  const jwt = await sessao();
  const res = await app.request(
    '/api/praises/praise-1/materials/drive-import',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify({ items: itens }),
    },
    {
      DB: db,
      ASSETS: { put: vi.fn(), delete: vi.fn(), head: vi.fn(async () => null) },
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    } as never
  );
  return { res, escritas };
}

function itensValidos(quantidade: number) {
  return Array.from({ length: quantidade }, (_, i) => ({
    drive_file_id: `file-${i}`,
    material_kind: 'kind1',
    type: 'pdf',
  }));
}

describe('drive-import — teto de itens', () => {
  it('recusa uma pasta grande demais', async () => {
    // Não havia teto nenhum: uma pasta do Drive com milhares de arquivos virava
    // uma linha em import_job_items e uma mensagem na fila por arquivo, tudo
    // aceito com 202. A rota irmã (bulk-upload) já recusava acima do limite.
    const { res, escritas } = await importar(itensValidos(MAX_UPLOAD_ITEMS + 1));

    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { error?: string };
    expect(corpo.error).toBe(`Máximo de ${MAX_UPLOAD_ITEMS} arquivos por lote`);
    expect(escritas.join(' | ')).not.toContain('INSERT INTO import_jobs');
  });

  it('aceita um lote no limite', async () => {
    const { res, escritas } = await importar(itensValidos(MAX_UPLOAD_ITEMS));

    expect(res.status).toBe(202);
    expect(escritas.join(' | ')).toContain('INSERT INTO import_jobs');
  });
});
