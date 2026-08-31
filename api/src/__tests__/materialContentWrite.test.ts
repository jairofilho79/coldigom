import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';
import { MAX_CHORD_CONTENT_BYTES } from '../uploadLimits';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const TOKEN = 'token-do-review-app';
const CHAVE = 'assets/praises/praise-1/mat-1.chord';

async function sessao() {
  return new SignJWT({ email: 'revisor@test.com', jti: 'j-cifra' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-revisor')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

type Gravacao = { key: string; body: unknown; options: R2PutOptions | undefined };

function ambiente(opcoes: { r2_key?: string | null; etag?: string; type?: string } = {}) {
  const gravacoes: Gravacao[] = [];
  const escritas: { sql: string; args: unknown[] }[] = [];
  let etag = opcoes.etag ?? 'etag-inicial';

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return {
              id: 'mat-1',
              praise_id: 'praise-1',
              type: opcoes.type ?? 'chord',
              r2_key: 'r2_key' in opcoes ? opcoes.r2_key : CHAVE,
            };
          }
          return null;
        }),
        run: vi.fn(async () => {
          escritas.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
  };

  const assets = {
    put: vi.fn(async (key: string, body: unknown, options?: R2PutOptions) => {
      const condicao = options?.onlyIf as R2Conditional | undefined;
      if (condicao?.etagMatches !== undefined && condicao.etagMatches !== etag) return null;
      etag = `etag-${gravacoes.length + 1}`;
      gravacoes.push({ key, body, options });
      return { etag, httpEtag: `"${etag}"` };
    }),
    head: vi.fn(async () => null),
    delete: vi.fn(async () => undefined),
  };

  return {
    gravacoes,
    escritas,
    assets,
    env: {
      DB: db,
      ASSETS: assets,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
      COLDIGOM_UPLOAD_TOKEN: TOKEN,
    },
  };
}

async function gravar(
  corpo: string,
  extras: { headers?: Record<string, string>; opcoes?: Parameters<typeof ambiente>[0] } = {}
) {
  const ctx = ambiente(extras.opcoes);
  const res = await app.request(
    '/api/materials/mat-1/content',
    {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        authorization: `Bearer ${TOKEN}`,
        ...(extras.headers ?? {}),
      },
      body: corpo,
    },
    ctx.env as never
  );
  return { res, ...ctx };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PUT /api/materials/:id/content — teto de tamanho', () => {
  it('recusa corpo acima do teto sem gravar nada', async () => {
    // c.req.text() materializava o corpo inteiro antes de qualquer checagem:
    // um PUT de 5 MB entrava no R2 sob a chave de uma cifra de ~611 bytes.
    const { res, gravacoes } = await gravar('x'.repeat(MAX_CHORD_CONTENT_BYTES + 1));

    expect(res.status).toBe(413);
    expect(gravacoes).toHaveLength(0);
    const json = await res.json() as { error: string };
    expect(json.error).toMatch(/limite/i);
  });

  it('aceita um corpo do tamanho do teto', async () => {
    const { res, gravacoes } = await gravar('x'.repeat(MAX_CHORD_CONTENT_BYTES));

    expect(res.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
  });
});

describe('PUT /api/materials/:id/content — corpo vazio', () => {
  it('recusa corpo vazio em vez de apagar a cifra', async () => {
    const { res, gravacoes } = await gravar('');

    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
  });

  it('recusa corpo só com espaço em branco', async () => {
    const { res, gravacoes } = await gravar('   \n\t  \n');

    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
  });
});

describe('PUT /api/materials/:id/content — If-Match', () => {
  it('grava sem If-Match, como o PLPCG e o review-app fazem', async () => {
    const { res, gravacoes } = await gravar('[C]Linha de cifra');

    expect(res.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].options?.onlyIf).toBeUndefined();
  });

  it('devolve o ETag novo no sucesso, senão o cliente não salva duas vezes', async () => {
    const { res } = await gravar('[C]Linha de cifra');

    expect(res.headers.get('etag')).toBe('"etag-1"');
  });

  it('devolve 409 stale_write quando o If-Match não bate', async () => {
    const { res, gravacoes } = await gravar('[C]Linha de cifra', {
      headers: { 'if-match': '"etag-de-outra-versao"' },
    });

    expect(res.status).toBe(409);
    expect(gravacoes).toHaveLength(0);
    const json = await res.json() as { error: string; code: string };
    expect(json.code).toBe('stale_write');
    expect(json.error).toBe('A cifra foi alterada por outra pessoa. Recarregue antes de salvar.');
  });

  it('grava quando o If-Match bate, aspas do header incluídas', async () => {
    const { res, gravacoes } = await gravar('[C]Linha de cifra', {
      headers: { 'if-match': '"etag-inicial"' },
      opcoes: { etag: 'etag-inicial' },
    });

    expect(res.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
    expect((gravacoes[0].options?.onlyIf as R2Conditional).etagMatches).toBe('etag-inicial');
  });
});

describe('PUT /api/materials/:id/content — marca de revisão', () => {
  it('limpa is_reviewed, reviewed_at e reviewed_by ao trocar o conteúdo', async () => {
    // A tela dizia "Revisada · data · por fulano" sobre um texto que ninguém
    // leu — pior no review-app, que grava por token e nem passa pela tela.
    const { res, escritas } = await gravar('[C]Linha de cifra');

    expect(res.status).toBe(200);
    const limpeza = escritas.find((e) => e.sql.includes('is_reviewed'));
    expect(limpeza).toBeDefined();
    expect(limpeza!.sql).toMatch(/reviewed_at\s*=\s*NULL/);
    expect(limpeza!.sql).toMatch(/reviewed_by\s*=\s*NULL/);
  });

  it('não limpa a marca quando a gravação nem aconteceu', async () => {
    const { escritas } = await gravar('', {});

    expect(escritas.find((e) => e.sql.includes('is_reviewed'))).toBeUndefined();
  });
});

describe('PUT /api/materials/:id/content — chave do R2 e rastro', () => {
  it('normaliza r2_key com barra inicial em vez de gravar em storage//', async () => {
    const { res, gravacoes } = await gravar('[C]Linha de cifra', {
      opcoes: { r2_key: `/${CHAVE}` },
    });

    expect(res.status).toBe(200);
    expect(gravacoes[0].key).toBe(`storage/${CHAVE}`);
  });

  it('registra log estruturado com material_id, tamanho e origem da credencial', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await gravar('[C]Linha');

    const linhas = log.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('material.content.write'));
    expect(linhas).toHaveLength(1);
    const registro = JSON.parse(linhas[0]) as Record<string, unknown>;
    expect(registro.material_id).toBe('mat-1');
    expect(registro.bytes).toBe(new TextEncoder().encode('[C]Linha').byteLength);
    expect(registro.credential).toBe('token');
  });

  it('registra o sub da sessão quando quem grava está logado', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const jwt = await sessao();
    const ctx = ambiente();
    const res = await app.request(
      '/api/materials/mat-1/content',
      {
        method: 'PUT',
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          origin: ORIGEM,
          cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
        },
        body: '[C]Linha',
      },
      ctx.env as never
    );

    expect(res.status).toBe(200);
    const linha = log.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes('material.content.write'));
    expect(linha).toBeDefined();
    const registro = JSON.parse(linha!) as Record<string, unknown>;
    expect(registro.credential).toBe('session');
    expect(registro.sub).toBe('sub-revisor');
  });
});
