import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import { PraiseMergeSelectPage } from '../pages/PraiseMergeSelectPage';
import type { Praise, PaginationInfo } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    searchPraises: vi.fn(),
  };
});

import { getPraise, searchPraises } from '../services/api';

const keeperId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
const outroId = '1c12786e-4d32-4e95-a136-d85266008e11';

const PAGINACAO: PaginationInfo = { page: 1, limit: 20, total: 1, totalPages: 1 };

function louvor(id: string, nome: string): Praise {
  return {
    id,
    name: nome,
    number: '001',
    author: '',
    rhythm: '',
    tonality: '',
    category: '',
    lyrics: '',
    group_id: null,
    tag_ids: null,
    tag_names: null,
  };
}

/** Promessa que só resolve quando mandarmos — para segurar uma busca em voo. */
function adiada<T>() {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

function DestinoMesclagem() {
  const { id, sourceId } = useParams();
  return <div>{`mesclar ${id} com ${sourceId}`}</div>;
}

function renderSelecao() {
  return render(
    <MemoryRouter initialEntries={[`/praise/${keeperId}/merge`]}>
      <Routes>
        <Route path="/praise/:id/merge" element={<PraiseMergeSelectPage />} />
        <Route path="/praise/:id/merge/:sourceId" element={<DestinoMesclagem />} />
      </Routes>
    </MemoryRouter>
  );
}

function campoDeBusca() {
  return screen.getByLabelText('Buscar por nome, letra, autor ou ID');
}

describe('PraiseMergeSelectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPraise).mockResolvedValue({ ...louvor(keeperId, 'Grande Deus') } as never);
    vi.mocked(searchPraises).mockResolvedValue({ data: [], pagination: PAGINACAO });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('só busca depois dos 300 ms de debounce', async () => {
    vi.useFakeTimers();
    renderSelecao();

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(searchPraises).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(searchPraises).toHaveBeenCalledTimes(1);
  });

  it('mostra o nome do louvor que permanece', async () => {
    renderSelecao();
    expect(await screen.findByText('Grande Deus')).toBeTruthy();
  });

  it('tira o próprio keeper da lista de resultados', async () => {
    vi.mocked(searchPraises).mockResolvedValue({
      data: [louvor(keeperId, 'Grande Deus'), louvor(outroId, 'Grande Deus Dup')],
      pagination: PAGINACAO,
    });

    renderSelecao();

    expect(await screen.findByText('Grande Deus Dup')).toBeTruthy();
    // o keeper aparece só no cabeçalho, nunca como opção clicável
    expect(screen.queryByRole('button', { name: /Grande Deus$/ })).toBeNull();
  });

  it('mostra o erro quando a busca falha', async () => {
    vi.mocked(searchPraises).mockRejectedValue(new Error('rede fora do ar'));
    renderSelecao();
    expect(await screen.findByText('rede fora do ar')).toBeTruthy();
  });

  it('escolher um resultado leva para a tela de mesclagem', async () => {
    const user = userEvent.setup();
    vi.mocked(searchPraises).mockResolvedValue({
      data: [louvor(outroId, 'Grande Deus Dup')],
      pagination: PAGINACAO,
    });

    renderSelecao();

    const alvo = await screen.findByText('Grande Deus Dup');
    await user.click(alvo);

    expect(await screen.findByText(`mesclar ${keeperId} com ${outroId}`)).toBeTruthy();
  });

  it('descarta a resposta antiga que chega depois da nova', async () => {
    // Duas buscas em voo resolvem em ordem arbitrária: sem guarda, a resposta
    // de "aleluia" chegando atrasada repinta a lista embaixo do termo "santo"
    // — e um clique ali abre direto a tela destrutiva.
    const user = userEvent.setup();
    const antiga = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    const nova = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    vi.mocked(searchPraises)
      .mockReturnValueOnce(antiga.promessa)
      .mockReturnValueOnce(nova.promessa);

    renderSelecao();
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(1), { timeout: 2000 });

    await user.type(campoDeBusca(), 'santo{Enter}');
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(2), { timeout: 2000 });

    nova.resolver({ data: [louvor(outroId, 'Santo Santo')], pagination: PAGINACAO });
    await screen.findByText('Santo Santo');

    antiga.resolver({ data: [louvor('id-aleluia', 'Aleluia')], pagination: PAGINACAO });
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.queryByText('Aleluia')).toBeNull();
    expect(screen.getByText('Santo Santo')).toBeTruthy();
  });

  it('resposta antiga não apaga o "Buscando…" da busca nova', async () => {
    const user = userEvent.setup();
    const antiga = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    const nova = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    vi.mocked(searchPraises)
      .mockReturnValueOnce(antiga.promessa)
      .mockReturnValueOnce(nova.promessa);

    renderSelecao();
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(1), { timeout: 2000 });

    await user.type(campoDeBusca(), 'santo{Enter}');
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(2), { timeout: 2000 });

    antiga.resolver({ data: [], pagination: PAGINACAO });
    await new Promise((r) => setTimeout(r, 30));

    // a busca nova segue em voo: o "Buscando…" é dela, não da que já morreu
    expect(screen.getByText('Buscando…')).toBeTruthy();
  });

  it('cancela de fato a requisição em voo quando o termo muda', async () => {
    const user = userEvent.setup();
    const sinais: AbortSignal[] = [];
    vi.mocked(searchPraises).mockImplementation((async (_p: unknown, signal?: AbortSignal) => {
      if (signal) sinais.push(signal);
      return new Promise(() => {}) as never;
    }) as never);

    renderSelecao();
    await waitFor(() => expect(sinais).toHaveLength(1), { timeout: 2000 });
    expect(sinais[0].aborted).toBe(false);

    await user.type(campoDeBusca(), 'santo{Enter}');
    await waitFor(() => expect(sinais[0].aborted).toBe(true), { timeout: 2000 });
  });

  it('erro de busca já superada não pinta erro sobre a lista válida', async () => {
    const user = userEvent.setup();
    const antiga = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    const nova = adiada<{ data: Praise[]; pagination: PaginationInfo }>();
    vi.mocked(searchPraises)
      .mockReturnValueOnce(antiga.promessa)
      .mockReturnValueOnce(nova.promessa);

    renderSelecao();
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(1), { timeout: 2000 });

    await user.type(campoDeBusca(), 'santo{Enter}');
    await waitFor(() => expect(searchPraises).toHaveBeenCalledTimes(2), { timeout: 2000 });

    nova.resolver({ data: [louvor(outroId, 'Santo Santo')], pagination: PAGINACAO });
    await screen.findByText('Santo Santo');

    (antiga.resolver as unknown as (v: unknown) => void)(Promise.reject(new Error('falhou')));
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.queryByText('falhou')).toBeNull();
    expect(screen.getByText('Santo Santo')).toBeTruthy();
  });
});
