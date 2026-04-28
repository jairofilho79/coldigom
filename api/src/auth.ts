import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

export type AuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  AUTH_BASE_URL?: string;
  WEB_ORIGIN?: string;
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

const SESSION_COOKIE = 'coldigom_session';
const PKCE_VERIFIER_COOKIE = 'coldigom_pkce_verifier';
const STATE_COOKIE = 'coldigom_oauth_state';
const REDIRECT_COOKIE = 'coldigom_post_login_redirect';

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  const b64 = btoa(str);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64UrlEncode(buf);
}

async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(digest));
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

export function clearCookie(requestUrl: URL, name: string): string {
  return buildSetCookie(requestUrl, name, '', { maxAgeSeconds: 0 });
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

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export async function buildGoogleAuthorizeRedirect(params: {
  requestUrl: URL;
  baseUrl: string;
  clientId: string;
  redirectTo: string;
}): Promise<{
  location: string;
  setCookies: string[];
}> {
  const state = randomString(32);
  const codeVerifier = randomString(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  const redirectUri = new URL('/auth/callback', baseUrl).toString();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');

  const setCookies = [
    buildSetCookie(params.requestUrl, PKCE_VERIFIER_COOKIE, codeVerifier, { maxAgeSeconds: 600, sameSite: 'Lax' }),
    buildSetCookie(params.requestUrl, STATE_COOKIE, state, { maxAgeSeconds: 600, sameSite: 'Lax' }),
    buildSetCookie(params.requestUrl, REDIRECT_COOKIE, params.redirectTo, { maxAgeSeconds: 600, sameSite: 'Lax' }),
  ];

  return { location: url.toString(), setCookies };
}

async function exchangeCodeForTokens(params: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{ id_token: string }> {
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
  const json = await res.json() as any;
  if (!json?.id_token) {
    throw new Error('Google token exchange missing id_token');
  }
  return { id_token: json.id_token as string };
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

export async function signSessionJwt(params: {
  jwtSecret: string;
  user: { sub: string; email?: string; name?: string; picture?: string };
}): Promise<string> {
  const secret = new TextEncoder().encode(params.jwtSecret);
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({
    email: params.user.email,
    name: params.user.name,
    picture: params.user.picture,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(params.user.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24 * 7)
    .sign(secret);
}

export async function verifySessionJwt(params: { jwtSecret: string; token: string }): Promise<{
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}> {
  const secret = new TextEncoder().encode(params.jwtSecret);
  const { payload } = await jwtVerify(params.token, secret);
  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

export async function handleOAuthCallback(params: {
  request: Request;
  requestUrl: URL;
  baseUrl: string;
  clientId: string;
  clientSecret?: string;
  jwtSecret: string;
}): Promise<{
  redirectTo: string;
  setCookies: string[];
  user: { sub: string; email?: string; name?: string; picture?: string };
}> {
  const code = params.requestUrl.searchParams.get('code');
  const state = params.requestUrl.searchParams.get('state');
  if (!code || !state) throw new Error('Missing code/state');

  const cookieState = getCookie(params.request, STATE_COOKIE);
  const verifier = getCookie(params.request, PKCE_VERIFIER_COOKIE);
  const redirectTo = getCookie(params.request, REDIRECT_COOKIE) || '/';

  if (!cookieState || cookieState !== state) throw new Error('Invalid state');
  if (!verifier) throw new Error('Missing PKCE verifier');

  const { id_token } = await exchangeCodeForTokens({
    baseUrl: params.baseUrl,
    code,
    codeVerifier: verifier,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });

  const claims = await verifyGoogleIdToken({ idToken: id_token, clientId: params.clientId });
  if (!claims?.sub) throw new Error('Invalid id_token payload');

  const user = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
  };

  const sessionJwt = await signSessionJwt({ jwtSecret: params.jwtSecret, user });

  const setCookies = [
    buildSetCookie(params.requestUrl, SESSION_COOKIE, sessionJwt, { maxAgeSeconds: 60 * 60 * 24 * 7, sameSite: 'Lax' }),
    clearCookie(params.requestUrl, PKCE_VERIFIER_COOKIE),
    clearCookie(params.requestUrl, STATE_COOKIE),
    clearCookie(params.requestUrl, REDIRECT_COOKIE),
  ];

  return { redirectTo, setCookies, user };
}

