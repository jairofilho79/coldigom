import { beforeEach, describe, expect, it, vi } from 'vitest';

import { processImportItem } from '../driveImport';

const baixar = vi.fn();

vi.mock('../driveApi', () => ({
  getDriveAccessToken: vi.fn(async () => 'access-token'),
  downloadDriveFile: (...args: unknown[]) => baixar(...args),
}));

vi.mock('../driveCredentials', () => ({
  getDriveRefreshToken: vi.fn(async () => 'refresh-token'),
  deleteDriveCredentials: vi.fn(async () => undefined),
  isInvalidDriveGrant: () => false,
}));

/** Registra o status final gravado no item e as tentativas contadas. */
function bancoDoItem(tentativasAnteriores = 0) {
  const statusGravados: string[] = [];

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM import_job_items i')) {
            return {
              id: 'item-1',
              job_id: 'job-1',
              drive_file_id: 'file-1',
              material_kind: 'kind1',
              type: 'pdf',
              file_path_legacy: null,
              status: 'pending',
              attempts: tentativasAnteriores,
              praise_id: 'praise-1',
              user_sub: 'sub-admin',
            };
          }
          if (sql.includes('SUM(CASE WHEN status')) {
            return { done_count: 0, failed_count: 1, open_count: 0, total_count: 1 };
          }
          return null;
        }),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => {
          if (sql.includes('UPDATE import_job_items SET status = ?, error = ?')) {
            statusGravados.push(String(args[0]));
          }
          return {};
        }),
      })),
    })),
    batch: vi.fn(async () => []),
  };

  return { db, statusGravados };
}

function ambiente(db: unknown) {
  return {
    DB: db,
    ASSETS: { put: vi.fn(async () => ({})) },
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
  } as never;
}

beforeEach(() => {
  baixar.mockReset();
});

describe('processImportItem — o que é falha permanente', () => {
  it('não reenfileira arquivo acima do teto de tamanho', async () => {
    // downloadDriveFile recusa acima de 100 MB com "Drive download failed (413)",
    // e 413 estava fora da lista de erros permanentes: o item voltava para
    // pending, a fila reentregava, e o arquivo inteiro era baixado de novo
    // cinco vezes antes de desistir — mostrando "Na fila" o tempo todo.
    baixar.mockRejectedValue(new Error('Drive download failed (413): arquivo acima de 104857600 bytes'));
    const { db, statusGravados } = bancoDoItem();

    await expect(processImportItem(ambiente(db), 'job-1', 'item-1')).resolves.toBeUndefined();
    expect(statusGravados).toEqual(['failed']);
  });

  it('não reenfileira pedido que o Drive recusa como malformado', async () => {
    // Reenviar o mesmo pedido produz o mesmo 400; retentar só gasta a fila.
    baixar.mockRejectedValue(new Error('Drive download failed (400): bad request'));
    const { db, statusGravados } = bancoDoItem();

    await expect(processImportItem(ambiente(db), 'job-1', 'item-1')).resolves.toBeUndefined();
    expect(statusGravados).toEqual(['failed']);
  });

  it('continua retentando falha passageira do Drive', async () => {
    // 5xx e 429 são do outro lado e passam: estes têm que voltar para a fila.
    baixar.mockRejectedValue(new Error('Drive download failed (503): unavailable'));
    const { db, statusGravados } = bancoDoItem();

    await expect(processImportItem(ambiente(db), 'job-1', 'item-1')).rejects.toThrow(/503/);
    expect(statusGravados).toEqual(['pending']);
  });

  it('desiste da falha passageira depois da quinta tentativa', async () => {
    baixar.mockRejectedValue(new Error('Drive download failed (503): unavailable'));
    const { db, statusGravados } = bancoDoItem(4);

    await expect(processImportItem(ambiente(db), 'job-1', 'item-1')).resolves.toBeUndefined();
    expect(statusGravados).toEqual(['failed']);
  });
});
