import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PraiseDetailPage } from '../pages/PraiseDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import type { PraiseDetail } from '../types';

// Mock the api module (preserve exports such as API_BASE_URL used by the page)
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    getAssetUrl: vi.fn((key: string) => `http://localhost:8787/${key}`),
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
    getMaterialKinds: vi.fn().mockResolvedValue([
      { id: 'kind1', name: 'Partitura' },
      { id: 'kind2', name: 'Áudio' },
      { id: 'kind3', name: 'Cifra' },
      { id: 'c7454ea9-3ae0-4548-9cc5-c4187b80641a', name: 'Desconhecido' },
    ]),
    createPraise: vi.fn(),
    updatePraise: vi.fn(),
    getTags: vi.fn().mockResolvedValue([
      { id: 'tag1', name: 'Coletânea', parent_id: null },
      { id: 'tag2', name: 'Avulsos', parent_id: null },
      { id: 'tag3', name: 'GLTM', parent_id: null },
    ]),
    addPraiseTag: vi.fn(),
    removePraiseTag: vi.fn(),
    groupPraise: vi.fn(),
    createMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    bulkUploadMaterials: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

import { getPraise, getMe, createPraise, groupPraise } from '../services/api';

const mockAdminUser = { sub: 'admin-1', email: 'admin@test.com', name: 'Admin Teste' };

describe('PraiseDetailPage Component', () => {
  const mockPraiseDetail: PraiseDetail = {
    id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
    name: 'Grande Deus',
    number: '001',
    author: 'Autor 1',
    rhythm: 'Avulsos',
    tonality: 'C',
    category: 'Louvor',
    lyrics: 'Esta é a letra do louvor',
    group_id: null,
    tag_ids: 'tag1,tag2',
    tag_names: 'Coletânea,Avulsos',
    tags: [
      { id: 'tag1', name: 'Coletânea', parent_id: null },
      { id: 'tag2', name: 'Avulsos', parent_id: null },
    ],
    materials: [
      {
        id: 'mat1',
        praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        material_kind: 'kind1',
        material_kind_name: 'Partitura',
        type: 'pdf',
        r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat1.pdf',
        file_path_legacy: 'path/to/file.pdf',
        source_material_id: null,
      },
      {
        id: 'mat2',
        praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        material_kind: 'kind2',
        material_kind_name: 'Áudio',
        type: 'mp3',
        r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat2.mp3',
        file_path_legacy: 'path/to/file.mp3',
        source_material_id: null,
      },
    ],
    group_members: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  function renderWithRouter(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/praise/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it('should render loading state initially', async () => {
    (getPraise as any).mockImplementation(() => new Promise(() => {}));

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    expect(screen.getByText(/carregando louvor/i)).toBeTruthy();
  });

  it('should render praise details', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Grande Deus')).toBeTruthy();
    });

    expect(screen.getByText('Nº 001')).toBeTruthy();
    expect(screen.getByText('Autor 1')).toBeTruthy();
    expect(screen.getAllByText('Avulsos').length).toBeGreaterThan(0);
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('Louvor')).toBeTruthy();
  });

  it('should show download zip link without login', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Baixar em ZIP' });
      expect(link.getAttribute('href')).toBe(
        'http://localhost:8787/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/download.zip'
      );
      expect(link.getAttribute('download')).not.toBeNull();
    });

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('should show praise id and copy to clipboard', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText(mockPraiseDetail.id)).toBeTruthy();
    });

    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /copiar id/i }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(mockPraiseDetail.id);
      expect(screen.getByRole('button', { name: /copiar id/i })).toHaveTextContent('Copiado!');
    });

    writeTextSpy.mockRestore();
  });

  it('should render tags', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Coletânea')).toBeTruthy();
      expect(screen.getAllByText('Avulsos').length).toBeGreaterThan(0);
    });
  });

  it('should render lyrics section', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Letra')).toBeTruthy();
      expect(screen.getByText('Esta é a letra do louvor')).toBeTruthy();
    });
  });

  it('should render audio player', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByLabelText('Áudio')).toBeTruthy();
      expect(
        document.querySelector('audio.audio-player-element')
      ).toBeTruthy();
    });

    expect(screen.queryByLabelText('Categoria do material')).toBeNull();
  });

  it('should render PDF links', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Partituras')).toBeTruthy();
      expect(screen.getByText('Partitura')).toBeTruthy();
    });
  });

  it('should render back link', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Voltar para lista')).toBeTruthy();
    });
  });

  it('should show error state on API error', async () => {
    (getPraise as any).mockRejectedValue(new Error('API Error'));

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar/i)).toBeTruthy();
    });
  });

  it('should show not found state when praise is null', async () => {
    (getPraise as any).mockResolvedValue(null);

    renderWithRouter('non-existent-id');

    await waitFor(() => {
      expect(screen.getByText('Louvor não encontrado')).toBeTruthy();
    });
  });

  it('should not render audio section when no audio materials', async () => {
    const praiseWithoutAudio = {
      ...mockPraiseDetail,
      materials: [mockPraiseDetail.materials[0]], // Only PDF
    };
    (getPraise as any).mockResolvedValue(praiseWithoutAudio);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.queryByText('Áudio')).toBeNull();
    });
  });

  it('should not render lyrics section when no lyrics', async () => {
    const praiseWithoutLyrics = {
      ...mockPraiseDetail,
      lyrics: '',
    };
    (getPraise as any).mockResolvedValue(praiseWithoutLyrics);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.queryByText('Letra')).toBeNull();
    });
  });

  it('should not render tags section when no tags', async () => {
    const praiseWithoutTags = {
      ...mockPraiseDetail,
      tags: [],
      tag_ids: '',
    };
    (getPraise as any).mockResolvedValue(praiseWithoutTags);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      const ColetaneaTag = screen.queryByText('Coletânea');
      expect(ColetaneaTag).toBeNull();
    });
  });

  describe('Novo louvor', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    });

    it('exibe formulário vazio e não chama getPraise', async () => {
      renderWithRouter('new');

      await waitFor(() => {
        expect(screen.getByText('Novo louvor')).toBeTruthy();
      });
      expect(getPraise).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Criar louvor' })).toBeTruthy();
      expect(screen.getByText('Materiais (após salvar)')).toBeTruthy();
      expect(screen.getByText('Importar do Google Drive')).toBeTruthy();
      expect(screen.queryByText('Materiais (admin)')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Baixar em ZIP' })).toBeNull();
    });

    it('cria louvor ao salvar', async () => {
      const user = userEvent.setup();
      const created: PraiseDetail = {
        ...mockPraiseDetail,
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Louvor Novo',
        materials: [],
        tags: [],
        tag_ids: '',
      };
      (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      renderWithRouter('new');

      await waitFor(() => {
        expect(screen.getByText('Novo louvor')).toBeTruthy();
      });

      const nameInput = screen.getAllByRole('textbox')[0];
      await user.type(nameInput, 'Louvor Novo');
      await user.click(screen.getByRole('button', { name: 'Criar louvor' }));

      await waitFor(() => {
        expect(createPraise).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Louvor Novo',
            tag_ids: [],
          })
        );
      });
    });
  });

  describe('Materiais (admin)', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    });

    async function enterEditMode() {
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
      });
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      return user;
    }

    it('exibe botão Agrupar Louvor no modo edição e agrupa por praiseId', async () => {
      const targetId = '1c12786e-4d32-4e95-a136-d85266008e11';
      (groupPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPraiseDetail,
        group_id: targetId,
        group_members: [
          { id: targetId, tags: [{ id: 'tag3', name: 'GLTM' }] },
        ],
      });

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      expect(screen.getByRole('button', { name: 'Agrupar Louvor' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Agrupar Louvor' }));

      const input = screen.getByLabelText('ID do louvor a agrupar');
      await user.type(input, targetId);
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(groupPraise).toHaveBeenCalledWith(
          '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          targetId
        );
      });

      expect(screen.getByText('Louvores agrupados')).toBeTruthy();
      expect(screen.getByText('GLTM')).toBeTruthy();
      expect(screen.getByRole('link', { name: /GLTM/ })).toHaveAttribute(
        'href',
        `/praise/${targetId}`
      );
      expect(screen.getByRole('link', { name: /GLTM/ })).toHaveAttribute('target', '_blank');
    });

    it('exibe botão Mesclar quando logado', async () => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Mesclar' })).toBeTruthy();
      });
      expect(screen.getByRole('link', { name: 'Mesclar' })).toHaveAttribute(
        'href',
        '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/merge'
      );
    });

    it('exibe Baixar em ZIP ao lado de Editar quando logado', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Baixar em ZIP' })).toBeTruthy();
      });

      expect(screen.getByRole('link', { name: 'Baixar em ZIP' })).toHaveAttribute(
        'href',
        'http://localhost:8787/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/download.zip'
      );
    });

    it('não exibe Materiais (admin) fora do modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
      });

      expect(screen.queryByText('Materiais (admin)')).toBeNull();
    });

    it('exibe seções de adicionar material e importação em lote', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Materiais (admin)')).toBeTruthy();
      });
      expect(screen.getByRole('heading', { name: 'Adicionar material' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Importação em lote (pasta)' })).toBeTruthy();
      expect(screen.getByText(/A categoria de cada arquivo é inferida pelo nome/)).toBeTruthy();
    });

    it('usa PDF como tipo padrão e mostra seletor de arquivo', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      expect(screen.getByLabelText('Tipo do material')).toHaveTextContent('PDF');
      expect(screen.getByText('Escolher PDF')).toBeTruthy();
      expect(screen.queryByLabelText('Link do YouTube')).toBeNull();
    });

    it('ao selecionar YouTube exibe campo de link em vez de arquivo', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      await user.click(screen.getByLabelText('Tipo do material'));
      await user.click(screen.getByRole('option', { name: 'YouTube' }));
      expect(screen.getByLabelText('Link do YouTube')).toBeTruthy();
      expect(screen.queryByText('Escolher PDF')).toBeNull();
    });

    it('ao selecionar Cifra exibe placeholder e desabilita adicionar', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      await user.click(screen.getByLabelText('Tipo do material'));
      await user.click(screen.getByRole('option', { name: 'Cifra' }));
      expect(screen.getByText('Editor de cifras — em breve')).toBeTruthy();

      const addPanel = screen.getByRole('heading', { name: 'Adicionar material' }).closest('.materials-panel');
      expect(addPanel).toBeTruthy();
      const addBtn = within(addPanel!).getByRole('button', { name: 'Adicionar material' });
      expect((addBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('não exibe painel Materiais cadastrados', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Materiais (admin)')).toBeTruthy();
      });

      expect(screen.queryByRole('heading', { name: 'Materiais cadastrados' })).toBeNull();
    });

    it('não exibe edição/remoção de material fora do modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByText('Partituras')).toBeTruthy();
        expect(screen.getByLabelText('Áudio')).toBeTruthy();
      });

      expect(screen.queryAllByLabelText('Categoria do material')).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Remover' })).toHaveLength(0);
    });

    it('exibe edição inline de categoria em Áudio e Partituras no modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Partituras')).toBeTruthy();
        expect(screen.getByLabelText('Áudio')).toBeTruthy();
      });

      const categorySelects = screen.getAllByLabelText('Categoria do material');
      expect(categorySelects.length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByRole('button', { name: 'Remover' }).length).toBeGreaterThanOrEqual(2);
    });

    it('exibe placeholder de edição em Acordes no modo edição', async () => {
      const praiseWithChords = {
        ...mockPraiseDetail,
        materials: [
          ...mockPraiseDetail.materials,
          {
            id: 'mat3',
            praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
            material_kind: 'kind3',
            material_kind_name: 'Acordes',
            type: 'chord' as const,
            r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
            file_path_legacy: 'path/to/file.chord',
            source_material_id: null,
          },
        ],
      };
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithChords);

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Edição de categoria — em breve')).toBeTruthy();
      });
    });
  });

  it('should render chord materials when present', async () => {
    const praiseWithChords = {
      ...mockPraiseDetail,
      materials: [
        ...mockPraiseDetail.materials,
        {
          id: 'mat3',
          praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          material_kind: 'kind3',
          material_kind_name: 'Acordes',
          type: 'chord',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
          file_path_legacy: 'path/to/file.chord',
          source_material_id: null,
        },
      ],
    };
    (getPraise as any).mockResolvedValue(praiseWithChords);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getAllByText('Acordes').length).toBeGreaterThan(0);
    });
  });

  function praiseWithChord(has_content: boolean | undefined) {
    return {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat3',
          praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          material_kind: 'kind3',
          material_kind_name: 'Cifra I',
          type: 'chord',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
          file_path_legacy: 'path/to/file.chord',
          source_material_id: null,
          ...(has_content === undefined ? {} : { has_content }),
        },
      ],
    };
  }

  it('o card de cifra linka para a página dedicada, não para o arquivo cru', async () => {
    (getPraise as any).mockResolvedValue(praiseWithChord(true));
    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    const link = await screen.findByRole('link', { name: /Cifra I/ });
    expect(link).toHaveAttribute(
      'href',
      '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/cifra/mat3'
    );
  });

  it('cifra sem conteúdo aparece marcada e continua clicável', async () => {
    (getPraise as any).mockResolvedValue(praiseWithChord(false));
    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    const link = await screen.findByRole('link', { name: /Cifra I/ });
    expect(link).toHaveAttribute(
      'href',
      '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/cifra/mat3'
    );
    expect(screen.getByText(/sem conte\u00fado/i)).toBeInTheDocument();
  });
});
