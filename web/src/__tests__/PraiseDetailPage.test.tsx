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
      { id: 'kind2', name: 'Audio' },
      { id: 'kind3', name: 'Acordes' },
    ]),
    updatePraise: vi.fn(),
    getTags: vi.fn().mockResolvedValue([
      { id: 'tag1', name: 'Coletânea' },
      { id: 'tag2', name: 'Avulsos' },
      { id: 'tag3', name: 'GLTM' },
    ]),
    addPraiseTag: vi.fn(),
    removePraiseTag: vi.fn(),
    createMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    bulkUploadMaterials: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

import { getPraise, getMe } from '../services/api';

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
    tag_ids: 'tag1,tag2',
    tags: [
      { id: 'tag1', name: 'Coletânea' },
      { id: 'tag2', name: 'Avulsos' },
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
        material_kind_name: 'Audio',
        type: 'mp3',
        r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat2.mp3',
        file_path_legacy: 'path/to/file.mp3',
        source_material_id: null,
      },
    ],
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
      expect(screen.getByText('Áudio')).toBeTruthy();
      expect(
        document.querySelector('audio.audio-player-element')
      ).toBeTruthy();
    });
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

  describe('Materiais (admin)', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    });

    it('exibe seções de adicionar material e importação em lote', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByText('Materiais (admin)')).toBeTruthy();
      });
      expect(screen.getByRole('heading', { name: 'Adicionar material' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Importação em lote (pasta)' })).toBeTruthy();
      expect(screen.getByText(/Envie vários arquivos de uma vez/)).toBeTruthy();
    });

    it('usa PDF como tipo padrão e mostra seletor de arquivo', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      expect(screen.getByLabelText('Tipo do material')).toHaveTextContent('PDF');
      expect(screen.getByText('Escolher PDF')).toBeTruthy();
      expect(screen.queryByLabelText('Link do YouTube')).toBeNull();
    });

    it('ao selecionar YouTube exibe campo de link em vez de arquivo', async () => {
      const user = userEvent.setup();
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      await user.click(screen.getByLabelText('Tipo do material'));
      await user.click(screen.getByRole('option', { name: 'YouTube' }));
      expect(screen.getByLabelText('Link do YouTube')).toBeTruthy();
      expect(screen.queryByText('Escolher PDF')).toBeNull();
    });

    it('ao selecionar Cifra exibe placeholder e desabilita adicionar', async () => {
      const user = userEvent.setup();
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

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
});
