import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MaterialInlineAdmin } from '../MaterialInlineAdmin';
import type { Material, PraiseDetail } from '../../types';

const material: Material = {
  id: 'mat-1',
  praise_id: 'praise-1',
  material_kind: 'kind-1',
  material_kind_name: 'Partitura',
  type: 'pdf',
  r2_key: 'assets/x.pdf',
  file_path_legacy: '',
  source_material_id: null,
  merged_from_praise_id: null,
  url: null,
};

const destino = {
  id: 'praise-2',
  name: 'Grande é o Senhor',
  number: '123',
  tags: [],
  materials: [],
  group_members: [],
} as unknown as PraiseDetail;

const options = [{ value: 'kind-1', label: 'Partitura' }];

describe('MaterialInlineAdmin — mover material', () => {
  it('Mover abre o formulário e Confirmar entrega material e destino', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn(async () => {});
    render(
      <MaterialInlineAdmin
        material={material}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={vi.fn()}
        onMove={onMove}
        buscarLouvor={vi.fn(async () => destino)}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Mover' }));
    await user.type(screen.getByLabelText('ID do louvor de destino'), 'praise-2');
    await screen.findByText('123 — Grande é o Senhor');
    await user.click(screen.getByRole('button', { name: 'Confirmar mover' }));

    expect(onMove).toHaveBeenCalledWith('mat-1', destino);
  });

  it('sem onMove não há botão Mover', () => {
    render(
      <MaterialInlineAdmin
        material={material}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });
});
