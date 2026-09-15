import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../../services/api';
import { NovoGestoForm } from '../NovoGestoForm';

const criado = {
  id: 'dddddddddddd', name: 'Amor', description: 'd', exampleTriggers: ['amor', 'amar'],
  image: 'assets/cia/gestures/dddddddddddd.png', gif: null, videos: [], status: 'active' as const, replacedBy: null, updatedAt: 't',
};
const png = new File(['png'], 'amor.png', { type: 'image/png' });

afterEach(() => vi.restoreAllMocks());

describe('NovoGestoForm', () => {
  it('só habilita "Criar gesto" com nome e figura; manda os campos e avisa quem criou', async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(api, 'createGesture').mockResolvedValue(criado);
    const onCriado = vi.fn();
    render(<NovoGestoForm onCriado={onCriado} />);
    const botao = screen.getByRole('button', { name: 'Criar gesto' });
    expect(botao).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), ' Amor ');
    expect(botao).toBeDisabled();
    await user.upload(screen.getByLabelText('Figura PNG'), png);
    expect(botao).toBeEnabled();
    await user.type(screen.getByRole('textbox', { name: 'Descrição' }), 'd');
    await user.type(screen.getByRole('textbox', { name: 'Gatilhos de exemplo' }), 'amor, amar, ');
    await user.click(botao);
    await waitFor(() => expect(onCriado).toHaveBeenCalledWith(criado));
    expect(create).toHaveBeenCalledWith({ name: 'Amor', description: 'd', exampleTriggers: ['amor', 'amar'], image: png });
  });

  it('começa com o nome inicial e limpa os campos depois de criar', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createGesture').mockResolvedValue(criado);
    render(<NovoGestoForm nomeInicial="Amor" onCriado={() => {}} />);
    const nome = screen.getByRole('textbox', { name: 'Nome' });
    expect(nome).toHaveValue('Amor');
    await user.upload(screen.getByLabelText('Figura PNG'), png);
    await user.click(screen.getByRole('button', { name: 'Criar gesto' }));
    await waitFor(() => expect(nome).toHaveValue(''));
  });

  it('mostra o erro da API e mantém o que foi digitado', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'createGesture').mockRejectedValue(new Error('Gesture already exists'));
    const onCriado = vi.fn();
    render(<NovoGestoForm onCriado={onCriado} />);
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Amor');
    await user.upload(screen.getByLabelText('Figura PNG'), png);
    await user.click(screen.getByRole('button', { name: 'Criar gesto' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Gesture already exists');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Amor');
    expect(onCriado).not.toHaveBeenCalled();
  });

  it('"Cancelar" só aparece quando há quem ouvir', async () => {
    const user = userEvent.setup();
    const onCancelar = vi.fn();
    const { rerender } = render(<NovoGestoForm onCriado={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    rerender(<NovoGestoForm onCriado={() => {}} onCancelar={onCancelar} />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancelar).toHaveBeenCalled();
  });
});
