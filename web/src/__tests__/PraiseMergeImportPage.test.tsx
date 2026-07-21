import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PraiseMergeImportPage } from '../pages/PraiseMergeImportPage';
import type { PraiseDetail } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    getMaterialKinds: vi.fn().mockResolvedValue([
      { id: 'kind1', name: 'Partitura' },
    ]),
    mergePraises: vi.fn(),
    deleteMaterial: vi.fn(),
    updateMaterial: vi.fn(),
  };
});

import { getPraise, mergePraises } from '../services/api';

const keeperId = '1b2b33ab-4dff-4014-8582-dcb9a92efbc8';
const sourceId = '1c12786e-4d32-4e95-a136-d85266008e11';

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
  materials: [],
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
  materials: [
    {
      id: 'mat-src',
      praise_id: sourceId,
      material_kind: 'kind1',
      material_kind_name: 'Partitura',
      type: 'pdf',
      r2_key: null,
      file_path_legacy: '',
      source_material_id: null,
    },
  ],
  group_members: [],
};

function renderMergeImport() {
  return render(
    <MemoryRouter initialEntries={[`/praise/${keeperId}/merge/${sourceId}`]}>
      <Routes>
        <Route path="/praise/:id/merge/:sourceId" element={<PraiseMergeImportPage />} />
        <Route path="/praise/:id" element={<div>Detalhe</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PraiseMergeImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPraise as ReturnType<typeof vi.fn>).mockImplementation(async (id: string) => {
      if (id === keeperId) return keeper;
      if (id === sourceId) return source;
      throw new Error('not found');
    });
    (mergePraises as ReturnType<typeof vi.fn>).mockResolvedValue({ ...keeper, author: 'Autor B' });
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('mostra conflito de metadados com duas opções', async () => {
    renderMergeImport();

    await waitFor(() => {
      expect(screen.getByText('Importar e mesclar')).toBeTruthy();
    });

    expect(screen.getAllByText('Manter (atual)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Usar (mesclado)').length).toBeGreaterThan(0);
    expect(screen.getByText('De: Grande Deus Dup')).toBeTruthy();
  });

  it('finalizar chama mergePraises', async () => {
    const user = userEvent.setup();
    renderMergeImport();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Finalizar mesclagem' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Finalizar mesclagem' }));

    await waitFor(() => {
      expect(mergePraises).toHaveBeenCalledWith(
        keeperId,
        expect.objectContaining({
          source_praise_id: sourceId,
          material_ids_to_import: ['mat-src'],
        })
      );
    });
  });
});
