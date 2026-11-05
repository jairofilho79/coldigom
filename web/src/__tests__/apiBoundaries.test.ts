import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bulkUploadMaterials, clearAuthTokens, createGesture, fetchAdminContributionFile, getFilterOptions,
  isAuthStorageKey, listAdminContributions, listValidationFindings, logout,
  putGesturesContent,
} from '../services/api';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  clearAuthTokens();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('limites do serviço da API', () => {
  it('reconhece somente eventos de autenticação ou limpeza geral', () => {
    expect(isAuthStorageKey(null)).toBe(true);
    expect(isAuthStorageKey('coldigom_access')).toBe(true);
    expect(isAuthStorageKey('coldigom_refresh')).toBe(true);
    expect(isAuthStorageKey('outra-chave')).toBe(false);
  });

  it('envia filtros de tags, tonalidades e materiais', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }));
    await getFilterOptions({ tags: ['raiz', 'filha'], tonality: ['Dó'], materialKinds: ['cifra'] });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('tags')).toBe('raiz,filha');
    expect(url.searchParams.get('tonality')).toBe('Dó');
    expect(url.searchParams.get('materialKinds')).toBe('cifra');
  });

  it('envia paginação padrão e sinal de cancelamento na fila de validação', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], pagination: {} }));
    const controller = new AbortController();
    await listValidationFindings({ detector: 'letra', status: 'pending' } as never, controller.signal);
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('page')).toBe('1');
    expect(new URL(String(url)).searchParams.get('limit')).toBe('100');
    expect(options.signal).toBe(controller.signal);
  });

  it('permite listar contribuições sem filtros', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], pagination: {} }));
    await listAdminContributions();
    expect(new URL(String(fetchMock.mock.calls[0][0])).search).toBe('');
  });

  it('envia exemplos do gesto ao criar a imagem', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'g' } }));
    await createGesture({ name: 'Gesto', image: new File(['x'], 'g.png'), exampleTriggers: ['paz'] });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('exampleTriggers')).toBe('["paz"]');
  });

  it('cria gesto sem enviar exemplos quando não foram informados', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'g' } }));
    await createGesture({ name: 'Gesto', image: new File(['x'], 'g.png') });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.has('exampleTriggers')).toBe(false);
  });

  it('usa metadados padrão ou decodifica nomes ao baixar anexos', async () => {
    fetchMock.mockResolvedValueOnce(new Response('arquivo'));
    const semCabecalho = await fetchAdminContributionFile('c', 'f');
    expect(semCabecalho.contentType).toContain('text/plain');
    expect(semCabecalho.filename).toBe('anexo');
    fetchMock.mockResolvedValueOnce(new Response('arquivo', {
      headers: { 'content-disposition': 'attachment; filename="nota.pdf"' },
    }));
    expect((await fetchAdminContributionFile('c', 'f')).filename).toBe('nota.pdf');
    fetchMock.mockResolvedValueOnce(new Response('arquivo', {
      headers: { 'content-disposition': "attachment; filename*=UTF-8''nota%20voz.pdf" },
    }));
    expect((await fetchAdminContributionFile('c', 'f')).filename).toBe('nota voz.pdf');
    fetchMock.mockResolvedValueOnce(new Response(null));
    expect((await fetchAdminContributionFile('c', 'f')).contentType).toBe('application/octet-stream');
  });

  it('faz logout mesmo sem token local', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await logout();
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('preserva cancelamento de requisição', async () => {
    const abort = new DOMException('cancelado', 'AbortError');
    fetchMock.mockRejectedValueOnce(abort);
    await expect(listValidationFindings()).rejects.toBe(abort);
  });

  it('apresenta erro de documento recusado mesmo sem mensagem ou caminho', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: 'INVALID' }, 400));
    await expect(putGesturesContent('m', {} as never, null)).rejects.toMatchObject({
      message: 'Documento recusado.', code: 'INVALID', path: '',
    });
  });

  it('informa falha HTTP ao salvar gestos quando o servidor não explica o erro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(putGesturesContent('m', {} as never, null))
      .rejects.toThrow('O servidor teve um problema. Tente de novo em alguns instantes.');
  });

  it('interrompe o envio quando o primeiro lote falha', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403));
    const item = { file: new File(['x'], 'nota.pdf'), material_kind: 'cifra', type: 'pdf' };
    await expect(bulkUploadMaterials('p', [item])).rejects.toThrow('Esta conta não tem permissão');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('permite base relativa configurada explicitamente', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.resetModules();
    const { getAssetUrl } = await import('../services/api');
    expect(getAssetUrl('/assets/nota.pdf')).toBe('/assets/nota.pdf');
  });
});
