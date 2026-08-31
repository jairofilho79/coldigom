import type { Context, Next } from 'hono';

import {
  isEmailAllowed,
  resolveUserFromRequest,
  timingSafeEqual,
  type AuthUser,
} from './auth';
import { isOriginAllowed } from './origins';
import type { Env } from './env';

export type AppContext = Context<{ Bindings: Env; Variables: { user: AuthUser } }>;

export function getBaseUrl(c: AppContext): string {
  // Prefer explicit AUTH_BASE_URL (recommended in production)
  if (c.env.AUTH_BASE_URL) return c.env.AUTH_BASE_URL;
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

export function getAuthCookieSameSite(c: { env: Env; req: { url: string } }): 'Lax' | 'Strict' | 'None' {
  // Explicit override wins
  if (c.env.AUTH_COOKIE_SAMESITE) return c.env.AUTH_COOKIE_SAMESITE;
  // If WEB_ORIGIN is configured, this deployment is expected to be called from a separate SPA origin.
  // Cookie-based auth in that scenario requires SameSite=None for fetch/XHR.
  const isHttps = new URL(c.req.url).protocol === 'https:';
  if (c.env.WEB_ORIGIN && isHttps) return 'None';
  // Local/insecure fallback (browsers reject SameSite=None without Secure on HTTP)
  return 'Lax';
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function assertTrustedMutationOrigin(c: { env: Env; req: { header: (n: string) => string | undefined }; json: (b: object, s: number) => Response }): Response | null {
  const web = c.env.WEB_ORIGIN;
  if (!web) return null;
  const origin = c.req.header('origin');
  if (!isOriginAllowed(origin, web)) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

export async function requireAuth(c: AppContext, next: Next) {
  const blocked = assertTrustedMutationOrigin(c);
  if (blocked) return blocked;

  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

  // Política de autorização é configuração obrigatória: sem ela a API recusa
  // tudo, em vez de liberar. Ver AUTH_ALLOWED_EMAILS no wrangler.toml.
  const allowList = c.env.AUTH_ALLOWED_EMAILS?.trim();
  if (!allowList) {
    console.error(
      JSON.stringify({
        msg: 'auth.config.missing',
        detail: 'AUTH_ALLOWED_EMAILS não está configurada; toda rota autenticada recusa.',
      })
    );
    return c.json({ error: 'Auth not configured' }, 500);
  }

  try {
    const user = c.get('user') ?? (await resolveUserFromRequest({ request: c.req.raw, jwtSecret }));
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (!isEmailAllowed(user.email, allowList)) {
      console.warn(
        JSON.stringify({ msg: 'auth.forbidden', method: c.req.method, path: c.req.path })
      );
      return c.json({ error: 'Forbidden' }, 403);
    }
    c.set('user', user);
    return await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}

export function bearerToken(c: { req: { header: (n: string) => string | undefined } }): string {
  const h = c.req.header('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** Review-app upload token (no Origin) or admin JWT. */
export async function requireUploadOrAuth(c: AppContext, next: Next) {
  const uploadToken = c.env.COLDIGOM_UPLOAD_TOKEN?.trim();
  const token = bearerToken(c);

  // O token de upload é um atalho para o review-app, que roda sem sessão.
  // Um Bearer que NÃO é ele não é erro: é o JWT de quem está logado no navegador,
  // e precisa seguir para o requireAuth. Rejeitar aqui derrubava todo usuário
  // logado com 401 — estar autenticado era exatamente o que quebrava.
  if (uploadToken && token && (await timingSafeEqual(token, uploadToken))) return await next();

  return requireAuth(c, next);
}
