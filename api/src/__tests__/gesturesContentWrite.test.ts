import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { app } from '../index';
import { MENSAGENS } from '../gestures/schema';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';
const TOKEN = 'token-do-review-app';
const CHAVE = 'assets/praises/praise-1/mat-1.gestures';

const EXEMPLO = readFileSync(
  resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'),
  'utf8'
);

type Gravacao = { key: string; body: unknown; options: R2PutOptions | undefined };

/**
 * Mesmo banco falso de materialContentWrite.test.ts, mais `batch`: o ramo de
 * gestos grava uso e marca de revisão num lote só, e é isso que se quer ver.
 */
function ambiente(opcoes: { etag?: string; type?: string } = {}) {
  const gravacoes: Gravacao[] = [];
  const soltas: { sql: string; args: unknown[] }[] = [];
  const lotes: { sql: string; args: unknown[] }[][] = [];
  let etag = opcoes.etag ?? 'etag-inicial';

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return { id: 'mat-1', praise_id: 'praise-1', type: opcoes.type ?? 'gestures', r2_key: CHAVE };
          }
          return null;
        }),
        run: vi.fn(async () => {
          soltas.push({ sql, args });
          return { meta: { changes: 1 } };
        }),
        all: vi.fn(async () => ({ results: [] })),
        __sql: sql,
        __args: args,
      })),
    })),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
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
    soltas,
    lotes,
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
        'content-type': 'application/json',
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

describe('PUT /content — material de gestos: validação', () => {
  it('recusa JSON quebrado com json_invalido e caminho vazio', async () => {
    const { res, gravacoes } = await gravar('{ isto não é json');
    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({ error: MENSAGENS.json_invalido, code: 'json_invalido', path: '' });
  });

  it('recusa corpo vazio como json_invalido, não como "cifra vazia"', async () => {
    const { res } = await gravar('');
    expect(res.status).toBe(400);
    const json = (await res.json()) as { code: string };
    expect(json.code).toBe('json_invalido');
  });

  it('devolve o caminho do erro — é o que leva o revisor ao cartão', async () => {
    const doc = JSON.parse(EXEMPLO);
    doc.items[0].children[1] = { type: 'dança' };
    const { res, gravacoes } = await gravar(JSON.stringify(doc));
    expect(res.status).toBe(400);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({
      error: MENSAGENS.tipo_desconhecido,
      code: 'tipo_desconhecido',
      path: 'items[0].children[1]',
    });
  });

  it('NÃO confere gestureId contra o dicionário', async () => {
    // O importador pode chegar antes do dicionário. Nenhuma leitura de
    // gesture_dictionary acontece aqui — quem avisa é o editor.
    const { res, env } = await gravar(EXEMPLO);
    expect(res.status).toBe(200);
    const sqls = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('gesture_dictionary'))).toBe(false);
  });

  it('recusa acima de 256 KB com documento_grande', async () => {
    const doc = JSON.parse(EXEMPLO);
    doc.items.push({ type: 'text', text: 'x'.repeat(256 * 1024) });
    const { res, gravacoes } = await gravar(JSON.stringify(doc));
    expect(res.status).toBe(413);
    expect(gravacoes).toHaveLength(0);
    expect(await res.json()).toEqual({ error: MENSAGENS.documento_grande, code: 'documento_grande', path: '' });
  });
});

describe('PUT /content — material de gestos: gravação', () => {
  it('grava como JSON, devolve ETag e recomputa gesture_usage no mesmo lote da marca de revisão', async () => {
    const { res, gravacoes, lotes, soltas } = await gravar(EXEMPLO);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"etag-1"');
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].key).toBe(`storage/${CHAVE}`);
    expect((gravacoes[0].options?.httpMetadata as { contentType: string }).contentType).toBe(
      'application/json; charset=utf-8'
    );

    expect(lotes).toHaveLength(1);
    const lote = lotes[0];
    expect(lote[0].sql).toMatch(/DELETE FROM gesture_usage WHERE material_id = \?/);
    expect(lote[0].args).toEqual(['mat-1']);
    const inserts = lote.filter((s) => s.sql.includes('INSERT INTO gesture_usage'));
    expect(inserts).toHaveLength(9);
    expect(inserts.map((s) => s.args)).toContainEqual(['mat-1', 'c687580e7682', 1]);
    const limpeza = lote[lote.length - 1];
    expect(limpeza.sql).toMatch(/is_reviewed = 0/);
    expect(limpeza.sql).toMatch(/reviewed_by\s*=\s*NULL/);
    // nada solto: se o lote falhar, nem o uso nem a marca mudam
    expect(soltas.find((s) => s.sql.includes('is_reviewed'))).toBeUndefined();
  });

  it('devolve 409 stale_write quando o If-Match não bate, sem tocar o banco', async () => {
    const { res, gravacoes, lotes } = await gravar(EXEMPLO, {
      headers: { 'if-match': '"etag-de-outra-versao"' },
    });
    expect(res.status).toBe(409);
    expect(gravacoes).toHaveLength(0);
    expect(lotes).toHaveLength(0);
    const json = (await res.json()) as { code: string; error: string };
    expect(json.code).toBe('stale_write');
    expect(json.error).toBe('O documento de gestos foi alterado por outra pessoa. Recarregue antes de salvar.');
  });

  it('grava quando o If-Match bate', async () => {
    const { res, gravacoes } = await gravar(EXEMPLO, {
      headers: { 'if-match': '"etag-inicial"' },
      opcoes: { etag: 'etag-inicial' },
    });
    expect(res.status).toBe(200);
    expect((gravacoes[0].options?.onlyIf as R2Conditional).etagMatches).toBe('etag-inicial');
  });

  it('o log estruturado diz que o tipo é gestures', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await gravar(EXEMPLO);
    const linha = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes('material.content.write'));
    expect(linha).toBeDefined();
    expect((JSON.parse(linha!) as { tipo: string }).tipo).toBe('gestures');
  });

  it('a cifra continua no caminho antigo: type chord ainda grava texto puro', async () => {
    const { res, gravacoes, soltas } = await gravar('[C]Linha', { opcoes: { type: 'chord' } });
    expect(res.status).toBe(200);
    expect(gravacoes[0].body).toBe('[C]Linha');
    expect(soltas.find((s) => s.sql.includes('is_reviewed'))).toBeDefined();
  });

  it('outros tipos continuam recusados', async () => {
    const { res } = await gravar('%PDF', { opcoes: { type: 'pdf' } });
    expect(res.status).toBe(400);
  });
});
