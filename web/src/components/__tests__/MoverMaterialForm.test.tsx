import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MoverMaterialForm } from '../MoverMaterialForm';
import type { PraiseDetail } from '../../types';

const destino: PraiseDetail = {
  id: 'praise-2',
  name: 'Grande é o Senhor',
  number: '123',
  author: '',
  rhythm: '',
  tonality: '',
  category: '',
  lyrics: '',
  group_id: null,
  tag_ids: null,
  tag_names: null,
  tags: [
    { id: 't1', name: 'Adoração', parent_id: null },
    { id: 't2', name: 'Infantil', parent_id: 'tp', parent_name: 'Público' },
  ],
  materials: [],
  group_members: [],
};

function montar(overrides: Partial<Parameters<typeof MoverMaterialForm>[0]> = {}) {
  const buscarLouvor = vi.fn(async (id: string) => {
    if (id === 'praise-2') return destino;
    throw new Error('Praise not found');
  });
  const onConfirm = vi.fn(async () => {});
  const onCancel = vi.fn();
  render(
    <MoverMaterialForm
      praiseAtualId="praise-1"
      buscarLouvor={buscarLouvor}
      onConfirm={onConfirm}
      onCancel={onCancel}
      busy={false}
      {...overrides}
    />
  );
  return { buscarLouvor, onConfirm, onCancel };
}

describe('MoverMaterialForm', () => {
  it('ao colar um ID válido mostra número, nome e tags do louvor de destino', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('ID do louvor de destino'), 'praise-2');

    expect(await screen.findByText('123 — Grande é o Senhor')).toBeInTheDocument();
    expect(screen.getByText('Adoração')).toBeInTheDocument();
    expect(screen.getByText('Público › Infantil')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar mover' })).toBeEnabled();
  });

  it('ID inexistente avisa e deixa Confirmar desabilitado', async () => {
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('ID do louvor de destino'), 'nao-existe');

    expect(await screen.findByText('Louvor não encontrado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar mover' })).toBeDisabled();
  });

  it('ID do louvor atual avisa sem consultar a API', async () => {
    const user = userEvent.setup();
    const { buscarLouvor } = montar();

    await user.type(screen.getByLabelText('ID do louvor de destino'), 'praise-1');

    expect(await screen.findByText('É o louvor atual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar mover' })).toBeDisabled();
    await waitFor(() => expect(buscarLouvor).not.toHaveBeenCalled());
  });

  it('Confirmar entrega o louvor de destino encontrado', async () => {
    const user = userEvent.setup();
    const { onConfirm } = montar();

    await user.type(screen.getByLabelText('ID do louvor de destino'), ' praise-2 ');
    await screen.findByText('123 — Grande é o Senhor');
    await user.click(screen.getByRole('button', { name: 'Confirmar mover' }));

    expect(onConfirm).toHaveBeenCalledWith(destino);
  });

  it('Cancelar chama onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = montar();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
