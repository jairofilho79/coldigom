import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { app } from '../index';
import { d1DeSqlite, lerSqlDaApi } from './sqliteD1';

const secret = '0123456789abcdef0123456789abcdef';
const origin = 'https://web.example';

async function token(email: string) {
  return new SignJWT({ email }).setProtectedHeader({ alg: 'HS256' })
    .setSubject('reviewer').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
}

function ambiente() {
  const sqlite = new DatabaseSync(':memory:');
  const schemaAnterior = lerSqlDaApi('schema.sql')
    .replace(/^.*is_reviewed INTEGER NOT NULL DEFAULT 0,.*\n/m, '')
    .replace(/^.*reviewed_at TEXT,.*\n/m, '')
    .replace(/^.*reviewed_by TEXT,.*\n/m, '')
    .replace(/^CREATE INDEX IF NOT EXISTS idx_praises_is_reviewed.*\n/m, '');
  sqlite.exec(schemaAnterior);
  sqlite.exec("INSERT INTO praises (id, name, number) VALUES ('p1', 'Louvor', '001')");
  sqlite.exec(lerSqlDaApi('migrations/022_praise_is_reviewed.sql'));
  const env = {
    DB: d1DeSqlite(sqlite), ASSETS: { head: async () => null },
    AUTH_JWT_SECRET: secret, AUTH_ALLOWED_EMAILS: 'admin@test.com', WEB_ORIGIN: origin,
  } as never;
  return { sqlite, env };
}

describe('revisão administrativa de louvor', () => {
  it('migra louvores existentes e cria índice sem afetar os dados', () => {
    const { sqlite } = ambiente();
    expect({ ...sqlite.prepare('SELECT name, is_reviewed, reviewed_at, reviewed_by FROM praises WHERE id = ?').get('p1') })
      .toEqual({ name: 'Louvor', is_reviewed: 0, reviewed_at: null, reviewed_by: null });
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_praises_is_reviewed'").get()).toBeTruthy();
  });

  it('protege identidade nos GETs públicos e permite consulta apenas ao administrador autorizado', async () => {
    const { env } = ambiente();
    const admin = await token('admin@test.com');
    const headers = { origin, authorization: `Bearer ${admin}` };
    const patch = await app.request('/api/praises/p1', {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ is_reviewed: true }),
    }, env);
    expect(patch.status).toBe(200);
    const list = await app.request('/api/praises?limit=10', {}, env);
    const detail = await app.request('/api/praises/p1', {}, env);
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    const listData = await list.json() as { data: Record<string, unknown>[] };
    const detailData = await detail.json() as { data: Record<string, unknown> };
    expect(listData.data[0]).toMatchObject({ is_reviewed: 1 });
    expect(detailData.data).toMatchObject({ is_reviewed: 1 });
    expect(listData.data[0]).not.toHaveProperty('reviewed_by');
    expect(detailData.data).not.toHaveProperty('reviewed_by');
    expect(JSON.stringify(await patch.json())).not.toContain('admin@test.com');
    const adminReview = await app.request('/api/admin/praises/p1/review', { headers }, env);
    expect(adminReview.status).toBe(200);
    expect(adminReview.headers.get('cache-control')).toBe('no-store');
    expect(await adminReview.json()).toMatchObject({ data: { is_reviewed: 1, reviewed_by: 'admin@test.com' } });
    expect((await app.request('/api/admin/praises/absent/review', { headers }, env)).status).toBe(404);
    expect((await app.request('/api/admin/praises/p1/review', { headers: { origin } }, env)).status).toBe(401);
    const denied = await token('other@test.com');
    expect((await app.request('/api/admin/praises/p1/review', {
      headers: { origin, authorization: `Bearer ${denied}` },
    }, env)).status).toBe(403);
  });

  it('mantém a marca após edição de metadados e limpa os três campos ao desmarcar', async () => {
    const { env, sqlite } = ambiente();
    const headers = { origin, authorization: `Bearer ${await token('admin@test.com')}`, 'content-type': 'application/json' };
    for (const body of [{ is_reviewed: true }, { name: 'Outro nome' }]) {
      expect((await app.request('/api/praises/p1', { method: 'PATCH', headers, body: JSON.stringify(body) }, env)).status).toBe(200);
    }
    expect(sqlite.prepare('SELECT is_reviewed FROM praises WHERE id = ?').get('p1')?.is_reviewed).toBe(1);
    expect((await app.request('/api/praises/p1', {
      method: 'PATCH', headers, body: JSON.stringify({ is_reviewed: false }),
    }, env)).status).toBe(200);
    expect({ ...sqlite.prepare('SELECT is_reviewed, reviewed_at, reviewed_by FROM praises WHERE id = ?').get('p1') })
      .toEqual({ is_reviewed: 0, reviewed_at: null, reviewed_by: null });
  });
});
