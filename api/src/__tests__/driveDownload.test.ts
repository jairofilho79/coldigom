import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadDriveFile } from '../driveApi';
import { MAX_UPLOAD_BYTES } from '../uploadLimits';

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

function respostaComTamanho(declarado: number | null, tamanhoReal: number) {
  const headers = new Headers({ 'content-type': 'application/pdf' });
  if (declarado !== null) headers.set('content-length', String(declarado));
  const corpo = new Uint8Array(tamanhoReal);
  return {
    ok: true,
    status: 200,
    headers,
    arrayBuffer: async () => corpo.buffer,
    text: async () => '',
  } as unknown as Response;
}

describe('downloadDriveFile — teto de tamanho', () => {
  it('recusa antes de ler o corpo quando o Drive declara tamanho acima do teto', async () => {
    // O arquivo era bufferizado inteiro para o R2 receber comprimento
    // conhecido, sem teto nenhum: um arquivo grande estourava a memória do
    // Worker. Conferir o content-length evita até tocar no corpo.
    const arrayBuffer = vi.fn();
    globalThis.fetch = vi.fn(async () => {
      const r = respostaComTamanho(MAX_UPLOAD_BYTES + 1, 10);
      (r as unknown as { arrayBuffer: unknown }).arrayBuffer = arrayBuffer;
      return r;
    }) as unknown as typeof fetch;

    await expect(downloadDriveFile('token', 'file-1')).rejects.toThrow(/413/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('recusa também quando o Drive não declara tamanho e o corpo passa do teto', async () => {
    globalThis.fetch = vi.fn(async () =>
      respostaComTamanho(null, MAX_UPLOAD_BYTES + 1)
    ) as unknown as typeof fetch;

    await expect(downloadDriveFile('token', 'file-1')).rejects.toThrow(/413/);
  });

  it('deixa passar arquivo dentro do teto', async () => {
    globalThis.fetch = vi.fn(async () => respostaComTamanho(1024, 1024)) as unknown as typeof fetch;

    const baixado = await downloadDriveFile('token', 'file-1');
    expect(baixado.bytes.byteLength).toBe(1024);
    expect(baixado.contentType).toBe('application/pdf');
  });

  it('propaga falha do Drive com o status', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      text: async () => 'not found',
    })) as unknown as typeof fetch;

    await expect(downloadDriveFile('token', 'file-1')).rejects.toThrow(/404/);
  });

  it('escapa o id do arquivo na URL', async () => {
    const espiao = vi.fn(async () => respostaComTamanho(10, 10));
    globalThis.fetch = espiao as unknown as typeof fetch;

    await downloadDriveFile('token', 'a/b?c');
    const url = String(espiao.mock.calls[0][0]);
    expect(url).toContain('https://www.googleapis.com/drive/v3/files/a%2Fb%3Fc');
  });
});
