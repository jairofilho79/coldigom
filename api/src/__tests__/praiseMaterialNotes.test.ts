import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, sqliteComSchema } from './sqliteD1';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function escrita(method: string, body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-test' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGEM,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    body: JSON.stringify(body),
  };
}

describe('praise_materials.notes (migração 034)', () => {
  it('grava, lê e atualiza notes via API', async () => {
    const sqlite = sqliteComSchema();
    const env = {
      DB: d1DeSqlite(sqlite),
      ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
      WEB_ORIGIN: ORIGEM,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
    };

    // Criar louvor e material_kind
    sqlite.prepare("INSERT INTO praises (id, name, number) VALUES ('p1', 'Louvor Teste', '100')").run();
    sqlite.prepare("INSERT INTO material_kinds (id, name) VALUES ('kind-coro', 'Coro')").run();

    // Criar material com notes
    const createReq = await escrita('POST', {
      material_kind: 'kind-coro',
      type: 'chord',
      notes: 'Cifrado',
    });
    const createRes = await app.request('/api/praises/p1/materials', createReq, env as never);
    expect(createRes.status).toBe(200);

    // Ler no GET /api/praises/:id
    const praiseRes = await app.request('/api/praises/p1', { method: 'GET' }, env as never);
    expect(praiseRes.status).toBe(200);
    const praiseBody = (await praiseRes.json()) as { data: { materials: Array<{ notes?: string | null }> } };
    expect(praiseBody.data.materials.length).toBe(1);
    expect(praiseBody.data.materials[0].notes).toBe('Cifrado');

    // Ler no GET /api/plpcg/catalog
    const catalogRes = await app.request('/api/plpcg/catalog', { method: 'GET' }, env as never);
    expect(catalogRes.status).toBe(200);
    const catalogData = (await catalogRes.json()) as { praises: Array<{ materials: Array<{ notes?: string }> }> };
    expect(catalogData.praises[0].materials[0].notes).toBe('Cifrado');

    // Atualizar notes via PATCH /api/materials/:id
    const matRow = sqlite.prepare("SELECT id FROM praise_materials WHERE praise_id = 'p1'").get() as { id: string };
    const patchReq = await escrita('PATCH', { notes: 'Partitura I' });
    const patchRes = await app.request(`/api/materials/${matRow.id}`, patchReq, env as never);
    expect(patchRes.status).toBe(200);

    const updatedRow = sqlite.prepare("SELECT notes FROM praise_materials WHERE id = ?").get(matRow.id) as { notes: string };
    expect(updatedRow.notes).toBe('Partitura I');
  });
});
