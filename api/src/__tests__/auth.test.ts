import { describe, expect, it, vi } from 'vitest';

import {
  buildGoogleAuthorizeRedirect,
  buildSetCookie,
  clearCookie,
  consumeAuthExchangeCode,
  createAuthExchangeCode,
  isEmailAllowed,
  resolveUserFromCookies,
  resolveUserFromRequest,
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

  it('resolveUserFromRequest reads Bearer token', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const jwt = await new SignJWT({ email: 'a@b.com', name: 'Test', jti: 'j1' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(secret));

    const req = new Request('https://api.example/auth/me', {
      headers: { authorization: `Bearer ${jwt}` },
    });
    const user = await resolveUserFromRequest({ request: req, jwtSecret: secret });
    expect(user?.sub).toBe('sub-1');
    expect(user?.email).toBe('a@b.com');
  });

  it('buildGoogleAuthorizeRedirect stores PKCE in D1 and emits no cookies', async () => {
    const requestUrl = new URL('https://coldigom-api.example/auth/login');
    const run = vi.fn().mockResolvedValue({});
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run })),
      })),
    } as unknown as D1Database;

    const { setCookies, location } = await buildGoogleAuthorizeRedirect({
      requestUrl,
      baseUrl: 'https://coldigom-api.example',
      clientId: 'test-client-id',
      redirectTo: 'https://app.example/',
      db,
      cookieSameSite: 'None',
    });
    expect(setCookies).toEqual([]);
    expect(location).toContain('accounts.google.com');
    expect(run).toHaveBeenCalled();
  });

  it('buildGoogleAuthorizeRedirect drive purpose requests offline consent', async () => {
    const requestUrl = new URL('https://coldigom-api.example/auth/drive/connect');
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })),
      })),
    } as unknown as D1Database;
    const { location, setCookies } = await buildGoogleAuthorizeRedirect({
      requestUrl,
      baseUrl: 'https://coldigom-api.example',
      clientId: 'test-client-id',
      redirectTo: 'https://app.example/praise/1',
      db,
      cookieSameSite: 'None',
      purpose: 'drive',
    });
    const url = new URL(location);
    expect(url.searchParams.get('scope')).toContain('drive.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(setCookies).toEqual([]);
  });
});

describe('isEmailAllowed', () => {
  it('recusa quando não há política configurada', () => {
    // Fail closed: sem AUTH_ALLOWED_EMAILS a API não deve deixar ninguém entrar,
    // nem mesmo quem tem um JWT válido. Esquecer a variável não pode virar
    // "liberado para todo mundo".
    expect(isEmailAllowed('a@b.com', undefined)).toBe(false);
    expect(isEmailAllowed('a@b.com', '')).toBe(false);
    expect(isEmailAllowed('a@b.com', '   ')).toBe(false);
  });

  it('com "*" delega à lista de usuários de teste do OAuth no Google', () => {
    expect(isEmailAllowed('qualquer@gmail.com', '*')).toBe(true);
    expect(isEmailAllowed(undefined, '*')).toBe(true);
    expect(isEmailAllowed('a@b.com', ' * ')).toBe(true);
  });

  it('com lista, admite só quem está nela', () => {
    const lista = 'jairofilho79@gmail.com,outro@exemplo.org';
    expect(isEmailAllowed('jairofilho79@gmail.com', lista)).toBe(true);
    expect(isEmailAllowed('outro@exemplo.org', lista)).toBe(true);
    expect(isEmailAllowed('intruso@gmail.com', lista)).toBe(false);
  });

  it('compara sem diferenciar maiúsculas nem espaços em volta', () => {
    const lista = ' Jairofilho79@Gmail.com , outro@exemplo.org ';
    expect(isEmailAllowed('jairofilho79@gmail.com', lista)).toBe(true);
    expect(isEmailAllowed('  OUTRO@EXEMPLO.ORG  ', lista)).toBe(true);
  });

  it('com lista, recusa sessão sem e-mail', () => {
    // O id_token do Google pode vir sem email se o escopo mudar; nesse caso não
    // há como conferir a lista, e o certo é recusar.
    expect(isEmailAllowed(undefined, 'a@b.com')).toBe(false);
    expect(isEmailAllowed('', 'a@b.com')).toBe(false);
  });
});

describe('consumeAuthExchangeCode', () => {
  /**
   * Banco que devolve sempre a mesma linha não usada — é o que um D1 real faz
   * para duas leituras concorrentes antes de qualquer escrita. A marcação de uso
   * precisa ser condicional na própria escrita; conferir depois de ler não basta.
   */
  function dbComCorrida() {
    let linhasAfetadasNaProxima = 1;
    const updates: string[] = [];
    const db = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (!query.includes('SELECT')) return null;
            return {
              access_token: 'access-1',
              refresh_token: 'refresh-1',
              user_json: JSON.stringify({ sub: 'sub-1', email: 'a@b.com' }),
              used_at: null,
            };
          }),
          run: vi.fn(async () => {
            if (query.includes('UPDATE')) {
              updates.push(query);
              const changes = linhasAfetadasNaProxima;
              linhasAfetadasNaProxima = 0;
              return { meta: { changes } };
            }
            return { meta: { changes: 0 } };
          }),
        })),
      })),
    } as unknown as D1Database;
    return { db, updates };
  }

  it('só entrega os tokens uma vez, mesmo com duas leituras simultâneas', async () => {
    const { db } = dbComCorrida();

    const primeira = await consumeAuthExchangeCode(db, 'codigo-1');
    const segunda = await consumeAuthExchangeCode(db, 'codigo-1');

    expect(primeira?.accessToken).toBe('access-1');
    expect(segunda).toBeNull();
  });

  it('marca o uso com escrita condicional, não com conferência prévia', async () => {
    const { db, updates } = dbComCorrida();
    await consumeAuthExchangeCode(db, 'codigo-1');
    expect(updates[0]).toMatch(/used_at IS NULL/);
  });
});

describe('endurecimento da verificação de token', () => {
  const secret = '0123456789abcdef0123456789abcdef';

  it('recusa JWT assinado com outro algoritmo, mesmo com o segredo certo', async () => {
    // Sem fixar o algoritmo, a verificação aceita qualquer HS*. A jose infere
    // pelo tipo da chave hoje, mas nada no código trava isso — e travar é o que
    // impede uma regressão silenciosa numa troca de biblioteca.
    const hs512 = await new SignJWT({ email: 'a@b.com', jti: 'j1' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(secret));

    const req = new Request('https://api.example/auth/me', {
      headers: { authorization: `Bearer ${hs512}` },
    });
    expect(await resolveUserFromRequest({ request: req, jwtSecret: secret })).toBeNull();
  });

  it('não aceita mais o cookie de sessão legado', async () => {
    // Depreciado em 2026-04-28 com TTL de 7 dias: nenhuma sessão legada existe
    // desde 05/05. Manter o caminho vivo só preservava dois formatos de token
    // indistinguíveis, verificados com o mesmo segredo.
    const legado = await new SignJWT({ email: 'a@b.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-legado')
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(secret));

    const req = new Request('https://api.example/auth/me', {
      headers: { cookie: `coldigom_session=${encodeURIComponent(legado)}` },
    });
    expect(await resolveUserFromCookies({ request: req, jwtSecret: secret })).toBeNull();
  });
});

describe('limpeza das tabelas efêmeras', () => {
  function dbQueSpiona() {
    const queries: string[] = [];
    const db = {
      prepare: vi.fn((query: string) => {
        queries.push(query);
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
            first: vi.fn(async () => null),
          })),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        };
      }),
    } as unknown as D1Database;
    return { db, queries };
  }

  it('abrir um login apaga os oauth_pending vencidos', async () => {
    // Só havia DELETE no sucesso do callback. Toda tentativa abandonada ficava
    // no D1 para sempre.
    const { db, queries } = dbQueSpiona();
    await buildGoogleAuthorizeRedirect({
      requestUrl: new URL('https://api.example/auth/login'),
      baseUrl: 'https://api.example',
      clientId: 'cid',
      redirectTo: '/',
      db,
    });
    expect(queries.some((q) => /DELETE FROM oauth_pending WHERE expires_at/.test(q))).toBe(true);
  });

  it('criar um código de troca apaga os vencidos', async () => {
    const { db, queries } = dbQueSpiona();
    await createAuthExchangeCode({
      db,
      accessToken: 'a',
      refreshToken: 'r',
      user: { sub: 'sub-1' },
    });
    expect(queries.some((q) => /DELETE FROM auth_exchange_codes WHERE expires_at/.test(q))).toBe(true);
  });
});
