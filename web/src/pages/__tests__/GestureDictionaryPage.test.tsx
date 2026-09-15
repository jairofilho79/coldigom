import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import { GestureDictionaryPage } from '../GestureDictionaryPage';

const dic = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 2, generatedAt: 't',
  gestures: [
    { id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/aaaaaaaaaaaa.png', gif: null, videos: [], status: 'active' as const, replacedBy: null, updatedAt: 't' },
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: ['viver'], image: 'assets/cia/gestures/bbbbbbbbbbbb.png', gif: null, videos: [], status: 'active' as const, replacedBy: null, updatedAt: 't' },
    { id: '111111111111', name: 'Velho', description: '', exampleTriggers: [], image: 'assets/cia/gestures/111111111111.png', gif: null, videos: [], status: 'deprecated' as const, replacedBy: 'aaaaaaaaaaaa', updatedAt: 't' },
  ],
};

function montar(autenticado = false) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
  vi.spyOn(api, 'getGestureUsageCounts').mockResolvedValue([{ gesture_id: 'aaaaaaaaaaaa', materials: 12 }]);
  render(<AuthProvider><MemoryRouter><GestureDictionaryPage /></MemoryRouter></AuthProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe('GestureDictionaryPage', () => {
  it('lista os ativos com figura e contagem de uso; depreciados só com o filtro', async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() => expect(screen.getByRole('link', { name: /Quero/ })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Quero/ })).toHaveAttribute('href', '/gestos/dicionario/aaaaaaaaaaaa');
    expect(screen.getByText('usado em 12 materiais')).toBeInTheDocument();
    expect(screen.getByText('usado em 0 materiais')).toBeInTheDocument();
    expect(document.querySelectorAll('img')).toHaveLength(2);
    expect(screen.queryByText('Velho')).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /Mostrar substituídos/ }));
    expect(screen.getByText('Velho')).toBeInTheDocument();
  });

  it('a busca filtra sem acento', async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() => expect(screen.getByText('Viver')).toBeInTheDocument());
    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'VIV');
    expect(screen.queryByText('Quero')).toBeNull();
    expect(screen.getByText('Viver')).toBeInTheDocument();
  });

  it('com sessão cria um gesto novo e recarrega', async () => {
    const user = userEvent.setup();
    montar(true);
    const criar = vi.spyOn(api, 'createGesture').mockResolvedValue(dic.gestures[0]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar gesto' })).toBeInTheDocument());
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Novo');
    await user.type(screen.getByRole('textbox', { name: 'Gatilhos de exemplo' }), 'a, b');
    const png = new File(['x'], 'g.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Figura PNG'), png);
    await user.click(screen.getByRole('button', { name: 'Criar gesto' }));
    await waitFor(() => expect(criar).toHaveBeenCalledWith({ name: 'Novo', description: '', exampleTriggers: ['a', 'b'], image: png }));
    expect(api.getGestureDictionary).toHaveBeenCalledTimes(2);
  });

  it('sem sessão não há formulário', async () => {
    montar(false);
    await waitFor(() => expect(screen.getByText('Viver')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Criar gesto' })).toBeNull();
  });

  it('quando a contagem de uso falha, avisa e não finge que é zero', async () => {
    vi.spyOn(api, 'getMe').mockResolvedValue(null);
    vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
    vi.spyOn(api, 'getGestureUsageCounts').mockRejectedValue(new Error('falhou'));
    render(<AuthProvider><MemoryRouter><GestureDictionaryPage /></MemoryRouter></AuthProvider>);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Quero' })).toBeInTheDocument());
    expect(screen.getByText('Contagem de uso indisponível — tente recarregar.')).toBeInTheDocument();
    expect(screen.queryByText(/usado em 0/)).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
