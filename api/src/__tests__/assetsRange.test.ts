import { describe, expect, it, vi } from 'vitest';

import { app } from '../index';

const CAMINHO = '/assets/praises/praise-1/mat-1.chord';
const CHAVE = 'storage/assets/praises/praise-1/mat-1.chord';

function corpo(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function ambiente(opcoes: { size?: number; httpEtag?: string; semObjeto?: boolean } = {}) {
  const size = opcoes.size ?? 10;
  const dados = new Uint8Array(Array.from({ length: size }, (_, i) => i));
  const gets: unknown[] = [];

  const assets = {
    head: vi.fn(async (key: string) =>
      key === CHAVE ? { size, httpEtag: opcoes.httpEtag ?? '"etag-do-objeto"' } : null
    ),
    get: vi.fn(async (key: string, options?: R2GetOptions) => {
      gets.push(options);
      if (opcoes.semObjeto || key !== CHAVE) return null;
      const faixa = options?.range as { offset: number; length: number } | undefined;
      const fatia = faixa ? dados.slice(faixa.offset, faixa.offset + faixa.length) : dados;
      return { body: corpo(fatia), httpEtag: opcoes.httpEtag ?? '"etag-do-objeto"' };
    }),
  };

  return { assets, gets, env: { DB: {}, ASSETS: assets } };
}

async function pedir(range?: string, opcoes?: Parameters<typeof ambiente>[0], caminho = CAMINHO) {
  const ctx = ambiente(opcoes);
  const res = await app.request(
    caminho,
    { headers: range ? { range } : {} },
    ctx.env as never
  );
  return { res, ...ctx };
}

describe('GET /assets/* — objeto inteiro', () => {
  it('devolve 200 com Content-Type da extensão e Content-Length', async () => {
    const { res } = await pedir();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-length')).toBe('10');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  it('devolve o ETag do objeto, para o cliente poder gravar com If-Match', async () => {
    const { res } = await pedir();

    expect(res.headers.get('etag')).toBe('"etag-do-objeto"');
  });

  it('cai para octet-stream em extensão desconhecida', async () => {
    const assets = {
      head: vi.fn(async () => ({ size: 4, httpEtag: '"e"' })),
      get: vi.fn(async () => ({ body: corpo(new Uint8Array(4)) })),
    };
    const res = await app.request('/assets/x/y.qualquer', {}, { DB: {}, ASSETS: assets } as never);

    expect(res.headers.get('content-type')).toBe('application/octet-stream');
  });

  it('devolve 404 quando o head não acha o objeto', async () => {
    const { res } = await pedir(undefined, undefined, '/assets/nao/existe.pdf');

    expect(res.status).toBe(404);
  });

  it('devolve 404 quando o head acha mas o get não devolve corpo', async () => {
    // Janela real: o objeto some entre o head e o get.
    const { res } = await pedir(undefined, { semObjeto: true });

    expect(res.status).toBe(404);
  });
});

describe.each([
  { modo: 'objeto inteiro', range: undefined, status: 200 },
  { modo: 'Range', range: 'bytes=2-5', status: 206 },
])('GET /assets/* — MIME de partituras e regressões ($modo)', ({ range, status }) => {
  it.each([
    ['mscz', 'application/x-musescore'],
    ['mxl', 'application/vnd.recordare.musicxml'],
    ['musicxml', 'application/vnd.recordare.musicxml+xml'],
    ['sf2', 'audio/x-soundfont'],
    ['sf3', 'audio/x-soundfont'],
    ['pdf', 'application/pdf'],
    ['mp3', 'audio/mpeg'],
    ['chord', 'text/plain; charset=utf-8'],
    ['gestures', 'application/json; charset=utf-8'],
  ].flatMap(([ext, mime]) => [[ext, mime], [ext.toUpperCase(), mime]]))(
    'entrega .%s como %s, ignorando metadado R2 genérico',
    async (ext, mime) => {
      const directory = ext.toLowerCase().startsWith('sf') ? 'soundfonts' : 'praises/praise-1';
      const path = `/assets/${directory}/mat-1.${ext}`;
      const key = `storage${path}`;
      const dados = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const assets = {
        head: vi.fn(async () => ({
          size: dados.length,
          httpEtag: '"etag-score"',
          httpMetadata: { contentType: 'application/octet-stream' },
        })),
        get: vi.fn(async () => ({ body: corpo(range ? dados.slice(2, 6) : dados) })),
      };
      const res = await app.request(path, { headers: range ? { range } : {} }, {
        DB: {}, ASSETS: assets,
      } as never);

      expect(res.status).toBe(status);
      expect(res.headers.get('content-type')).toBe(mime);
      expect(res.headers.get('content-length')).toBe(range ? '4' : '10');
      expect(res.headers.get('content-range')).toBe(range ? 'bytes 2-5/10' : null);
      expect(res.headers.get('etag')).toBe('"etag-score"');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
      expect(res.headers.get('content-disposition')).toBe(`inline; filename="mat-1.${ext}"`);
      expect(assets.head).toHaveBeenCalledWith(key);
      expect(assets.get.mock.calls[0]).toEqual(
        range ? [key, { range: { offset: 2, length: 4 } }] : [key]
      );
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(range ? dados.slice(2, 6) : dados);
    }
  );
});

describe('GET /assets/* — Range', () => {
  it('devolve 206 com a faixa pedida', async () => {
    const { res, gets } = await pedir('bytes=2-5');

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(res.headers.get('content-length')).toBe('4');
    expect(gets[0]).toEqual({ range: { offset: 2, length: 4 } });
  });

  it('trata faixa aberta no fim', async () => {
    const { res } = await pedir('bytes=6-');

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 6-9/10');
  });

  it('trata sufixo (últimos N bytes)', async () => {
    const { res, gets } = await pedir('bytes=-4');

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 6-9/10');
    expect(gets[0]).toEqual({ range: { offset: 6, length: 4 } });
  });

  it('sufixo maior que o arquivo entrega o arquivo inteiro', async () => {
    const { res } = await pedir('bytes=-50');

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-9/10');
  });

  it('grampeia o fim ao tamanho do objeto', async () => {
    const { res } = await pedir('bytes=0-999');

    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-9/10');
    expect(res.headers.get('content-length')).toBe('10');
  });

  it('devolve 416 para header de faixa que não casa a sintaxe', async () => {
    const { res } = await pedir('bytes=abc');

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('devolve 416 para sufixo de tamanho zero', async () => {
    const { res } = await pedir('bytes=-0');

    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('devolve 416 quando o início passa do fim do objeto', async () => {
    const { res } = await pedir('bytes=20-30');

    expect(res.status).toBe(416);
  });

  it('devolve 416 quando o fim vem antes do início', async () => {
    const { res } = await pedir('bytes=5-2');

    expect(res.status).toBe(416);
  });

  it('devolve 404 quando o get da faixa não acha o objeto', async () => {
    const { res } = await pedir('bytes=0-3', { semObjeto: true });

    expect(res.status).toBe(404);
  });

  it('ignora Range em objeto de tamanho zero', async () => {
    const { res } = await pedir('bytes=0-3', { size: 0 });

    expect(res.status).toBe(200);
  });
});
