import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ITEMS, isSafeMaterialType } from '../uploadLimits';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

describe('isSafeMaterialType', () => {
  it('aceita as extensões reais do acervo', () => {
    for (const t of ['pdf', 'mp3', 'mid', 'midi', 'chord', 'gestures', 'txt', 'link', 'youtube']) {
      expect(isSafeMaterialType(t)).toBe(true);
    }
  });

  it('recusa travessia de caminho', () => {
    // Provado com sonda contra a app: type "../../outro/roubado.pdf" produzia a
    // chave storage/assets/praises/X/<uuid>.../../outro/roubado.pdf.
    expect(isSafeMaterialType('../../outro/roubado.pdf')).toBe(false);
    expect(isSafeMaterialType('..')).toBe(false);
    expect(isSafeMaterialType('a/b')).toBe(false);
  });

  it('recusa caractere que quebra a chave ou a URL', () => {
    expect(isSafeMaterialType('pdf?x=1')).toBe(false);
    expect(isSafeMaterialType('pdf#frag')).toBe(false);
    expect(isSafeMaterialType('pdf ')).toBe(false);
    expect(isSafeMaterialType('PDF')).toBe(false);
  });

  it('recusa comprimento absurdo e vazio', () => {
    expect(isSafeMaterialType('a'.repeat(300))).toBe(false);
    expect(isSafeMaterialType('')).toBe(false);
  });
});

async function sessao() {
  return new SignJWT({ email: 'a@b.com', jti: 'j' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('s')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function ambiente() {
  const chaves: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        run: vi.fn(async () => ({})),
        first: vi.fn(async () => {
          // o louvor e o catálogo existem: aqui o que está em teste é o limite
          if (sql.includes('FROM praises WHERE id')) return { id: args[0] };
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM material_kinds')) return { results: args.map((id) => ({ id })) };
          return { results: [] };
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };
  const r2 = {
    put: vi.fn(async (key: string) => {
      chaves.push(key);
      return {};
    }),
  };
  return {
    chaves,
    env: {
      DB: db,
      ASSETS: r2,
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    },
  };
}

async function enviarLote(itens: object[], arquivos: Record<string, File>) {
  const { env, chaves } = ambiente();
  const jwt = await sessao();
  const form = new FormData();
  form.set('items', JSON.stringify(itens));
  for (const [k, f] of Object.entries(arquivos)) form.set(k, f);
  const res = await app.request(
    '/api/praises/praise-1/materials/bulk-upload',
    {
      method: 'POST',
      headers: { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}` },
      body: form,
    },
    env as never
  );
  return { res, chaves };
}

describe('bulk-upload — limites e chave do R2', () => {
  it('recusa type que escaparia da pasta do louvor', async () => {
    const { res, chaves } = await enviarLote(
      [{ key: 'f1', material_kind: 'k1', type: '../../outro/roubado.pdf' }],
      { f1: new File(['x'], 'a.pdf') }
    );
    expect(res.status).toBe(400);
    expect(chaves).toHaveLength(0);
  });

  it('recusa arquivo acima do limite', async () => {
    // Ia direto para o R2 sem nenhum teto.
    const grande = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'grande.pdf');
    const { res, chaves } = await enviarLote(
      [{ key: 'f1', material_kind: 'k1', type: 'pdf' }],
      { f1: grande }
    );
    expect(res.status).toBe(413);
    expect(chaves).toHaveLength(0);
  });

  it('recusa lote com itens demais', async () => {
    const itens = Array.from({ length: MAX_UPLOAD_ITEMS + 1 }, (_, i) => ({
      key: `f${i}`,
      material_kind: 'k1',
      type: 'pdf',
    }));
    const arquivos = Object.fromEntries(
      itens.map((it) => [it.key, new File(['x'], 'a.pdf')])
    );
    const { res } = await enviarLote(itens, arquivos);
    expect(res.status).toBe(400);
  });

  it('valida tudo antes de escrever qualquer coisa no R2', async () => {
    // O laço validava e escrevia item a item: um lote com o segundo item
    // inválido já teria gravado o primeiro.
    const { res, chaves } = await enviarLote(
      [
        { key: 'f1', material_kind: 'k1', type: 'pdf' },
        { key: 'f2', material_kind: 'k1', type: '../fuga' },
      ],
      { f1: new File(['x'], 'a.pdf'), f2: new File(['y'], 'b.pdf') }
    );
    expect(res.status).toBe(400);
    expect(chaves).toHaveLength(0);
  });

  it('aceita um lote legítimo', async () => {
    const { res, chaves } = await enviarLote(
      [{ key: 'f1', material_kind: 'k1', type: 'pdf' }],
      { f1: new File(['x'], 'a.pdf') }
    );
    expect(res.status).not.toBe(400);
    expect(chaves[0]).toMatch(/^storage\/assets\/praises\/praise-1\/[0-9a-f-]+\.pdf$/);
  });
});
