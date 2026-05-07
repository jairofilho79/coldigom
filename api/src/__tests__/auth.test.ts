import { describe, expect, it } from 'vitest';

import { buildGoogleAuthorizeRedirect, buildSetCookie, clearCookie } from '../auth';

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

