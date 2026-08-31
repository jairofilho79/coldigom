import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';
import { isOriginAllowed, isTrustedWebOrigin } from '../origins';

/**
 * O curinga do WEB_ORIGIN era decorativo: os dois ramos de isTrustedWebOrigin
 * eram a MESMA expressão, e hostnameMatchesBaseDomain casa qualquer subdomínio.
 * Logo `https://web.example` confiava em `https://atacante.web.example`, e isso
 * é superfície de CSRF para toda mutação da API.
 */
describe('isTrustedWebOrigin — entrada sem curinga', () => {
  it('recusa subdomínio de entrada sem curinga', () => {
    expect(isTrustedWebOrigin('https://atacante.web.example', 'https://web.example')).toBe(false);
    expect(isTrustedWebOrigin('https://a.b.web.example', 'https://web.example')).toBe(false);
  });

  it('aceita a própria origem', () => {
    expect(isTrustedWebOrigin('https://web.example', 'https://web.example')).toBe(true);
  });

  it('recusa subdomínio também quando a entrada vem sem esquema', () => {
    expect(isTrustedWebOrigin('https://atacante.web.example', 'web.example')).toBe(false);
    expect(isTrustedWebOrigin('https://web.example', 'web.example')).toBe(true);
  });

  it('continua exigindo o mesmo protocolo', () => {
    expect(isTrustedWebOrigin('http://web.example', 'https://web.example')).toBe(false);
  });
});

describe('isTrustedWebOrigin — entrada com curinga', () => {
  it('aceita apex e subdomínios', () => {
    expect(isTrustedWebOrigin('https://plpcg.com', 'https://*plpcg.com')).toBe(true);
    expect(isTrustedWebOrigin('https://v2.plpcg.com', 'https://*plpcg.com')).toBe(true);
    expect(isTrustedWebOrigin('https://120826.plpcg.com', 'https://*plpcg.com')).toBe(true);
  });

  it('recusa domínio parecido', () => {
    expect(isTrustedWebOrigin('https://evilplpcg.com', 'https://*plpcg.com')).toBe(false);
    expect(isTrustedWebOrigin('https://plpcg.com.evil.com', 'https://*plpcg.com')).toBe(false);
  });
});

describe('isOriginAllowed com a configuração real de produção', () => {
  const PRODUCAO =
    'https://coldigom-web.pages.dev,https://*plpcg.com,https://plpcg-v2.pages.dev,https://plpcjf.org,https://plpcg-120826.pages.dev';

  it('mantém todas as entradas configuradas hoje', () => {
    for (const origem of [
      'https://coldigom-web.pages.dev',
      'https://plpcg.com',
      'https://v2.plpcg.com',
      'https://plpcg-v2.pages.dev',
      'https://plpcjf.org',
      'https://plpcg-120826.pages.dev',
    ]) {
      expect(isOriginAllowed(origem, PRODUCAO)).toBe(true);
    }
  });

  it('deixa de confiar em subdomínio das entradas sem curinga', () => {
    // Inclui os previews do Pages (<hash>.coldigom-web.pages.dev), que passavam
    // por acidente. Se algum deles precisar voltar, entra no CSV com curinga.
    expect(isOriginAllowed('https://atacante.coldigom-web.pages.dev', PRODUCAO)).toBe(false);
    expect(isOriginAllowed('https://atacante.plpcjf.org', PRODUCAO)).toBe(false);
  });
});

describe('assertTrustedMutationOrigin com origem de subdomínio', () => {
  it('devolve 403 numa mutação vinda de subdomínio da origem confiável', async () => {
    const db = { prepare: vi.fn() };
    const res = await app.request(
      '/api/materials/mat-1',
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'https://atacante.web.example',
        },
        body: JSON.stringify({ material_kind: 'k1' }),
      },
      {
        DB: db,
        ASSETS: {},
        AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
        AUTH_ALLOWED_EMAILS: '*',
        WEB_ORIGIN: 'https://web.example',
      } as never
    );

    expect(res.status).toBe(403);
  });
});
