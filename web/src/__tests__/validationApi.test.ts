import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  bulkDecideValidationFindings,
  decideValidationFinding,
  listValidationFindings,
} from '../services/api';

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}

describe('cliente da fila de revisão', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('lista com os filtros na query string e devolve data + pagination', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: [{ id: 'f1' }], pagination: { page: 2, limit: 50, total: 60, totalPages: 2 } }));
    const r = await listValidationFindings({ detector: 'youtube_merge', status: 'pendente', page: 2, limit: 50 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings?detector=youtube_merge&status=pendente&page=2&limit=50`);
    expect(init.credentials).toBe('include');
    expect(r.data).toEqual([{ id: 'f1' }]);
    expect(r.pagination.totalPages).toBe(2);
  });

  it('decide um achado com PATCH e corpo JSON', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: { id: 'f1', status: 'rejeitado' } }));
    const r = await decideValidationFinding('f1', { status: 'rejeitado', decision_note: 'não é' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings/f1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'rejeitado', decision_note: 'não é' });
    expect(r.status).toBe('rejeitado');
  });

  it('decide em lote com POST /bulk', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson({ data: { atualizados: 2 } }));
    const r = await bulkDecideValidationFindings({ ids: ['a', 'b'], status: 'rejeitado' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/validation/findings/bulk`);
    expect(init.method).toBe('POST');
    expect(r).toEqual({ atualizados: 2 });
  });
});
