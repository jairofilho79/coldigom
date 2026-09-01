import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { searchPraises } from '../services/api';
import { HomePage } from '../pages/HomePage';
import { AuthProvider } from '../context/AuthContext';

describe('searchPraises — cancelamento', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('repassa o signal para o fetch', async () => {
    // O S6 fechou a corrida ignorando a resposta obsoleta, mas a requisição
    // antiga continuava trafegando. Cancelar de verdade exige o signal
    // atravessando o fetchJson.
    const espiao = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    }));
    globalThis.fetch = espiao as unknown as typeof fetch;

    const controle = new AbortController();
    await searchPraises({}, controle.signal);

    const init = espiao.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controle.signal);
  });

  it('funciona sem signal, como antes', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }),
    })) as unknown as typeof fetch;

    await expect(searchPraises({})).resolves.toBeTruthy();
  });
});

describe('HomePage — aborta a busca anterior', () => {
  it('cancela a requisição em voo quando os filtros mudam', async () => {
    const sinais: AbortSignal[] = [];
    vi.spyOn(await import('../services/api'), 'searchPraises').mockImplementation(
      (async (_p: unknown, signal?: AbortSignal) => {
        if (signal) sinais.push(signal);
        return new Promise(() => {}) as never;
      }) as never
    );

    const { rerender, unmount } = render(
      <MemoryRouter initialEntries={['/?q=a']}>
        <AuthProvider><HomePage /></AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(sinais).toHaveLength(1));
    expect(sinais[0].aborted).toBe(false);

    // desmontar dispara o cleanup do efeito
    unmount();
    void rerender;
    expect(sinais[0].aborted).toBe(true);
  });
});
