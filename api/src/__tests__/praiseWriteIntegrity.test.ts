import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function comSessao(method: string, body: object): Promise<RequestInit> {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-w' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  return {
    method,
    headers: {
      'content-type': 'application/json',
      origin: TEST_WEB_ORIGIN,
      cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
    },
    body: JSON.stringify(body),
  };
}

function db() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
    batch: vi.fn(async () => []),
  };
}

const env = {
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
  ASSETS: {},
};

async function patch(corpo: object) {
  return app.request(
    '/api/praises/praise-1',
    await comSessao('PATCH', corpo),
    { ...env, DB: db() } as never
  );
}

describe('PATCH /api/praises/:id — integridade do nome', () => {
  it('recusa apagar o nome', async () => {
    // POST exige nome não vazio; o PATCH aceitava null para QUALQUER campo,
    // inclusive name. Duas rotas com regras diferentes para o mesmo dado, e o
    // resultado era um louvor sem nome no acervo.
    expect((await patch({ name: null })).status).toBe(400);
  });

  it('recusa nome vazio ou só com espaço', async () => {
    expect((await patch({ name: '' })).status).toBe(400);
    expect((await patch({ name: '   ' })).status).toBe(400);
  });

  it('a mensagem diz qual campo está errado', async () => {
    const res = await patch({ name: null });
    const corpo = (await res.json()) as { error?: string };
    expect(corpo.error).toMatch(/name/);
  });

  it('continua aceitando apagar os campos que são opcionais', async () => {
    // author, rhythm, tonality e categoria podem ser nulos — só o nome não.
    expect((await patch({ author: null, rhythm: null })).status).not.toBe(400);
  });

  it('aceita renomear normalmente', async () => {
    expect((await patch({ name: 'Novo Nome' })).status).not.toBe(400);
  });
});
