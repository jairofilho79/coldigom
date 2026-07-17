import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

export type AuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  AUTH_BASE_URL?: string;
  WEB_ORIGIN?: string;
  /**
   * Cookie SameSite policy for session cookies.
   * - `None`: required for cross-site SPA -> API cookie auth.
   * - `Lax`: works when SPA and API are same-site.
   */
  AUTH_COOKIE_SAMESITE?: 'Lax' | 'Strict' | 'None';
};

type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Short-lived JWT (HS256) — API authorization */
export const ACCESS_COOKIE = 'coldigom_access';
/** Opaque rotating refresh token (stored hashed in D1) */
export const REFRESH_COOKIE = 'coldigom_refresh';
/** @deprecated Legacy 7-day session cookie; accepted until expiry for backward compatibility */
const LEGACY_SESSION_COOKIE = 'coldigom_session';

const PKCE_VERIFIER_COOKIE = 'coldigom_pkce_verifier';
const STATE_COOKIE = 'coldigom_oauth_state';
const REDIRECT_COOKIE = 'coldigom_post_login_redirect';
/** `login` (default) | `drive` — selects callback behavior after Google redirects */
const OAUTH_PURPOSE_COOKIE = 'coldigom_oauth_purpose';

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const LOGIN_SCOPES = 'openid email profile';
const DRIVE_SCOPES = `${LOGIN_SCOPES} ${DRIVE_READONLY_SCOPE}`;

/** Access token lifetime (seconds) */
export const ACCESS_TTL_SEC = 300;
/** Refresh token lifetime (seconds) — 30 days */
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30;

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

/** SHA-256 hex for opaque refresh token lookup in D1 */
export async function hashRefreshTokenHex(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

function isHttpsRequest(requestUrl: URL): boolean {
  return requestUrl.protocol === 'https:';
}

export function buildSetCookie(
  requestUrl: URL,
  name: string,
  value: string,
  opts: { maxAgeSeconds?: number; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; path?: string; secure?: boolean } = {}
): string {
  const parts: string[] = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  if (opts.httpOnly ?? true) parts.push('HttpOnly');
  const secure = opts.secure ?? isHttpsRequest(requestUrl);
  if (secure) parts.push('Secure');
  if (opts.maxAgeSeconds !== undefined) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join('; ');
}

export function clearCookie(
  requestUrl: URL,
  name: string,
  opts: { sameSite?: 'Lax' | 'Strict' | 'None'; path?: string; secure?: boolean } = {}
): string {
  return buildSetCookie(requestUrl, name, '', { maxAgeSeconds: 0, ...opts });
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  const parts = header.split(';').map(p => p.trim());
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx);
    if (k !== name) continue;
    const v = part.slice(idx + 1);
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

export function getAccessCookieName(): string {
  return ACCESS_COOKIE;
}

export function getRefreshCookieName(): string {
  return REFRESH_COOKIE;
}

/** @deprecated Use getAccessCookieName */
export function getSessionCookieName(): string {
  return ACCESS_COOKIE;
}

export async function buildGoogleAuthorizeRedirect(params: {
  requestUrl: URL;
  baseUrl: string;
  clientId: string;
  redirectTo: string;
  cookieSameSite?: 'Lax' | 'Strict' | 'None';
  /** Default login identity; `drive` requests drive.readonly + offline refresh token */
  purpose?: 'login' | 'drive';
}): Promise<{
  location: string;
  setCookies: string[];
}> {
  const purpose = params.purpose ?? 'login';
  const state = randomString(32);
  const codeVerifier = randomString(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const redirectUri = new URL('/auth/callback', params.baseUrl).toString();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', purpose === 'drive' ? DRIVE_SCOPES : LOGIN_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (purpose === 'drive') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
  } else {
    url.searchParams.set('prompt', 'select_account');
  }

  const sameSite = params.cookieSameSite ?? 'Lax';
  const secure = sameSite === 'None' ? true : isHttpsRequest(params.requestUrl);
  const setCookies = [
    buildSetCookie(params.requestUrl, PKCE_VERIFIER_COOKIE, codeVerifier, { maxAgeSeconds: 600, sameSite, secure }),
    buildSetCookie(params.requestUrl, STATE_COOKIE, state, { maxAgeSeconds: 600, sameSite, secure }),
    buildSetCookie(params.requestUrl, REDIRECT_COOKIE, params.redirectTo, { maxAgeSeconds: 600, sameSite, secure }),
    buildSetCookie(params.requestUrl, OAUTH_PURPOSE_COOKIE, purpose, { maxAgeSeconds: 600, sameSite, secure }),
  ];

  return { location: url.toString(), setCookies };
}

async function exchangeCodeForTokens(params: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{ id_token: string; access_token?: string; refresh_token?: string; scope?: string }> {
  const redirectUri = new URL('/auth/callback', params.baseUrl).toString();

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', params.code);
  body.set('redirect_uri', redirectUri);
  body.set('client_id', params.clientId);
  body.set('code_verifier', params.codeVerifier);
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!json?.id_token) {
    throw new Error('Google token exchange missing id_token');
  }
  return {
    id_token: json.id_token,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    scope: json.scope,
  };
}

export async function verifyGoogleIdToken(params: {
  idToken: string;
  clientId: string;
}): Promise<GoogleIdTokenClaims> {
  const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  const { payload } = await jwtVerify(params.idToken, jwks, {
    audience: params.clientId,
    issuer: [...GOOGLE_ISSUERS],
  });
  return payload as unknown as GoogleIdTokenClaims;
}

export type AuthUser = { sub: string; email?: string; name?: string; picture?: string };

export async function signAccessJwt(params: {
  jwtSecret: string;
  user: AuthUser;
  jti: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(params.jwtSecret);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: params.user.email,
    name: params.user.name,
    picture: params.user.picture,
    jti: params.jti,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(params.user.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SEC)
    .sign(secret);
}

export async function verifyAccessJwt(params: { jwtSecret: string; token: string }): Promise<AuthUser & { jti?: string }> {
  const secret = new TextEncoder().encode(params.jwtSecret);
  const { payload } = await jwtVerify(params.token, secret);
  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    jti: typeof payload.jti === 'string' ? payload.jti : undefined,
  };
}

/** Legacy long-lived session JWT (7d) — read-only verification for migration */
export async function verifyLegacySessionJwt(params: { jwtSecret: string; token: string }): Promise<AuthUser> {
  const secret = new TextEncoder().encode(params.jwtSecret);
  const { payload } = await jwtVerify(params.token, secret);
  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

export async function insertRefreshTokenRow(params: {
  db: D1Database;
  userSub: string;
  rawRefresh: string;
  /** Persist profile fields for renewal via refresh rotation */
  userClaims?: Pick<AuthUser, 'email' | 'name' | 'picture'>;
}): Promise<{ id: string; tokenHash: string; expiresAt: number }> {
  const id = crypto.randomUUID();
  const tokenHash = await hashRefreshTokenHex(params.rawRefresh);
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;
  const claimsJson = params.userClaims
    ? JSON.stringify({
        email: params.userClaims.email,
        name: params.userClaims.name,
        picture: params.userClaims.picture,
      })
    : null;
  await params.db
    .prepare(
      `INSERT INTO auth_refresh_tokens (id, user_sub, token_hash, expires_at, user_claims) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, params.userSub, tokenHash, expiresAt, claimsJson)
    .run();
  return { id, tokenHash, expiresAt };
}

export async function revokeAllRefreshForUser(db: D1Database, userSub: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_sub = ? AND revoked_at IS NULL`)
    .bind(now, userSub)
    .run();
}

export async function revokeRefreshRowById(db: D1Database, id: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`UPDATE auth_refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).bind(now, id).run();
}

/**
 * Rotate refresh token: validates opaque cookie, issues new access + refresh, revokes old row.
 * On reuse of a revoked token, revokes all sessions for that user.
 */
export async function rotateRefreshSession(params: {
  db: D1Database;
  requestUrl: URL;
  jwtSecret: string;
  rawRefresh: string;
  cookieSameSite?: 'Lax' | 'Strict' | 'None';
}): Promise<{ setCookies: string[]; user: AuthUser } | { error: 'invalid' | 'reuse' }> {
  const hash = await hashRefreshTokenHex(params.rawRefresh);
  const row = await params.db
    .prepare(
      `SELECT id, user_sub, expires_at, revoked_at, user_claims FROM auth_refresh_tokens WHERE token_hash = ?`
    )
    .bind(hash)
    .first<{
      id: string;
      user_sub: string;
      expires_at: number;
      revoked_at: number | null;
      user_claims: string | null;
    }>();

  const now = Math.floor(Date.now() / 1000);
  const sameSite = params.cookieSameSite ?? 'Lax';
  const secure = sameSite === 'None' ? true : isHttpsRequest(params.requestUrl);
  const opts = { sameSite, secure };

  if (!row) {
    return { error: 'invalid' };
  }

  if (row.revoked_at !== null) {
    await revokeAllRefreshForUser(params.db, row.user_sub);
    return { error: 'reuse' };
  }

  if (row.expires_at <= now) {
    await revokeRefreshRowById(params.db, row.id);
    return { error: 'invalid' };
  }

  let claims: Partial<Pick<AuthUser, 'email' | 'name' | 'picture'>> = {};
  if (row.user_claims) {
    try {
      claims = JSON.parse(row.user_claims) as typeof claims;
    } catch {
      claims = {};
    }
  }
  const user: AuthUser = {
    sub: row.user_sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };
  const jti = crypto.randomUUID();
  const accessJwt = await signAccessJwt({ jwtSecret: params.jwtSecret, user, jti });

  const newRawRefresh = randomString(48);
  const newRow = await insertRefreshTokenRow({
    db: params.db,
    userSub: row.user_sub,
    rawRefresh: newRawRefresh,
    userClaims: { email: user.email, name: user.name, picture: user.picture },
  });

  await params.db
    .prepare(`UPDATE auth_refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?`)
    .bind(now, newRow.id, row.id)
    .run();

  const setCookies = [
    buildSetCookie(params.requestUrl, ACCESS_COOKIE, accessJwt, {
      maxAgeSeconds: ACCESS_TTL_SEC,
      ...opts,
    }),
    buildSetCookie(params.requestUrl, REFRESH_COOKIE, newRawRefresh, {
      maxAgeSeconds: REFRESH_TTL_SEC,
      ...opts,
    }),
  ];

  const fullUser = await verifyAccessJwt({ jwtSecret: params.jwtSecret, token: accessJwt });
  return { setCookies, user: fullUser };
}

export async function handleOAuthCallback(params: {
  request: Request;
  requestUrl: URL;
  baseUrl: string;
  clientId: string;
  clientSecret?: string;
  jwtSecret: string;
  db: D1Database;
  cookieSameSite?: 'Lax' | 'Strict' | 'None';
}): Promise<{
  redirectTo: string;
  setCookies: string[];
  user: AuthUser;
  purpose: 'login' | 'drive';
  googleRefreshToken?: string;
}> {
  const code = params.requestUrl.searchParams.get('code');
  const state = params.requestUrl.searchParams.get('state');
  if (!code || !state) throw new Error('Missing code/state');

  const cookieState = getCookie(params.request, STATE_COOKIE);
  const verifier = getCookie(params.request, PKCE_VERIFIER_COOKIE);
  const redirectTo = getCookie(params.request, REDIRECT_COOKIE) || '/';
  const purposeRaw = getCookie(params.request, OAUTH_PURPOSE_COOKIE);
  const purpose: 'login' | 'drive' = purposeRaw === 'drive' ? 'drive' : 'login';

  if (!cookieState || cookieState !== state) throw new Error('Invalid state');
  if (!verifier) throw new Error('Missing PKCE verifier');

  const tokenResponse = await exchangeCodeForTokens({
    baseUrl: params.baseUrl,
    code,
    codeVerifier: verifier,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const claims = await verifyGoogleIdToken({ idToken: tokenResponse.id_token, clientId: params.clientId });
  if (!claims?.sub) throw new Error('Invalid id_token payload');

  const user: AuthUser = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };

  const sameSite = params.cookieSameSite ?? 'Lax';
  const secure = sameSite === 'None' ? true : isHttpsRequest(params.requestUrl);
  const opts = { sameSite, secure };

  if (purpose === 'drive') {
    const sessionUser = await resolveUserFromCookies({
      request: params.request,
      jwtSecret: params.jwtSecret,
    });
    if (!sessionUser) throw new Error('Must be logged in to connect Drive');
    if (sessionUser.sub !== user.sub) {
      throw new Error('Drive Google account must match the logged-in user');
    }
    if (!tokenResponse.refresh_token) {
      throw new Error('Google did not return a Drive refresh token; revoke Coldigom access in Google Account and try again');
    }
    const setCookies = [
      clearCookie(params.requestUrl, PKCE_VERIFIER_COOKIE, opts),
      clearCookie(params.requestUrl, STATE_COOKIE, opts),
      clearCookie(params.requestUrl, REDIRECT_COOKIE, opts),
      clearCookie(params.requestUrl, OAUTH_PURPOSE_COOKIE, opts),
    ];
    return {
      redirectTo,
      setCookies,
      user,
      purpose: 'drive',
      googleRefreshToken: tokenResponse.refresh_token,
    };
  }

  const rawRefresh = randomString(48);
  await insertRefreshTokenRow({
    db: params.db,
    userSub: user.sub,
    rawRefresh,
    userClaims: { email: user.email, name: user.name, picture: user.picture },
  });

  const jti = crypto.randomUUID();
  const accessJwt = await signAccessJwt({ jwtSecret: params.jwtSecret, user, jti });

  const setCookies = [
    buildSetCookie(params.requestUrl, ACCESS_COOKIE, accessJwt, {
      maxAgeSeconds: ACCESS_TTL_SEC,
      ...opts,
    }),
    buildSetCookie(params.requestUrl, REFRESH_COOKIE, rawRefresh, {
      maxAgeSeconds: REFRESH_TTL_SEC,
      ...opts,
    }),
    clearCookie(params.requestUrl, LEGACY_SESSION_COOKIE, opts),
    clearCookie(params.requestUrl, PKCE_VERIFIER_COOKIE, opts),
    clearCookie(params.requestUrl, STATE_COOKIE, opts),
    clearCookie(params.requestUrl, REDIRECT_COOKIE, opts),
    clearCookie(params.requestUrl, OAUTH_PURPOSE_COOKIE, opts),
  ];

  return { redirectTo, setCookies, user, purpose: 'login' };
}

/** Resolve user from access cookie, legacy session cookie, or null */
export async function resolveUserFromCookies(params: {
  request: Request;
  jwtSecret: string;
}): Promise<AuthUser | null> {
  const access = getCookie(params.request, ACCESS_COOKIE);
  if (access) {
    try {
      return await verifyAccessJwt({ jwtSecret: params.jwtSecret, token: access });
    } catch {
      /* fall through */
    }
  }
  const legacy = getCookie(params.request, LEGACY_SESSION_COOKIE);
  if (legacy) {
    try {
      return await verifyLegacySessionJwt({ jwtSecret: params.jwtSecret, token: legacy });
    } catch {
      return null;
    }
  }
  return null;
}

/** Clear auth cookies without DB (e.g. invalid refresh) */
export function clearAllAuthCookieHeaders(requestUrl: URL): string[] {
  return [
    clearCookie(requestUrl, ACCESS_COOKIE),
    clearCookie(requestUrl, REFRESH_COOKIE),
    clearCookie(requestUrl, LEGACY_SESSION_COOKIE),
  ];
}

/** Logout: revoke refresh row if present; clear all auth cookies */
export async function buildLogoutCookies(params: {
  request: Request;
  requestUrl: URL;
  db: D1Database;
}): Promise<string[]> {
  const rawRefresh = getCookie(params.request, REFRESH_COOKIE);
  if (rawRefresh) {
    const hash = await hashRefreshTokenHex(rawRefresh);
    const row = await params.db
      .prepare(`SELECT id FROM auth_refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL`)
      .bind(hash)
      .first<{ id: string }>();
    if (row?.id) {
      await revokeRefreshRowById(params.db, row.id);
    }
  }

  return [
    clearCookie(params.requestUrl, ACCESS_COOKIE),
    clearCookie(params.requestUrl, REFRESH_COOKIE),
    clearCookie(params.requestUrl, LEGACY_SESSION_COOKIE),
  ];
}
