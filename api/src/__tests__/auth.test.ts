import { describe, expect, it } from 'vitest';

import {
  buildGoogleAuthorizeRedirect,
  buildSetCookie,
  clearCookie,
  resolveUserFromCookies,
} from '../auth';
import { SignJWT } from 'jose';

describe('auth cookie policy', () => {
  it('buildSetCookie emits SameSite=None with Secure when requested', () => {
    const url = new URL('https://coldigom-api.example/auth/callback');
    const v = buildSetCookie(url, 'coldigom_access', 'token', { sameSite: 'None', secure: true, maxAgeSeconds: 10 });
    expect(v).toContain('SameSite=None');
    expect(v).toContain('Secure');
    expect(v).toContain('HttpOnly');
    expect(v).toContain('Max-Age=10');
  });

  it('clearCookie can clear with explicit SameSite/secure attributes', () => {
    const url = new URL('https://coldigom-api.example/auth/logout');
    const v = clearCookie(url, 'coldigom_access', { sameSite: 'None', secure: true });
    expect(v).toContain('SameSite=None');
    expect(v).toContain('Secure');
    expect(v).toContain('Max-Age=0');
  });

  it('resolveUserFromCookies reads access cookie signed with same secret', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const jwt = await new SignJWT({ email: 'a@b.com', name: 'Test', jti: 'j1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(secret));

    const req = new Request('https://api.example/auth/me', {
      headers: { cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
    });
    const user = await resolveUserFromCookies({ request: req, jwtSecret: secret });
    expect(user?.sub).toBe('sub-1');
    expect(user?.email).toBe('a@b.com');
  });

  it('buildGoogleAuthorizeRedirect uses cookieSameSite and forces Secure for None', async () => {
    const requestUrl = new URL('https://coldigom-api.example/auth/login');
    const { setCookies } = await buildGoogleAuthorizeRedirect({
      requestUrl,
      baseUrl: 'https://coldigom-api.example',
      clientId: 'test-client-id',
      redirectTo: 'https://app.example/',
      cookieSameSite: 'None',
    });
    expect(setCookies.length).toBeGreaterThanOrEqual(3);
    for (const c of setCookies) {
      expect(c).toContain('SameSite=None');
      expect(c).toContain('Secure');
    }
  });
});

