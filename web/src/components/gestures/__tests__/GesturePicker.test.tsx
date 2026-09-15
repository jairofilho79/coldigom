import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { indexar } from '../../../lib/gestures/dictionary';
import * as api from '../../../services/api';
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

  describe('Novo gesto', () => {
    const criado = {
      id: 'dddddddddddd', name: 'Amor', description: '', exampleTriggers: [], image: 'd.png', gif: null,
      status: 'active' as const, replacedBy: null, updatedAt: 't',
    };
    afterEach(() => vi.restoreAllMocks());

    it('troca a lista pelo formulário com a busca como nome; criar avisa e escolhe o novo', async () => {
      const user = userEvent.setup();
      vi.spyOn(api, 'createGesture').mockResolvedValue(criado);
      const onEscolher = vi.fn();
      const onCriado = vi.fn();
      render(<GesturePicker indice={indice} aberto onEscolher={onEscolher} onFechar={() => {}} onCriado={onCriado} />);
      await user.type(screen.getByRole('searchbox'), 'amo');
      expect(screen.getByText('Nenhum gesto encontrado.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Novo gesto' }));
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('amo');
      await user.upload(screen.getByLabelText('Figura PNG'), new File(['x'], 'a.png', { type: 'image/png' }));
      await user.click(screen.getByRole('button', { name: 'Criar gesto' }));
      await waitFor(() => expect(onCriado).toHaveBeenCalledWith(criado));
      expect(onEscolher).toHaveBeenCalledWith('dddddddddddd');
    });

    it('"Cancelar" volta para a busca; o botão aparece mesmo com resultados', async () => {
      const user = userEvent.setup();
      render(<GesturePicker indice={indice} aberto onEscolher={() => {}} onFechar={() => {}} onCriado={() => {}} />);
      expect(screen.getByRole('button', { name: /Viver/ })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Novo gesto' }));
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Viver/ })).toBeInTheDocument();
    });

    it('sem onCriado não oferece criar; reabrir volta para a busca', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<GesturePicker indice={indice} aberto onEscolher={() => {}} onFechar={() => {}} />);
      expect(screen.queryByRole('button', { name: 'Novo gesto' })).toBeNull();
      rerender(<GesturePicker indice={indice} aberto onEscolher={() => {}} onFechar={() => {}} onCriado={() => {}} />);
      await user.click(screen.getByRole('button', { name: 'Novo gesto' }));
      rerender(<GesturePicker indice={indice} aberto={false} onEscolher={() => {}} onFechar={() => {}} onCriado={() => {}} />);
      rerender(<GesturePicker indice={indice} aberto onEscolher={() => {}} onFechar={() => {}} onCriado={() => {}} />);
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });
  });
});
