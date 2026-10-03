import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  listAdminContributions,
  getAdminContribution,
  generateAdminContributionPlan,
  approveAdminContributionPlan,
  patchAdminContribution,
  fetchAdminContributionFile,
  API_BASE_URL,
} from '../services/api';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('API Contributions Service', () => {
  it('listAdminContributions envia query params e devolve dados com paginação', async () => {
    const mockData = {
      data: [{ id: 'c1', title: 'Louvor 1' }],
      pagination: { page: 2, limit: 20, total: 21, totalPages: 2 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const result = await listAdminContributions({
      status: 'pendente',
      kind: 'wrong_info',
      praise: 'p123',
      page: 2,
    });

    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/admin/contributions?status=pendente&kind=wrong_info&praise=p123&page=2`,
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('getAdminContribution busca contribuição individual por ID', async () => {
    const mockItem = { id: 'c1', title: 'Detalhe' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockItem }),
    });

    const result = await getAdminContribution('c1');
    expect(result).toEqual(mockItem);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/admin/contributions/c1`,
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('generateAdminContributionPlan chama POST /:id/plan', async () => {
    const mockPlanRes = { ok: true, planId: 'pl-1', plan: { id: 'pl-1', summary: 'S' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockPlanRes,
    });

    const res = await generateAdminContributionPlan('c1');
    expect(res).toEqual(mockPlanRes);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/admin/contributions/c1/plan`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      })
    );
  });

  it('approveAdminContributionPlan envia plano, hash e nota de decisão', async () => {
    const mockApproveRes = { ok: true, message: 'Aprovado', executed_tasks: 2 };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockApproveRes,
    });

    const res = await approveAdminContributionPlan('c1', {
      planId: 'pl-1',
      planHash: 'hash-xyz',
      decisionNote: 'Nota ok',
    });

    expect(res).toEqual(mockApproveRes);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/admin/contributions/c1/approve`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          plan_id: 'pl-1',
          plan_hash: 'hash-xyz',
          decision_note: 'Nota ok',
        }),
      })
    );
  });

  it('patchAdminContribution atualiza status e nota', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const res = await patchAdminContribution('c1', 'recusada', 'Fora do escopo');
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/admin/contributions/c1`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          status: 'recusada',
          decision_note: 'Fora do escopo',
        }),
      })
    );
  });

  it('fetchAdminContributionFile baixa blob e extrai filename do cabeçalho', async () => {
    const blobContent = new Blob(['sample-data'], { type: 'application/pdf' });
    const headers = new Headers({
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="partitura.pdf"`,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers,
      blob: async () => blobContent,
    });

    const file = await fetchAdminContributionFile('c1', 'f1');
    expect(file.contentType).toBe('application/pdf');
    expect(file.filename).toBe('partitura.pdf');
    expect(file.blob).toBe(blobContent);

    // Teste de falha quando arquivo não é limpo ou retorna erro
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
    });

    await expect(fetchAdminContributionFile('c1', 'f_bad')).rejects.toThrow(
      'Não foi possível carregar o arquivo ou arquivo em quarentena'
    );
  });
});
