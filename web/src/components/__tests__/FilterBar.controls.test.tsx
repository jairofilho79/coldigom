import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';

import { FilterBar } from '../FilterBar';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    getFilterOptions: vi.fn(),
    getMaterialKinds: vi.fn(),
  };
});

import { getFilterOptions, getMaterialKinds } from '../../services/api';

/** Espelha a query string para as asserções verificarem o efeito real. */
const espelho = { url: '' };
function EspiaUrl() {
  const [params] = useSearchParams();
  const url = params.toString();
  useEffect(() => {
    espelho.url = url;
  }, [url]);
  return null;
}

async function montar(inicial = '/') {
  vi.mocked(getFilterOptions).mockResolvedValue({
    rhythms: ['Valsa', 'Marcha'],
    tonalities: ['C', 'G'],
    categories: ['Louvor', 'Adoração'],
    tags: [{ id: 't1', name: 'Coletânea', parent_id: null, count: 10 }],
  });
  vi.mocked(getMaterialKinds).mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={[inicial]}>
      <EspiaUrl />
      <FilterBar />
    </MemoryRouter>
  );
  await screen.findByText('Coleções');
}

describe('FilterBar — controles que faltavam', () => {
  beforeEach(() => { vi.clearAllMocks(); espelho.url = ''; });

  it('oferece o filtro de Ritmo', async () => {
    // rhythm existia no FilterState, no useFilters, no services/api e a API já
    // devolvia as opções — e a barra não renderizava nada. Dado buscado e
    // jogado fora; só dava para usar editando a URL na mão.
    const usuario = userEvent.setup();
    await montar();

    await usuario.click(screen.getByRole('button', { name: /ritmo/i }));
    await usuario.click(screen.getByRole('checkbox', { name: 'Valsa' }));

    expect(espelho.url).toContain('rhythm=Valsa');
  });

  it('oferece o filtro de Tom', async () => {
    const usuario = userEvent.setup();
    await montar();

    await usuario.click(screen.getByRole('button', { name: /tom/i }));
    await usuario.click(screen.getByRole('checkbox', { name: 'G' }));

    expect(espelho.url).toContain('tonality=G');
  });

  it('oferece a faixa de número', async () => {
    const usuario = userEvent.setup();
    await montar();

    await usuario.type(screen.getByLabelText(/número mínimo/i), '10');
    await usuario.type(screen.getByLabelText(/número máximo/i), '99');

    expect(espelho.url).toContain('numberMin=10');
    expect(espelho.url).toContain('numberMax=99');
  });

  it('não manda faixa de número inválida para a API', async () => {
    // A API passou a recusar numberMin não numérico com 400; a tela não pode
    // produzir uma requisição que ela mesma sabe que é inválida.
    const usuario = userEvent.setup();
    await montar();

    await usuario.type(screen.getByLabelText(/número mínimo/i), 'abc');
    expect(espelho.url).not.toContain('numberMin');
  });
});

describe('FilterBar — filtros ativos visíveis', () => {
  beforeEach(() => { vi.clearAllMocks(); espelho.url = ''; });

  it('mostra cada filtro aplicado como uma marca removível', async () => {
    // Antes só havia um contador numérico no gatilho do dropdown: não dava
    // para ver o que estava aplicado nem remover um filtro sem reabrir o menu
    // certo e caçar a opção marcada.
    await montar('/?category=Louvor&rhythm=Valsa&numberMin=10');

    const ativos = screen.getByRole('group', { name: /filtros aplicados/i });
    expect(ativos).toBeTruthy();
    expect(screen.getByRole('button', { name: /remover filtro categoria: louvor/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /remover filtro ritmo: valsa/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /remover filtro número a partir de 10/i })).toBeTruthy();
  });

  it('remover uma marca tira só aquele filtro', async () => {
    const usuario = userEvent.setup();
    await montar('/?category=Louvor&rhythm=Valsa');

    await usuario.click(screen.getByRole('button', { name: /remover filtro categoria: louvor/i }));

    expect(espelho.url).not.toContain('category');
    expect(espelho.url).toContain('rhythm=Valsa');
  });

  it('sem filtro aplicado, não mostra a área de filtros ativos', async () => {
    await montar('/');
    expect(screen.queryByRole('group', { name: /filtros aplicados/i })).toBeNull();
  });
});
