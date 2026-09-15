import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

const pegarAccessToken = vi.fn();
const apagarCredenciais = vi.fn(async () => undefined);

vi.mock('../driveApi', async () => {
  const real = await vi.importActual<typeof import('../driveApi')>('../driveApi');
  return { ...real, getDriveAccessToken: (...args: unknown[]) => pegarAccessToken(...args) };
});

vi.mock('../driveCredentials', async () => {
  const real = await vi.importActual<typeof import('../driveCredentials')>('../driveCredentials');
  return {
    ...real,
    getDriveRefreshToken: vi.fn(async () => 'refresh-token'),
    deleteDriveCredentials: (...args: unknown[]) => apagarCredenciais(...args),
  };
});

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-scan' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

function bancoDoScan() {
  const escritas: string[] = [];
  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          escritas.push(sql);
          return {};
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };
  return { db, escritas };
}

async function mapear() {
  const { db, escritas } = bancoDoScan();
  const jwt = await sessao();
  const res = await app.request(
    '/api/drive/scans',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGEM,
        cookie: `coldigom_access=${encodeURIComponent(jwt)}`,
      },
      body: JSON.stringify({ url: 'https://drive.google.com/drive/folders/pasta-1' }),
    },
    {
      DB: db,
      ASSETS: { put: vi.fn(), delete: vi.fn(), head: vi.fn(async () => null) },
      AUTH_JWT_SECRET: SEGREDO,
      AUTH_ALLOWED_EMAILS: '*',
      GOOGLE_CLIENT_ID: 'client-1',
      GOOGLE_CLIENT_SECRET: 'secret-1',
      WEB_ORIGIN: ORIGEM,
    } as never
  );
  return { res, escritas };
}

describe('POST /api/drive/scans — refresh do Drive morto', () => {
  it('apaga a credencial e pede reconexão em vez de devolver o erro cru do Google', async () => {
    // Refresh vencido (app OAuth em Testando vence em 7 dias) ou revogado. A rota
    // devolvia 502 com o JSON do Google e mantinha a linha no D1: /api/drive/status
    // seguia dizendo "conectado" e o painel nunca reoferecia o botão de autorizar.
    pegarAccessToken.mockRejectedValueOnce(
      new Error(
        'Google token refresh failed (400): { "error": "invalid_grant", "error_description": "Token has been expired or revoked." }'
      )
    );

    const { res } = await mapear();

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'drive_not_connected' });
    expect(apagarCredenciais).toHaveBeenCalledWith(expect.anything(), 'sub-admin');
  });

  it('mantém a credencial quando a falha é passageira', async () => {
    apagarCredenciais.mockClear();
    pegarAccessToken.mockRejectedValueOnce(new Error('Drive list failed (503): unavailable'));

    const { res } = await mapear();

    expect(res.status).toBe(502);
    expect(apagarCredenciais).not.toHaveBeenCalled();
  });
});
