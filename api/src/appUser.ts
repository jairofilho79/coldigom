import type { Context, Next } from 'hono';

import type { Env } from './env';

export type AppUser = { userId: string; email: string | null; name: string | null };

type Ctx = Context<{ Bindings: Env; Variables: { appUser: AppUser } }>;

const CACHE_TTL_MS = 5 * 60 * 1000;
const SESSION_PREFIX = 'sess_';

/** Cache por isolate: cada pedido da app não pode custar uma ida ao plpcg-catalog. */
let cache = new Map<string, { user: AppUser; exp: number }>();

export function resetAppUserCacheForTests(): void {
  cache = new Map();
}

async function cacheKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Autentica o usuário da app PLPCG (token `sess_…` do plpcg-catalog).
 * Só sessão: um id_token do Google vazado não abre contribuição.
 * Introspect indisponível é 503, não 401 — a app mostra «tente de novo»
 * mantendo o formulário, em vez de deslogar a pessoa.
 */
export async function requireAppUser(c: Ctx, next: Next) {
  const base = c.env.PLPCG_AUTH_URL?.trim();
  if (!base) return c.json({ error: 'Auth not configured' }, 500);

  const header = c.req.header('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith(SESSION_PREFIX)) return c.json({ error: 'unauthorized' }, 401);

  const key = await cacheKey(token);
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) {
    c.set('appUser', hit.user);
    return await next();
  }

  let res: Response;
  let body: { userId?: string; email?: string | null; name?: string | null };
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/api/auth/introspect`, {
      headers: { authorization: `Bearer ${token}` },
      // Um plpcg-catalog pendurado não pode travar a rota da app esperando
      // para sempre — 5 s estoura para o mesmo catch/503 de uma rede fora do ar.
      signal: AbortSignal.timeout(5000),
    });
    // 401 não precisa de corpo válido para ser 401 — checa o status antes de
    // tentar o parse, senão um 401 com corpo vazio/errado viraria 503.
    if (res.status === 401) return c.json({ error: 'unauthorized' }, 401);
    if (!res.ok) return c.json({ error: 'auth_unavailable' }, 503);
    // res.json() lança se o corpo não for JSON válido; um introspect que
    // responde 200 com lixo é tão "fora do ar" quanto uma rede que falhou —
    // por isso o parse mora dentro do try, e cai no mesmo 503.
    body = (await res.json()) as typeof body;
  } catch {
    return c.json({ error: 'auth_unavailable' }, 503);
  }
  if (typeof body.userId !== 'string' || !body.userId) return c.json({ error: 'auth_unavailable' }, 503);
  const user: AppUser = { userId: body.userId, email: body.email ?? null, name: body.name ?? null };
  cache.set(key, { user, exp: Date.now() + CACHE_TTL_MS });
  c.set('appUser', user);
  return await next();
}
