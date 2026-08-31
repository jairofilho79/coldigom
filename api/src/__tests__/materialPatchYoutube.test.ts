import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-mat' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

/** Um material que JÁ é youtube no banco — o corpo do PATCH pode não citar o tipo. */
function bancoComMaterial(tipoAtual: string) {
  const gravados: { sql: string; args: unknown[] }[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM praise_materials WHERE id')) {
            return { id: 'mat-1', praise_id: 'praise-1', type: tipoAtual, r2_key: null };
          }
          if (sql.includes('FROM praises p')) return { id: args[0], name: 'Louvor', tag_ids: null };
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          gravados.push({ sql, args });
          return {};
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };

  return { db, gravados };
}

async function patchMaterial(corpo: object, tipoAtual = 'youtube') {
  const { db, gravados } = bancoComMaterial(tipoAtual);
  const jwt = await sessao();
  const res = await app.request(
    '/api/materials/mat-1',
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify(corpo),
    },
    {
      DB: db,
      ASSETS: { head: vi.fn(async () => null), put: vi.fn(), delete: vi.fn() },
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      WEB_ORIGIN: ORIGEM,
    } as never
  );
  return { res, gravados };
}

describe('PATCH /api/materials/:id — url de material youtube', () => {
  it('recusa apontar um material youtube para outro host', async () => {
    // Sem 'type' no corpo o validador nunca rodava, e a url entrava como veio:
    // o card seguia com o selo do YouTube apontando para o site do atacante.
    const { res, gravados } = await patchMaterial({ url: 'https://phishing.example/x' });

    expect(res.status).toBe(400);
    expect(gravados.join(' | ')).not.toContain('phishing.example');
  });

  it('recusa também esvaziar a url de um material youtube', async () => {
    const { res } = await patchMaterial({ url: '   ' });

    expect(res.status).toBe(400);
  });

  it('aceita trocar por outro vídeo do YouTube', async () => {
    const { res } = await patchMaterial({ url: 'https://youtu.be/abc123' });

    expect(res.status).not.toBe(400);
  });

  it('não estorva um PATCH que nem mexe na url', async () => {
    // Marcar revisado num material youtube não pode virar "url é obrigatória".
    const { res } = await patchMaterial({ is_reviewed: true });

    expect(res.status).not.toBe(400);
  });

  it('libera a url quando o tipo deixa de ser youtube no mesmo PATCH', async () => {
    const { res } = await patchMaterial({ type: 'link', url: 'https://drive.google.com/x' });

    expect(res.status).not.toBe(400);
  });

  it('continua exigindo url ao mudar o tipo para youtube', async () => {
    const { res } = await patchMaterial({ type: 'youtube' }, 'link');

    expect(res.status).toBe(400);
  });
});
