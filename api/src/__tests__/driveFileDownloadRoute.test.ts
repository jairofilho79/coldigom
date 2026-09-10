import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

const baixarArquivo = vi.fn();
const pegarAccessToken = vi.fn();
const apagarCredenciais = vi.fn(async () => undefined);

vi.mock('../driveApi', async () => {
  const real = await vi.importActual<typeof import('../driveApi')>('../driveApi');
  return {
    ...real,
    getDriveAccessToken: (...args: unknown[]) => pegarAccessToken(...args),
    downloadDriveFile: (...args: unknown[]) => baixarArquivo(...args),
  };
});

vi.mock('../driveCredentials', async () => {
  const real = await vi.importActual<typeof import('../driveCredentials')>('../driveCredentials');
  return {
    ...real,
    getDriveRefreshToken: vi.fn(async () => 'refresh-token'),
    deleteDriveCredentials: (...args: unknown[]) => apagarCredenciais(...args),
    isInvalidDriveGrant: vi.fn((err: unknown) =>
      err instanceof Error && err.message.includes('invalid_grant')
    ),
  };
});

import { app } from '../index';

const SEGREDO = '0123456789abcdef0123456789abcdef';

async function sessao() {
  return new SignJWT({ email: 'admin@test.com', jti: 'j-dl' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
}

const envMock = {
  DB: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () => null),
      })),
    })),
  } as unknown as D1Database,
  ASSETS: { put: vi.fn(), delete: vi.fn(), head: vi.fn(async () => null) } as unknown as R2Bucket,
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  AUTH_JWT_SECRET: SEGREDO,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: 'https://web.example',
};

describe('GET /api/drive/files/:fileId/download', () => {
  it('retorna os bytes do arquivo baixado do Google Drive', async () => {
    pegarAccessToken.mockResolvedValue('token-ok');
    const bytes = new Uint8Array([0x00, 0x00, 0x00, 0x20]).buffer;
    baixarArquivo.mockResolvedValue({
      bytes,
      contentType: 'audio/x-m4a',
    });

    const jwt = await sessao();
    const res = await app.request(
      '/api/drive/files/drive-file-123/download',
      {
        method: 'GET',
        headers: {
          Origin: 'https://web.example',
          Cookie: `coldigom_access=${jwt}`,
        },
      },
      envMock
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/x-m4a');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBe(4);
  });

  it('exige autenticação', async () => {
    const res = await app.request(
      '/api/drive/files/drive-file-123/download',
      {
        method: 'GET',
        headers: {
          Origin: 'https://web.example',
        },
      },
      envMock
    );
    expect(res.status).toBe(401);
  });

  it('apaga credencial e devolve 403 se o token do Drive for invalid_grant', async () => {
    pegarAccessToken.mockRejectedValue(new Error('invalid_grant: bad refresh token'));

    const jwt = await sessao();
    const res = await app.request(
      '/api/drive/files/drive-file-123/download',
      {
        method: 'GET',
        headers: {
          Origin: 'https://web.example',
          Cookie: `coldigom_access=${jwt}`,
        },
      },
      envMock
    );

    expect(res.status).toBe(403);
    expect(apagarCredenciais).toHaveBeenCalled();
  });
});
