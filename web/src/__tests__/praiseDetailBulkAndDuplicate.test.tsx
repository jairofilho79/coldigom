import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PraiseDetailPage } from '../pages/PraiseDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import type { PraiseDetail } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    getAssetUrl: vi.fn((key: string) => `http://localhost:8787/${key}`),
    getMe: vi.fn(),
    refreshSession: vi.fn().mockResolvedValue(false),
    getMaterialKinds: vi.fn().mockResolvedValue([
      { id: 'kind1', name: 'Partitura' },
      { id: 'kind2', name: 'Áudio' },
      { id: 'kind3', name: 'Cifra' },
      { id: 'kind4', name: 'YouTube' },
      { id: 'kind5', name: 'Gestos' },
      { id: 'kind6', name: 'MIDI' },
    ]),
    createPraise: vi.fn(),
    duplicatePraise: vi.fn(),
    updatePraise: vi.fn(),
    getTags: vi.fn().mockResolvedValue([
      { id: 'tag1', name: 'Coletânea', parent_id: null },
    ]),
    addPraiseTag: vi.fn(),
    removePraiseTag: vi.fn(),
    groupPraise: vi.fn(),
    createTag: vi.fn(),
    createMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    bulkMoveMaterials: vi.fn(),
    bulkDeleteMaterials: vi.fn(),
    bulkUploadMaterials: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getDriveStatus: vi.fn().mockResolvedValue({ connected: false }),
    getDriveConnectUrl: vi.fn(),
  };
});

import {
  getPraise,
  getMe,
  duplicatePraise,
  bulkMoveMaterials,
  bulkDeleteMaterials,
} from '../services/api';

const mockAdminUser = { sub: 'admin-1', email: 'admin@test.com', name: 'Admin Teste' };

const mockPraise: PraiseDetail = {
  id: 'praise-100',
  name: 'Louvor Teste',
  number: '100',
  author: 'Autor Teste',
  rhythm: 'Hino',
  tonality: 'D',
  lyrics: 'Letra do louvor',
  group_id: null,
  tag_ids: 'tag1',
  tag_names: 'Coletânea',
  tags: [{ id: 'tag1', name: 'Coletânea', parent_id: null }],
  materials: [
    {
      id: 'mat-pdf-1',
      praise_id: 'praise-100',
      material_kind: 'kind1',
      material_kind_name: 'Partitura',
      type: 'pdf',
      r2_key: 'assets/pdf1.pdf',
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
    {
      id: 'mat-audio-1',
      praise_id: 'praise-100',
      material_kind: 'kind2',
      material_kind_name: 'Áudio',
      type: 'mp3',
      r2_key: 'assets/audio1.mp3',
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
    {
      id: 'mat-chord-1',
      praise_id: 'praise-100',
      material_kind: 'kind3',
      material_kind_name: 'Cifra',
      type: 'chord',
      r2_key: 'assets/chord1.chord',
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
    {
      id: 'mat-yt-1',
      praise_id: 'praise-100',
      material_kind: 'kind4',
      material_kind_name: 'YouTube',
      type: 'youtube',
      r2_key: null,
      file_path_legacy: '',
      source_material_id: null,
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    },
    {
      id: 'mat-gesto-1',
      praise_id: 'praise-100',
      material_kind: 'kind5',
      material_kind_name: 'Gestos',
      type: 'gestures',
      r2_key: null,
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
    {
      id: 'mat-other-1',
      praise_id: 'praise-100',
      material_kind: 'kind6',
      material_kind_name: 'MIDI',
      type: 'midi',
      r2_key: 'assets/song.mid',
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
  ],
};

function renderPage(initialEntry = '/praise/praise-100') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/praise/:id" element={<PraiseDetailPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

describe('Ações em lote de materiais e Duplicação de Louvor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === 'praise-100') return mockPraise;
      if (id === 'praise-200') {
        return {
          ...mockPraise,
          id: 'praise-200',
          name: 'Louvor Destino',
          number: '200',
          materials: [],
        };
      }
      throw new Error('Not found');
    });
  });

  it('exibe o botão Duplicar e barra de lote ao entrar no modo de edição', async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Duplicar' })).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: 'Editar' });
    await user.click(editBtn);

    expect(screen.getByLabelText('Ações em lote de materiais')).toBeInTheDocument();
    expect(screen.getByText('Selecionar todos (6)')).toBeInTheDocument();
    expect(screen.getByText('0 de 6 selecionados')).toBeInTheDocument();
  });

  it('selecionar todos marca todos os materiais e permite limpar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const selectAllCheckbox = screen.getByLabelText('Selecionar todos os materiais');
    await user.click(selectAllCheckbox);

    expect(screen.getByText('6 de 6 selecionados')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Desmarcar todos os materiais'));
    expect(screen.getByText('0 de 6 selecionados')).toBeInTheDocument();
  });

  it('permite alternar seleção individual de materiais do youtube, acordes, gestos e outros', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const ytCheckbox = screen.getByRole('checkbox', { name: /Selecionar YouTube/i });
    await user.click(ytCheckbox);
    expect(ytCheckbox).toBeChecked();

    const cifraCheckbox = screen.getByRole('checkbox', { name: /Selecionar Cifra/i });
    await user.click(cifraCheckbox);
    expect(cifraCheckbox).toBeChecked();

    const gestoCheckbox = screen.getByRole('checkbox', { name: /Selecionar Gestos/i });
    await user.click(gestoCheckbox);
    expect(gestoCheckbox).toBeChecked();

    const midiCheckbox = screen.getByRole('checkbox', { name: /Selecionar MIDI/i });
    await user.click(midiCheckbox);
    expect(midiCheckbox).toBeChecked();

    expect(screen.getByText('4 de 6 selecionados')).toBeInTheDocument();
  });

  it('permite mover múltiplos materiais selecionados para outro louvor', async () => {
    const user = userEvent.setup();
    (bulkMoveMaterials as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraise,
      materials: [mockPraise.materials[2]], // sobrou apenas a cifra
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    // Selecionar os dois materiais específicos
    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));
    await user.click(screen.getByRole('checkbox', { name: /Selecionar Áudio/i }));

    expect(screen.getByText('2 de 6 selecionados')).toBeInTheDocument();

    const moverBtn = screen.getByRole('button', { name: /Mover selecionados \(2\)/ });
    await user.click(moverBtn);

    const inputDestino = screen.getByLabelText('ID do louvor de destino');
    await user.type(inputDestino, 'praise-200');

    expect(await screen.findByText('200 — Louvor Destino')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar mover' }));

    await waitFor(() => {
      expect(bulkMoveMaterials).toHaveBeenCalledWith(
        'praise-100',
        expect.arrayContaining(['mat-pdf-1', 'mat-audio-1']),
        'praise-200'
      );
    });

    expect(await screen.findByText(/Movido para «200 — Louvor Destino»/)).toBeInTheDocument();
  });

  it('permite excluir múltiplos materiais selecionados após confirmação', async () => {
    const user = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (bulkDeleteMaterials as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraise,
      materials: [mockPraise.materials[2]],
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));
    await user.click(screen.getByRole('checkbox', { name: /Selecionar Áudio/i }));

    const removerBtn = screen.getByRole('button', { name: /Remover selecionados \(2\)/ });
    await user.click(removerBtn);

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar.mock.calls[0][0]).toMatch(/2 materiais selecionados serão excluídos permanentemente/i);

    await waitFor(() => {
      expect(bulkDeleteMaterials).toHaveBeenCalledWith(
        'praise-100',
        expect.arrayContaining(['mat-pdf-1', 'mat-audio-1'])
      );
    });

    confirmar.mockRestore();
  });

  it('permite excluir único material selecionado com mensagem singular', async () => {
    const user = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (bulkDeleteMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraise);

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));

    const removerBtn = screen.getByRole('button', { name: /Remover selecionados \(1\)/ });
    await user.click(removerBtn);

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(confirmar.mock.calls[0][0]).toMatch(/1 material selecionado será excluído permanentemente/i);

    await waitFor(() => {
      expect(bulkDeleteMaterials).toHaveBeenCalledWith('praise-100', ['mat-pdf-1']);
    });

    confirmar.mockRestore();
  });

  it('recusar a confirmação de exclusão em lote não exclui nada', async () => {
    const user = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));

    const removerBtn = screen.getByRole('button', { name: /Remover selecionados \(1\)/ });
    await user.click(removerBtn);

    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(bulkDeleteMaterials).not.toHaveBeenCalled();

    confirmar.mockRestore();
  });

  it('duplica o louvor chamando a API e navegando para a nova página', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Louvor Teste (Cópia Especial)');
    (duplicatePraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraise,
      id: 'praise-copia',
      name: 'Louvor Teste (Cópia Especial)',
    });

    renderPage();

    const duplicarBtn = await screen.findByRole('button', { name: 'Duplicar' });
    await user.click(duplicarBtn);

    expect(promptSpy).toHaveBeenCalledWith('Nome do louvor duplicado:', 'Louvor Teste (cópia)');
    expect(duplicatePraise).toHaveBeenCalledWith('praise-100', 'Louvor Teste (Cópia Especial)');

    promptSpy.mockRestore();
  });

  it('duplica com nome padrão quando o usuário deixa o prompt em branco', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ');
    (duplicatePraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraise,
      id: 'praise-copia-padrao',
    });

    renderPage();

    const duplicarBtn = await screen.findByRole('button', { name: 'Duplicar' });
    await user.click(duplicarBtn);

    expect(duplicatePraise).toHaveBeenCalledWith('praise-100', undefined);
    promptSpy.mockRestore();
  });

  it('cancelar o prompt de duplicação não chama a API', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    renderPage();

    const duplicarBtn = await screen.findByRole('button', { name: 'Duplicar' });
    await user.click(duplicarBtn);

    expect(promptSpy).toHaveBeenCalled();
    expect(duplicatePraise).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('exibe erro caso a duplicação falhe', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Cópia');
    (duplicatePraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Erro ao duplicar louvor'));

    renderPage();

    const duplicarBtn = await screen.findByRole('button', { name: 'Duplicar' });
    await user.click(duplicarBtn);

    expect(await screen.findByText('Erro ao duplicar louvor')).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it('exibe erro caso a movimentação em lote falhe', async () => {
    const user = userEvent.setup();
    (bulkMoveMaterials as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Erro ao mover materiais'));

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));

    const moverBtn = screen.getByRole('button', { name: /Mover selecionados/ });
    await user.click(moverBtn);

    const inputDestino = screen.getByLabelText('ID do louvor de destino');
    await user.type(inputDestino, 'praise-200');
    expect(await screen.findByText('200 — Louvor Destino')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar mover' }));
    expect(await screen.findByText('Erro ao mover materiais')).toBeInTheDocument();
  });

  it('exibe erro caso a exclusão em lote falhe', async () => {
    const user = userEvent.setup();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (bulkDeleteMaterials as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Erro ao remover materiais'));

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('checkbox', { name: /Selecionar Partitura/i }));

    const removerBtn = screen.getByRole('button', { name: /Remover selecionados/ });
    await user.click(removerBtn);

    expect(await screen.findByText('Erro ao remover materiais')).toBeInTheDocument();
    confirmar.mockRestore();
  });

  it('permite excluir material de cifra individualmente', async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const chordBlock = document.getElementById('material-mat-chord-1');
    expect(chordBlock).toBeInTheDocument();
    const removeBtn = chordBlock?.querySelector('.material-inline-admin-remove');
    if (removeBtn) {
      await user.click(removeBtn);
    }
    deleteSpy.mockRestore();
  });

  it('fechar o modo de edição limpa os materiais selecionados', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    const selectAllCheckbox = screen.getByLabelText('Selecionar todos os materiais');
    await user.click(selectAllCheckbox);
    expect(screen.getByText('6 de 6 selecionados')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar edição' }));
    expect(screen.queryByText('6 de 6 selecionados')).not.toBeInTheDocument();
  });
});
