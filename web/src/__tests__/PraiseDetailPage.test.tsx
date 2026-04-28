import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { PraiseDetailPage } from '../pages/PraiseDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PraiseDetail } from '../types';

// Mock the api module
vi.mock('../services/api', () => ({
  getPraise: vi.fn(),
  getAssetUrl: vi.fn((key: string) => `http://localhost:8787/${key}`),
}));

import { getPraise } from '../services/api';

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
  });

  function renderWithRouter(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/praise/${id}`]}>
        <Routes>
          <Route path="/praise/:id" element={<PraiseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('should render loading state initially', async () => {
    (getPraise as any).mockImplementation(() => new Promise(() => {}));

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    expect(screen.getByText(/carregando louvor/i)).toBeTruthy();
  });

  it('should render praise details', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText('Grande Deus')).toBeTruthy();
    });

    expect(screen.getByText('Nº 001')).toBeTruthy();
    expect(screen.getByText('Autor 1')).toBeTruthy();
    // "Avulsos" appears both as ritmo and as tag
    expect(screen.getAllByText('Avulsos').length).toBe(2);
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('Louvor')).toBeTruthy();
  });

  it('should render tags', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText('Coletânea')).toBeTruthy();
      expect(screen.getAllByText('Avulsos').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should render lyrics section', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText('Letra')).toBeTruthy();
      expect(screen.getByText('Esta é a letra do louvor')).toBeTruthy();
    });
  });

  it('should render audio player', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);
    let container: HTMLElement;

    await act(async () => {
      const view = renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      container = view.container;
    });

    await waitFor(() => {
      expect(screen.getByText('Áudio')).toBeTruthy();
      expect(container.querySelector('audio')).toBeTruthy();
    });
  });

  it('should render PDF links', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText('Partituras')).toBeTruthy();
      expect(screen.getByText('Partitura')).toBeTruthy();
    });
  });

  it('should render back link', async () => {
    (getPraise as any).mockResolvedValue(mockPraiseDetail);

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText('Voltar para lista')).toBeTruthy();
    });
  });

  it('should show error state on API error', async () => {
    (getPraise as any).mockRejectedValue(new Error('API Error'));

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar/i)).toBeTruthy();
    });
  });

  it('should show not found state when praise is null', async () => {
    (getPraise as any).mockResolvedValue(null);

    await act(async () => {
      renderWithRouter('non-existent-id');
    });

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

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

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

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

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

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      const ColetaneaTag = screen.queryByText('Coletânea');
      expect(ColetaneaTag).toBeNull();
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

    await act(async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    });

    await waitFor(() => {
      // Título da secção e nome do material repetem "Acordes"
      expect(screen.getAllByText('Acordes').length).toBeGreaterThanOrEqual(2);
      expect(
        document.querySelector('.material-grid a.material-link[href$="mat3.chord"]')
      ).toBeTruthy();
    });
  });
});
