import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const ORIGEM = 'https://web.example';

function r2Com(chave: string, corpo: string) {
  return {
    head: vi.fn(async (k: string) => (k === chave ? { size: corpo.length, httpEtag: '"v1"' } : null)),
    get: vi.fn(async (k: string) => (k === chave ? { body: corpo } : null)),
  };
}

describe('/assets/* — tipos de conteúdo dos gestos', () => {
  it.each([
    ['assets/praises/p1/m1.gestures', 'application/json; charset=utf-8'],
    ['assets/cia/gestures/c687580e7682.png', 'image/png'],
    ['assets/cia/gestures/c687580e7682.gif', 'image/gif'],
  ])('%s → %s', async (chave, tipo) => {
    const res = await app.request(`/${chave}`, {}, { ASSETS: r2Com(`storage/${chave}`, '{}') } as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(tipo);
    expect(res.headers.get('etag')).toBe('"v1"');
  });
});

describe('CORS — gravação condicional a partir do navegador', () => {
  it('o preflight aceita If-Match e If-None-Match', async () => {
    // Sem isto, o PUT com If-Match nem sai do navegador em dev, onde o web fala
    // com o Worker por outra origem.
    const res = await app.request(
      '/api/materials/m1/content',
      {
        method: 'OPTIONS',
        headers: {
          origin: ORIGEM,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'content-type, if-match',
        },
      },
      { WEB_ORIGIN: ORIGEM } as never
    );
    expect(res.status).toBe(204);
    const permitidos = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(permitidos).toContain('if-match');
    expect(permitidos).toContain('if-none-match');
  });

  it('a resposta expõe o ETag ao JavaScript', async () => {
    // O assets.ts já mandava o header; sem Expose-Headers o
    // response.headers.get('ETag') devolvia null e ninguém tinha o token.
    const chave = 'assets/praises/p1/m1.gestures';
    const res = await app.request(
      `/${chave}`,
      { headers: { origin: ORIGEM } },
      { ASSETS: r2Com(`storage/${chave}`, '{}'), WEB_ORIGIN: ORIGEM } as never
    );
    expect(res.headers.get('access-control-expose-headers')?.toLowerCase()).toContain('etag');
  });
});
