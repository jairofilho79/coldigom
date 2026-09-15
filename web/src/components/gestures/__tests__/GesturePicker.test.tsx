import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { indexar } from '../../../lib/gestures/dictionary';
import { GesturePicker } from '../GesturePicker';

const indice = indexar({
  schema: 'coldigom.gesture-dictionary/1', version: 1, generatedAt: 't',
  gestures: [
    { id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'a.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: ['viver'], image: 'b.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' },
  ],
});

describe('GesturePicker', () => {
  it('filtra pela busca e escolhe ao clicar', async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    render(<GesturePicker indice={indice} aberto onEscolher={onEscolher} onFechar={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'viv');
    expect(screen.queryByRole('button', { name: /Quero/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Viver/ }));
    expect(onEscolher).toHaveBeenCalledWith('bbbbbbbbbbbb');
  });

  it('Enter escolhe o primeiro resultado; Escape fecha', async () => {
    const user = userEvent.setup();
    const onEscolher = vi.fn();
    const onFechar = vi.fn();
    render(<GesturePicker indice={indice} aberto onEscolher={onEscolher} onFechar={onFechar} />);
    await user.type(screen.getByRole('searchbox'), 'que{Enter}');
    expect(onEscolher).toHaveBeenCalledWith('aaaaaaaaaaaa');
    await user.keyboard('{Escape}');
    expect(onFechar).toHaveBeenCalled();
  });

  it('fechado não renderiza nada; sem dicionário avisa', () => {
    const { container, rerender } = render(<GesturePicker indice={indice} aberto={false} onEscolher={() => {}} onFechar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<GesturePicker indice={null} aberto onEscolher={() => {}} onFechar={() => {}} />);
    expect(screen.getByText(/dicionário não carregou/i)).toBeInTheDocument();
  });
});
