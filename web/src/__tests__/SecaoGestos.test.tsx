import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SecaoGestos } from '../components/gestures/SecaoGestos';
import type { Material, MaterialKind, PraiseDetail } from '../types';

vi.mock('../services/api', () => ({
  createMaterial: vi.fn(),
}));

import { createMaterial } from '../services/api';

describe('SecaoGestos', () => {
  const mockCategorias: MaterialKind[] = [
    { id: 'cat-1', name: 'Gestos Kids' },
    { id: 'cat-2', name: 'Gestos Geral' },
  ];

  const mockMateriais: Material[] = [
    {
      id: 'gesto-1',
      praise_id: 'praise-1',
      material_kind: 'cat-1',
      material_kind_name: 'Gestos Kids',
      type: 'gestures',
      r2_key: null,
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
    {
      id: 'pdf-1',
      praise_id: 'praise-1',
      material_kind: 'cat-pdf',
      material_kind_name: 'Partitura PDF',
      type: 'pdf',
      r2_key: 'assets/doc.pdf',
      file_path_legacy: '',
      source_material_id: null,
      url: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não renderiza nada quando não há gestos e podeEditar é false', () => {
    const { container } = render(
      <SecaoGestos
        praiseId="praise-1"
        materiais={[]}
        categorias={mockCategorias}
        podeEditar={false}
        onAtualizar={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza lista de gestos com checkbox e botão remover quando podeEditar e onToggleSelect fornecidos', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SecaoGestos
          praiseId="praise-1"
          materiais={mockMateriais}
          categorias={mockCategorias}
          podeEditar={true}
          onAtualizar={vi.fn()}
          selectedIds={new Set(['gesto-1'])}
          onToggleSelect={onToggleSelect}
          onDeleteMaterial={onDelete}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Gestos CIAs')).toBeInTheDocument();
    expect(screen.getByText('Gestos Kids')).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /Selecionar Gestos Kids/i });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith('gesto-1', false);

    const removerBtn = screen.getByRole('button', { name: 'Remover' });
    await user.click(removerBtn);
    expect(onDelete).toHaveBeenCalledWith('gesto-1');
  });

  it('permite criar novo documento de gestos ou cancelar', async () => {
    const user = userEvent.setup();
    const onAtualizar = vi.fn();
    const praiseAtualizado: PraiseDetail = {
      id: 'praise-1',
      name: 'Louvor 1',
      number: '1',
      author: '',
      rhythm: '',
      tonality: '',
      lyrics: '',
      group_id: null,
      tag_ids: '',
      tag_names: '',
      tags: [],
      materials: mockMateriais,
    };
    (createMaterial as ReturnType<typeof vi.fn>).mockResolvedValue(praiseAtualizado);

    render(
      <MemoryRouter>
        <SecaoGestos
          praiseId="praise-1"
          materiais={mockMateriais}
          categorias={mockCategorias}
          podeEditar={true}
          onAtualizar={onAtualizar}
        />
      </MemoryRouter>
    );

    const abrirBtn = screen.getByRole('button', { name: 'Novo documento de gestos' });
    await user.click(abrirBtn);

    expect(screen.getByLabelText('Categoria')).toBeInTheDocument();
    expect(screen.getByLabelText('PDF de origem')).toBeInTheDocument();

    // Testar cancelar
    const cancelarBtn = screen.getByRole('button', { name: 'Cancelar' });
    await user.click(cancelarBtn);
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();

    // Reabrir, alterar campos e criar
    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.selectOptions(screen.getByLabelText('Categoria'), 'cat-2');
    await user.selectOptions(screen.getByLabelText('PDF de origem'), 'pdf-1');

    await user.click(screen.getByRole('button', { name: 'Criar' }));
    expect(createMaterial).toHaveBeenCalledWith('praise-1', {
      material_kind: 'cat-2',
      type: 'gestures',
      source_material_id: 'pdf-1',
    });
    expect(onAtualizar).toHaveBeenCalledWith(praiseAtualizado);
  });

  it('exibe erro caso a criação do documento de gestos falhe', async () => {
    const user = userEvent.setup();
    (createMaterial as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Erro ao criar'));

    render(
      <MemoryRouter>
        <SecaoGestos
          praiseId="praise-1"
          materiais={mockMateriais}
          categorias={mockCategorias}
          podeEditar={true}
          onAtualizar={vi.fn()}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Novo documento de gestos' }));
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Erro ao criar');
  });
});
