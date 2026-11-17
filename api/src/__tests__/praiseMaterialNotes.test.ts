import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { d1DeSqlite, lerSqlDaApi, sqliteComSchema } from './sqliteD1';

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
    sqlite.prepare(
      "INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES ('m-existing', 'p1', 'kind-coro', 'pdf')"
    ).run();

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
    expect(praiseBody.data.materials.length).toBe(2);
    expect(praiseBody.data.materials.find((material) => material.notes)?.notes).toBe('Cifrado');

    // Ler no GET /api/plpcg/catalog
    const catalogRes = await app.request('/api/plpcg/catalog', { method: 'GET' }, env as never);
    expect(catalogRes.status).toBe(200);
    const catalogData = (await catalogRes.json()) as { praises: Array<{ materials: Array<{ notes?: string }> }> };
    expect(catalogData.praises[0].materials.find((material) => material.notes)?.notes).toBe('Cifrado');

    // Atualizar notes via PATCH /api/materials/:id
    const matRow = sqlite.prepare("SELECT id FROM praise_materials WHERE notes IS NOT NULL").get() as { id: string };
    const patchReq = await escrita('PATCH', { notes: 'Partitura I' });
    const patchRes = await app.request(`/api/materials/${matRow.id}`, patchReq, env as never);
    expect(patchRes.status).toBe(200);

    const updatedRow = sqlite.prepare("SELECT notes FROM praise_materials WHERE id = ?").get(matRow.id) as { notes: string };
    expect(updatedRow.notes).toBe('Partitura I');
  });
});

describe('trava de praise_materials.notes (migração 035)', () => {
  function criarMateriais(): ReturnType<typeof sqliteComSchema> {
    const sqlite = sqliteComSchema();
    sqlite.exec(`
      DROP TRIGGER IF EXISTS praise_materials_notes_bi;
      DROP TRIGGER IF EXISTS praise_materials_notes_bu;
    `);
    sqlite.exec(lerSqlDaApi('migrations/035_praise_material_notes_guard.sql'));
    sqlite.prepare("INSERT INTO praises (id, name, number) VALUES ('p1', 'Louvor 1', '100')").run();
    sqlite.prepare("INSERT INTO praises (id, name, number) VALUES ('p2', 'Louvor 2', '200')").run();
    sqlite.prepare("INSERT INTO material_kinds (id, name) VALUES ('kind-coro', 'Coro')").run();
    sqlite.prepare("INSERT INTO material_kinds (id, name) VALUES ('kind-pdf', 'PDF')").run();
    return sqlite;
  }

  it('rejeita INSERT direto com nota quando não há outro material do mesmo tipo no praise', () => {
    const sqlite = criarMateriais();

    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO praise_materials (id, praise_id, material_kind, type, notes) VALUES (?, ?, ?, ?, ?)'
        )
        .run('m1', 'p1', 'kind-coro', 'chord', 'Cifrado')
    ).toThrow();
  });

  it('não deixa INSERT OR REPLACE contar o próprio material como duplicado', () => {
    const sqlite = criarMateriais();
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m1', 'p1', 'kind-coro', 'chord');

    expect(() =>
      sqlite
        .prepare(
          'INSERT OR REPLACE INTO praise_materials (id, praise_id, material_kind, type, notes) VALUES (?, ?, ?, ?, ?)'
        )
        .run('m1', 'p1', 'kind-coro', 'chord', 'Cifrado')
    ).toThrow();
  });

  it('rejeita UPDATE direto ao adicionar nota sem duplicidade no mesmo praise', () => {
    const sqlite = criarMateriais();
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m1', 'p1', 'kind-coro', 'chord');

    expect(() => sqlite.prepare('UPDATE praise_materials SET notes = ? WHERE id = ?').run('Cifrado', 'm1')).toThrow();
  });

  it('permite nota quando outro material tem o mesmo tipo no mesmo praise', () => {
    const sqlite = criarMateriais();
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m1', 'p1', 'kind-coro', 'chord');
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m2', 'p2', 'kind-coro', 'pdf');
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m3', 'p1', 'kind-pdf', 'pdf');

    expect(() => sqlite.prepare('UPDATE praise_materials SET notes = ? WHERE id = ?').run('Cifrado', 'm1')).toThrow();

    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m4', 'p1', 'kind-coro', 'pdf');
    sqlite.prepare('UPDATE praise_materials SET notes = ? WHERE id = ?').run('Cifrado', 'm1');

    expect(sqlite.prepare('SELECT notes FROM praise_materials WHERE id = ?').get('m1')).toMatchObject({
      notes: 'Cifrado',
    });
  });

  it('mantém notas existentes quando a duplicidade desaparece', () => {
    const sqlite = criarMateriais();
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m1', 'p1', 'kind-coro', 'chord');
    sqlite
      .prepare('INSERT INTO praise_materials (id, praise_id, material_kind, type) VALUES (?, ?, ?, ?)')
      .run('m2', 'p1', 'kind-coro', 'pdf');
    sqlite.prepare('UPDATE praise_materials SET notes = ? WHERE id = ?').run('Cifrado', 'm1');

    sqlite.prepare('DELETE FROM praise_materials WHERE id = ?').run('m2');
    sqlite.prepare('UPDATE praise_materials SET type = ? WHERE id = ?').run('mp3', 'm1');

    expect(sqlite.prepare('SELECT notes FROM praise_materials WHERE id = ?').get('m1')).toMatchObject({
      notes: 'Cifrado',
    });
  });
});
