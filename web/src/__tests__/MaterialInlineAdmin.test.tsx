import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MaterialInlineAdmin } from '../components/MaterialInlineAdmin';
import type { Material, PraiseDetail } from '../types';

describe('MaterialInlineAdmin', () => {
  const mockMaterial: Material = {
    id: 'mat-1',
    praise_id: 'praise-1',
    material_kind: 'kind-partitura',
    material_kind_name: 'Partitura',
    type: 'pdf',
    r2_key: 'assets/p1.pdf',
    file_path_legacy: '',
    source_material_id: null,
    url: null,
    merged_from_praise_id: 'praise-orig',
    merged_from_praise_name: 'Louvor Antigo',
  };

  const options = [
    { value: 'kind-partitura', label: 'Partitura' },
    { value: 'kind-audio', label: 'Áudio' },
  ];

  it('renderiza checkbox de seleção quando onToggleSelect é fornecido', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();

    render(
      <MaterialInlineAdmin
        material={mockMaterial}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={vi.fn()}
        selected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Selecionar Partitura/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith(true);
  });

  it('renderiza badge de mesclado quando merged_from_praise_id existe', () => {
    render(
      <MaterialInlineAdmin
        material={mockMaterial}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Mesclado: Louvor Antigo')).toBeInTheDocument();
  });

  it('aciona onDelete ao clicar em Remover', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <MaterialInlineAdmin
        material={mockMaterial}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={onDelete}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(onDelete).toHaveBeenCalledWith('mat-1');
  });

  it('abre o form de mover e permite cancelar ou confirmar', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn().mockResolvedValue(undefined);
    const mockDestino: PraiseDetail = {
      id: 'praise-destino',
      name: 'Louvor Destino',
      number: '999',
      author: '',
      rhythm: '',
      tonality: '',
      lyrics: '',
      group_id: null,
      tag_ids: '',
      tag_names: '',
      tags: [],
      materials: [],
    };
    const buscarLouvor = vi.fn().mockResolvedValue(mockDestino);

    render(
      <MaterialInlineAdmin
        material={mockMaterial}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onDelete={vi.fn()}
        onMove={onMove}
        buscarLouvor={buscarLouvor}
      />
    );

    const moverBtn = screen.getByRole('button', { name: 'Mover' });
    await user.click(moverBtn);

    // MoverMaterialForm está aberto
    const input = screen.getByLabelText('ID do louvor de destino');
    expect(input).toBeInTheDocument();

    // Cancelar fecha o form
    const cancelarBtn = screen.getByRole('button', { name: 'Cancelar' });
    await user.click(cancelarBtn);
    expect(screen.queryByLabelText('ID do louvor de destino')).not.toBeInTheDocument();

    // Reabrir e confirmar
    await user.click(screen.getByRole('button', { name: 'Mover' }));
    const input2 = screen.getByLabelText('ID do louvor de destino');
    await user.type(input2, 'praise-destino');
    expect(await screen.findByText('999 — Louvor Destino')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar mover' }));
    expect(onMove).toHaveBeenCalledWith('mat-1', mockDestino);
  });
});
