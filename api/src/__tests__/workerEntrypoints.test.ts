import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../index';
import { handleDriveImportQueueBatch } from '../driveImport';
import { handleContribScanBatch, requeueStaleContributions } from '../contributions/scan';
import { resolveUserFromRequest } from '../auth';
import type { Env } from '../env';

vi.mock('../driveImport', async (original) => ({
  ...await original<typeof import('../driveImport')>(),
  handleDriveImportQueueBatch: vi.fn(),
}));
vi.mock('../contributions/scan', async (original) => ({
  ...await original<typeof import('../contributions/scan')>(),
  handleContribScanBatch: vi.fn(),
  requeueStaleContributions: vi.fn(),
}));
vi.mock('../auth', async (original) => ({
  ...await original<typeof import('../auth')>(),
  resolveUserFromRequest: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('entradas do Worker', () => {
  it('encaminha cada fila ao processador correspondente', async () => {
    const env = {} as Env;
    const contrib = { queue: 'contrib-scan', messages: [] } as never;
    const drive = { queue: 'drive-import', messages: [] } as never;
    await worker.queue(contrib, env);
    await worker.queue(drive, env);
    expect(handleContribScanBatch).toHaveBeenCalledWith(contrib, env);
    expect(handleDriveImportQueueBatch).toHaveBeenCalledWith(drive, env);
  });

  it('executa o resgate agendado e registra o resultado', async () => {
    const env = {} as Env;
    const result = { requeued: 2, blocked: 1 };
    vi.mocked(requeueStaleContributions).mockResolvedValue(result as never);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await worker.scheduled({} as ScheduledEvent, env);
    expect(requeueStaleContributions).toHaveBeenCalledWith(env);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({ msg: 'contributions.cron', ...result });
  });

  it('alerta sobre configuração de cookies incompleta sem impedir acesso anônimo', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await app.request('/nao-existe', {}, { GOOGLE_CLIENT_ID: 'client' } as Env);
    expect(res.status).toBe(404);
    expect(JSON.parse(String(warning.mock.calls[0][0])).msg).toBe('auth.config.warning');
  });

  it('mantém acesso público quando a autenticação opcional falha', async () => {
    vi.mocked(resolveUserFromRequest).mockRejectedValueOnce(new Error('token inválido'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await app.request('/nao-existe', {}, { AUTH_JWT_SECRET: 'secret' } as Env);
    expect(res.status).toBe(404);
    expect(JSON.parse(String(log.mock.calls[0][0])).msg).toBe('auth.soft.invalid');
  });
});
