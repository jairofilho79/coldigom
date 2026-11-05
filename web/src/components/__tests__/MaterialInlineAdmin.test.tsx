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

describe('MaterialInlineAdmin — edição de notes', () => {
  it('renderiza o input de notes com o valor inicial e placeholder correto', () => {
    render(
      <MaterialInlineAdmin
        material={{ ...material, notes: 'Cifrado' }}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onUpdateNotes={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Nota/Voz, ex: I, II, Cifrado');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Cifrado');
  });

  it('ao alterar o texto e desfocar (blur), chama onUpdateNotes com o valor trimado', async () => {
    const user = userEvent.setup();
    const onUpdateNotes = vi.fn().mockResolvedValue(undefined);

    render(
      <MaterialInlineAdmin
        material={{ ...material, notes: 'I' }}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onUpdateNotes={onUpdateNotes}
        onDelete={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Nota/Voz, ex: I, II, Cifrado');
    await user.clear(input);
    await user.type(input, '  II  ');
    await user.tab();

    expect(onUpdateNotes).toHaveBeenCalledWith('mat-1', 'II');
  });

  it('ao limpar o texto e desfocar (blur), chama onUpdateNotes com null', async () => {
    const user = userEvent.setup();
    const onUpdateNotes = vi.fn().mockResolvedValue(undefined);

    render(
      <MaterialInlineAdmin
        material={{ ...material, notes: 'Cifrado' }}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onUpdateNotes={onUpdateNotes}
        onDelete={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Nota/Voz, ex: I, II, Cifrado');
    await user.clear(input);
    await user.tab();

    expect(onUpdateNotes).toHaveBeenCalledWith('mat-1', null);
  });

  it('ao teclar Enter, confirma a edição e chama onUpdateNotes', async () => {
    const user = userEvent.setup();
    const onUpdateNotes = vi.fn().mockResolvedValue(undefined);

    render(
      <MaterialInlineAdmin
        material={{ ...material, notes: null }}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onUpdateNotes={onUpdateNotes}
        onDelete={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Nota/Voz, ex: I, II, Cifrado');
    await user.type(input, 'Arranjo Novo{Enter}');

    expect(onUpdateNotes).toHaveBeenCalledWith('mat-1', 'Arranjo Novo');
  });

  it('ao teclar Escape, restaura o valor original sem chamar onUpdateNotes', async () => {
    const user = userEvent.setup();
    const onUpdateNotes = vi.fn();

    render(
      <MaterialInlineAdmin
        material={{ ...material, notes: 'Original' }}
        options={options}
        saving={false}
        onUpdateKind={vi.fn()}
        onUpdateNotes={onUpdateNotes}
        onDelete={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('Nota/Voz, ex: I, II, Cifrado');
    await user.clear(input);
    await user.type(input, 'Modificado{Escape}');

    expect(input).toHaveValue('Original');
    expect(onUpdateNotes).not.toHaveBeenCalled();
  });
});
