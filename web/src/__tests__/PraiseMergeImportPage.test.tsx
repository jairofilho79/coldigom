import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PraiseMergeImportPage } from '../pages/PraiseMergeImportPage';
import type { PraiseDetail, Material, Tag } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    getMaterialKinds: vi.fn().mockResolvedValue([
      { id: 'kind1', name: 'Partitura' },
      { id: 'kind2', name: 'Áudio' },
    ]),
    getTags: vi.fn(),
    mergePraises: vi.fn(),
    deleteMaterial: vi.fn(),
    updateMaterial: vi.fn(),
  };
});

import { getPraise, getTags, mergePraises, deleteMaterial, updateMaterial } from '../services/api';

const keeperId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
const sourceId = '1c12786e-4d32-4e95-a136-d85266008e11';

function material(id: string, praiseId: string): Material {
  return {
    id,
    praise_id: praiseId,
    material_kind: 'kind1',
    material_kind_name: 'Partitura',
    type: 'pdf',
    r2_key: null,
    file_path_legacy: '',
    source_material_id: null,
  };
}

const keeper: PraiseDetail = {
  id: keeperId,
  name: 'Grande Deus',
  number: '001',
  author: 'Autor A',
  rhythm: 'Avulsos',
  tonality: 'C',
  category: 'Louvor',
  lyrics: 'Letra A',
  group_id: null,
  tag_ids: 'tag1',
  tag_names: 'Coletânea',
  tags: [{ id: 'tag1', name: 'Coletânea', parent_id: null }],
  materials: [material('mat-keeper', keeperId)],
  group_members: [],
};

const source: PraiseDetail = {
  id: sourceId,
  name: 'Grande Deus Dup',
  number: '001',
  author: 'Autor B',
  rhythm: 'Marcha',
  tonality: 'G',
  category: 'Adoração',
  lyrics: 'Letra B',
  group_id: null,
  tag_ids: 'tag2',
  tag_names: 'Avulsos',
  tags: [{ id: 'tag2', name: 'Avulsos', parent_id: null }],
  materials: [material('mat-src', sourceId)],
  group_members: [],
};

/** Catálogo padrão: nenhuma das duas tags tem subtag, então nada bloqueia. */
const CATALOGO: Tag[] = [
  { id: 'tag1', name: 'Coletânea', parent_id: null },
  { id: 'tag2', name: 'Avulsos', parent_id: null },
];

function DestinoLouvor() {
  const location = useLocation();
  const state = location.state as { mergeSuccess?: boolean; mergedPraiseName?: string } | null;
  return <div>{state?.mergeSuccess ? `mesclado: ${state.mergedPraiseName}` : 'Detalhe'}</div>;
}

function renderMergeImport(entrada = `/praise/${keeperId}/merge/${sourceId}`) {
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/praise/:id/merge/:sourceId" element={<PraiseMergeImportPage />} />
        <Route path="/praise/:id" element={<DestinoLouvor />} />
      </Routes>
    </MemoryRouter>
  );
}

function secao(titulo: string): HTMLElement {
  const cabecalho = screen.getByText(titulo);
  const el = cabecalho.closest('section');
  if (!el) throw new Error(`Seção «${titulo}» não encontrada`);
  return el as HTMLElement;
}

async function esperarCarregar() {
  await waitFor(() => {
    expect(screen.getByText('Importar e mesclar')).toBeTruthy();
  });
}

describe('PraiseMergeImportPage', () => {
  let confirmar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (getPraise as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === keeperId) return keeper;
      if (id === sourceId) return source;
      throw new Error('not found');
    });
    vi.mocked(getTags).mockResolvedValue(CATALOGO);
    (mergePraises as ReturnType<typeof vi.fn>).mockResolvedValue({ ...keeper, author: 'Autor B' });
    (deleteMaterial as ReturnType<typeof vi.fn>).mockResolvedValue({ ...keeper, materials: [] });
    (updateMaterial as ReturnType<typeof vi.fn>).mockResolvedValue(keeper);
    confirmar = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmar);
  });

  it('mostra conflito de metadados com duas opções', async () => {
    renderMergeImport();
    await esperarCarregar();

    expect(screen.getAllByText('Manter (atual)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Usar (mesclado)').length).toBeGreaterThan(0);
    expect(screen.getByText('De: Grande Deus Dup')).toBeTruthy();
  });

  it('recusar um louvor mesclado com ele mesmo antes de carregar qualquer coisa', async () => {
    renderMergeImport(`/praise/${keeperId}/merge/${keeperId}`);

    expect(
      await screen.findByText('Não é possível mesclar um louvor com ele mesmo.')
    ).toBeTruthy();
    expect(getPraise).not.toHaveBeenCalled();
  });

  it('finalizar manda metadados e tags resolvidos, não só os ids', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    await waitFor(() => expect(mergePraises).toHaveBeenCalled());
    const [idChamado, corpo] = vi.mocked(mergePraises).mock.calls[0];
    expect(idChamado).toBe(keeperId);
    expect(corpo.source_praise_id).toBe(sourceId);
    expect(corpo.material_ids_to_import).toEqual(['mat-src']);
    expect([...corpo.tag_ids].sort()).toEqual(['tag1', 'tag2']);
    // sem escolha explícita do usuário, vence o louvor que permanece
    expect(corpo.metadata).toEqual({
      name: 'Grande Deus',
      number: '001',
      author: 'Autor A',
      rhythm: 'Avulsos',
      tonality: 'C',
      category: 'Louvor',
      lyrics: 'Letra A',
    });
  });

  it('escolher "Usar (mesclado)" num campo manda o valor do outro louvor', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    const linhaAutor = screen.getByText('Autor').closest('.merge-conflict-row') as HTMLElement;
    const opcoes = within(linhaAutor).getAllByRole('radio');
    await user.click(opcoes[1]);

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    await waitFor(() => expect(mergePraises).toHaveBeenCalled());
    const corpo = vi.mocked(mergePraises).mock.calls[0][1];
    expect(corpo.metadata.author).toBe('Autor B');
    // os demais campos continuam vindo do keeper
    expect(corpo.metadata.tonality).toBe('C');
  });

  it('recusar a confirmação não exclui louvor nenhum', async () => {
    const user = userEvent.setup();
    confirmar.mockReturnValue(false);
    renderMergeImport();
    await esperarCarregar();

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    expect(confirmar).toHaveBeenCalled();
    expect(mergePraises).not.toHaveBeenCalled();
  });

  it('desmarcar um material tira ele da importação', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    const importar = secao('Materiais a importar');
    await user.click(within(importar).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    await waitFor(() => expect(mergePraises).toHaveBeenCalled());
    expect(vi.mocked(mergePraises).mock.calls[0][1].material_ids_to_import).toEqual([]);
  });

  it('a seção de importação não exclui material na hora — só a marcação decide', async () => {
    // O botão «Remover» ali apagava o material do louvor mesclado na hora,
    // mesmo se a mesclagem nunca acontecesse, ao lado de uma checkbox
    // reversível. Quem não quer importar apenas desmarca.
    renderMergeImport();
    await esperarCarregar();

    const importar = secao('Materiais a importar');
    expect(within(importar).queryByRole('button', { name: 'Remover' })).toBeNull();
  });

  it('remover material do louvor atual avisa que a exclusão é agora e definitiva', async () => {
    const user = userEvent.setup();
    confirmar.mockReturnValue(false);
    renderMergeImport();
    await esperarCarregar();

    const atuais = secao('Materiais do louvor atual');
    await user.click(within(atuais).getByRole('button', { name: 'Remover' }));

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(String(confirmar.mock.calls[0][0])).toMatch(/permanentemente/i);
    expect(String(confirmar.mock.calls[0][0])).toMatch(/mesmo que|independente|sem finalizar/i);
    expect(deleteMaterial).not.toHaveBeenCalled();
  });

  it('remover material do louvor atual exclui quando o usuário confirma', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    const atuais = secao('Materiais do louvor atual');
    await user.click(within(atuais).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(deleteMaterial).toHaveBeenCalledWith('mat-keeper'));
  });

  it('trocar a categoria de um material salva na hora', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    const atuais = secao('Materiais do louvor atual');
    await user.click(within(atuais).getByRole('button', { name: 'Categoria do material' }));
    await user.click(await screen.findByRole('option', { name: 'Áudio' }));

    await waitFor(() =>
      expect(updateMaterial).toHaveBeenCalledWith('mat-keeper', { material_kind: 'kind2' })
    );
  });

  it('avisa a tela do louvor que a mesclagem deu certo', async () => {
    const user = userEvent.setup();
    renderMergeImport();
    await esperarCarregar();

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    expect(await screen.findByText('mesclado: Grande Deus Dup')).toBeTruthy();
  });

  it('tag de agrupamento é apontada e trava a finalização até ser desmarcada', async () => {
    // O servidor recusa a mesclagem inteira com 400 quando um id da lista é
    // tag com filhos. Sem esse aviso, o usuário só descobre no último clique
    // e sem saber qual tag é a culpada.
    const user = userEvent.setup();
    vi.mocked(getTags).mockResolvedValue([
      ...CATALOGO,
      { id: 'tag1a', name: 'Coral', parent_id: 'tag1' },
    ]);

    renderMergeImport();
    await esperarCarregar();

    const aviso = await screen.findByText(/agrupa subtags/i);
    expect(aviso.textContent).toMatch(/Coletânea/);
    expect(screen.getByRole('button', { name: 'Finalizar mesclagem' })).toBeDisabled();

    const tags = secao('Tags');
    await user.click(within(tags).getByRole('checkbox', { name: /Coletânea/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Finalizar mesclagem' })).toBeEnabled()
    );

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));
    await waitFor(() => expect(mergePraises).toHaveBeenCalled());
    expect(vi.mocked(mergePraises).mock.calls[0][1].tag_ids).toEqual(['tag2']);
  });

  it('catálogo de tags indisponível não impede a mesclagem', async () => {
    const user = userEvent.setup();
    vi.mocked(getTags).mockRejectedValue(new Error('sem permissão'));

    renderMergeImport();
    await esperarCarregar();

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));
    await waitFor(() => expect(mergePraises).toHaveBeenCalled());
  });
});
