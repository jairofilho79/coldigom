import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import { requireAppUser, resetAppUserCacheForTests, type AppUser } from '../appUser';
import type { Env } from '../env';

function appWith(env: Partial<Env>) {
  const app = new Hono<{ Bindings: Env; Variables: { appUser: AppUser } }>();
  app.get('/quem', requireAppUser, (c) => c.json(c.get('appUser')));
  return (bearer?: string) =>
    app.request('/quem', { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }, env as Env);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetAppUserCacheForTests();
});

describe('requireAppUser', () => {
  it('sem PLPCG_AUTH_URL → 500', async () => {
    const res = await appWith({})('sess_x');
    expect(res.status).toBe(500);
  });

  it('sem Bearer ou Bearer que não é sess_ → 401 sem chamar o introspect', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const pedir = appWith({ PLPCG_AUTH_URL: 'https://auth.test' });
    expect((await pedir()).status).toBe(401);
    expect((await pedir('eyJ.jwt')).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('introspect 200 → segue com appUser e cacheia por token', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ userId: 'u1', email: 'a@b.c', name: 'Ana', username: 'ana' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const pedir = appWith({ PLPCG_AUTH_URL: 'https://auth.test' });
    const res = await pedir('sess_abc');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'u1', email: 'a@b.c', name: 'Ana' });
    await pedir('sess_abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://auth.test/api/auth/introspect');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sess_abc');
  });

  it('introspect 401 → 401 e não cacheia', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"unauthorized"}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const pedir = appWith({ PLPCG_AUTH_URL: 'https://auth.test' });
    expect((await pedir('sess_abc')).status).toBe(401);
    expect((await pedir('sess_abc')).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('introspect fora do ar (rede ou 5xx) → 503 auth_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const pedir = appWith({ PLPCG_AUTH_URL: 'https://auth.test' });
    const res = await pedir('sess_abc');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'auth_unavailable' });
  });

  it('introspect 200 com corpo não-JSON → 503 auth_unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })));
    const pedir = appWith({ PLPCG_AUTH_URL: 'https://auth.test' });
    const res = await pedir('sess_abc');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'auth_unavailable' });
  });
});
