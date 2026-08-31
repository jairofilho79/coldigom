import {
  buildGoogleAuthorizeRedirect,
  buildLogoutCookies,
  clearAllAuthCookieHeaders,
  consumeAuthExchangeCode,
  getCookie,
  getRefreshCookieName,
  handleOAuthCallback,
  isEmailAllowed,
  resolveUserFromRequest,
  rotateRefreshSession,
} from '../auth';
import { upsertDriveRefreshToken } from '../driveCredentials';
import type { App } from '../env';
import {
  assertTrustedMutationOrigin,
  getAuthCookieSameSite,
  getBaseUrl,
} from '../middleware';
import {
  primaryWebOrigin,
  sanitizePostLoginRedirect,
  sanitizeTrustedRedirect,
} from '../origins';

export function withAuthFlag(
  redirectTo: string,
  auth: 'success' | 'error' | 'drive_connected' | 'drive_error'
): string {
  try {
    const url = new URL(redirectTo);
    url.searchParams.set('auth', auth);
    return url.toString();
  } catch {
    // Relative URL fallback
    try {
      const url = new URL(redirectTo, 'http://local');
      url.searchParams.set('auth', auth);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return redirectTo;
    }
  }
}

export function withAuthExchangeRedirect(redirectTo: string, exchangeCode: string): string {
  try {
    const url = new URL(redirectTo);
    url.searchParams.set('auth', 'exchange');
    url.searchParams.set('code', exchangeCode);
    return url.toString();
  } catch {
    try {
      const url = new URL(redirectTo, 'http://local');
      url.searchParams.set('auth', 'exchange');
      url.searchParams.set('code', exchangeCode);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return redirectTo;
    }
  }
}

/** Rotas de sessão e OAuth. */
export function registerAuthRoutes(app: App): void {
  // Diagnóstico, não é consumido por nenhuma tela: devolve o WEB_ORIGIN inteiro,
  // o callbackUrl e quais segredos existem. Exige sessão. Sem checagem de Origin
  // porque é GET sem efeito — a defesa de CSRF é para mutação.
  app.get('/auth/status', async (c) => {
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    const user = jwtSecret
      ? await resolveUserFromRequest({ request: c.req.raw, jwtSecret }).catch(() => null)
      : null;
    if (!user || !isEmailAllowed(user.email, c.env.AUTH_ALLOWED_EMAILS)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const sameSite = getAuthCookieSameSite(c);
    return c.json({
      googleClientConfigured: Boolean(c.env.GOOGLE_CLIENT_ID),
      googleClientSecretConfigured: Boolean(c.env.GOOGLE_CLIENT_SECRET),
      jwtConfigured: Boolean(c.env.AUTH_JWT_SECRET),
      authBaseUrl: c.env.AUTH_BASE_URL || null,
      webOriginSet: Boolean(c.env.WEB_ORIGIN),
      webOrigin: c.env.WEB_ORIGIN || null,
      cookieSameSiteConfigured: c.env.AUTH_COOKIE_SAMESITE || null,
      cookieSameSiteEffective: sameSite,
      callbackUrl: `${getBaseUrl(c)}/auth/callback`,
    });
  });

  app.get('/auth/login', async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 500);

    const baseUrl = getBaseUrl(c);
    const redirectTo = sanitizePostLoginRedirect(c.req.query('redirect'), c.env.WEB_ORIGIN);
    const { location, setCookies } = await buildGoogleAuthorizeRedirect({
      requestUrl: new URL(c.req.url),
      baseUrl,
      clientId,
      redirectTo,
      db: c.env.DB,
      cookieSameSite: getAuthCookieSameSite(c),
      purpose: 'login',
    });

    setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.redirect(location);
  });

  /** Incremental OAuth: request drive.readonly + offline refresh for the logged-in user. */
  app.get('/auth/drive/connect', async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    if (!clientId || !jwtSecret) return c.json({ error: 'Google OAuth not configured' }, 500);

    const user = await resolveUserFromRequest({ request: c.req.raw, jwtSecret });
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const baseUrl = getBaseUrl(c);
    const redirectTo = sanitizeTrustedRedirect(
      c.req.query('redirect'),
      c.env.WEB_ORIGIN,
      primaryWebOrigin(c.env.WEB_ORIGIN) || '/'
    );
    const { location, setCookies } = await buildGoogleAuthorizeRedirect({
      requestUrl: new URL(c.req.url),
      baseUrl,
      clientId,
      redirectTo,
      db: c.env.DB,
      cookieSameSite: getAuthCookieSameSite(c),
      purpose: 'drive',
    });

    setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.redirect(location);
  });

  app.get('/auth/callback', async (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID;
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    if (!clientId || !jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

    const baseUrl = getBaseUrl(c);
    try {
      const result = await handleOAuthCallback({
        request: c.req.raw,
        requestUrl: new URL(c.req.url),
        baseUrl,
        clientId,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
        jwtSecret,
        db: c.env.DB,
        cookieSameSite: getAuthCookieSameSite(c),
      });
      if (result.purpose === 'drive' && result.googleRefreshToken) {
        await upsertDriveRefreshToken({
          db: c.env.DB,
          userSub: result.user.sub,
          jwtSecret,
          refreshToken: result.googleRefreshToken,
        });
        result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
        return c.redirect(withAuthFlag(result.redirectTo, 'drive_connected'));
      }
      result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
      if (result.exchangeCode) {
        return c.redirect(withAuthExchangeRedirect(result.redirectTo, result.exchangeCode));
      }
      return c.redirect(withAuthFlag(result.redirectTo, 'success'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          msg: 'auth.callback.error',
          error: message,
          hasClientSecret: Boolean(c.env.GOOGLE_CLIENT_SECRET),
        })
      );
      // O caminho feliz sanitiza o destino lá no /auth/login; este aqui pegava o
      // parâmetro cru e redirecionava para qualquer domínio, sem exigir login.
      const fallback = sanitizeTrustedRedirect(
        c.req.query('redirect'),
        c.env.WEB_ORIGIN,
        primaryWebOrigin(c.env.WEB_ORIGIN) || '/'
      );
      const isDrive = message.toLowerCase().includes('drive');
      return c.redirect(withAuthFlag(fallback, isDrive ? 'drive_error' : 'error'));
    }
  });

  app.post('/auth/exchange-code', async (c) => {
    const blocked = assertTrustedMutationOrigin(c);
    if (blocked) return blocked;

    const body = (await c.req.json<{ code?: string }>().catch(() => ({}))) as { code?: string };
    if (!body.code) return c.json({ error: 'Missing code' }, 400);

    const result = await consumeAuthExchangeCode(c.env.DB, body.code);
    if (!result) return c.json({ error: 'Invalid or expired code' }, 401);

    return c.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  });

  app.post('/auth/logout', async (c) => {
    const blocked = assertTrustedMutationOrigin(c);
    if (blocked) return blocked;
    const body = (await c.req.json<{ refreshToken?: string }>().catch(() => ({}))) as { refreshToken?: string };
    const cookies = await buildLogoutCookies({
      request: c.req.raw,
      requestUrl: new URL(c.req.url),
      db: c.env.DB,
      rawRefreshOverride: body.refreshToken,
    });
    cookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.json({ ok: true });
  });

  app.post('/auth/refresh', async (c) => {
    const blocked = assertTrustedMutationOrigin(c);
    if (blocked) return blocked;
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    if (!jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

    const body = (await c.req.json<{ refreshToken?: string }>().catch(() => ({}))) as { refreshToken?: string };
    const rawRefresh = body.refreshToken || getCookie(c.req.raw, getRefreshCookieName());
    if (!rawRefresh) {
      clearAllAuthCookieHeaders(new URL(c.req.url)).forEach(v => c.header('Set-Cookie', v, { append: true }));
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const result = await rotateRefreshSession({
      db: c.env.DB,
      requestUrl: new URL(c.req.url),
      jwtSecret,
      rawRefresh,
      cookieSameSite: getAuthCookieSameSite(c),
    }).catch((error) => {
      console.error('Error rotating refresh session:', error);
      return { error: 'unavailable' as const };
    });

    if ('error' in result && result.error === 'unavailable') {
      return c.json({ error: 'Auth session unavailable' }, 503);
    }

    if ('error' in result) {
      clearAllAuthCookieHeaders(new URL(c.req.url)).forEach(v => c.header('Set-Cookie', v, { append: true }));
      return c.json({ error: 'Unauthorized' }, 401);
    }

    result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.json({
      ok: true,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  });

  app.get('/auth/me', async (c) => {
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    if (!jwtSecret) return c.json({ user: null });
    try {
      const user = await resolveUserFromRequest({ request: c.req.raw, jwtSecret });
      return c.json({ user });
    } catch {
      return c.json({ user: null });
    }
  });
}
