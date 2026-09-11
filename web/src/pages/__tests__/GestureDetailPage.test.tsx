import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import { GestureDetailPage } from '../GestureDetailPage';

const base = {
  id: 'aaaaaaaaaaaa', name: 'Quero', description: 'Mãos ao peito', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/aaaaaaaaaaaa.png', gif: null,
  status: 'active' as const, replacedBy: null, updatedAt: 't',
};
const entrada = {
  ...base,
  usages: [{ material_id: 'g1', praise_id: 'p1', praise_name: 'Quero viver', praise_number: '182', count: 2 }],
};
const dic = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 2, generatedAt: 't',
  gestures: [
    base,
    { id: 'bbbbbbbbbbbb', name: 'Viver', description: '', exampleTriggers: [], image: 'b.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' },
  ],
};

function montar(autenticado = true, dados = entrada) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getGesture').mockResolvedValue(dados);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/gestos/dicionario/aaaaaaaaaaaa']}>
        <Routes><Route path="/gestos/dicionario/:id" element={<GestureDetailPage />} /></Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('GestureDetailPage', () => {
  it('mostra a entrada, a figura e onde é usada, com link para o editor', async () => {
    montar(false);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Quero' })).toBeInTheDocument());
    expect(document.querySelector('img')?.getAttribute('src')).toContain('aaaaaaaaaaaa.png');
    // F5: a imagem carrega uma versão na query — sem isso o navegador continua
    // mostrando a figura velha depois de "Trocar figura"/"Enviar GIF", porque a
    // chave (o nome do arquivo) não muda.
    expect(document.querySelector('img')?.getAttribute('src')).toContain('?v=');
    expect(screen.getByRole('link', { name: /182/ })).toHaveAttribute('href', '/praise/p1/gestos/g1');
    expect(screen.getAllByText(/2 vez/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
  });

  it('com sessão salva as alterações dos campos', async () => {
    const user = userEvent.setup();
    montar();
    const atualizar = vi.spyOn(api, 'updateGesture').mockResolvedValue({ ...entrada, name: 'Quero!' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument());
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), '!');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(atualizar).toHaveBeenCalledWith('aaaaaaaaaaaa', { name: 'Quero!', description: 'Mãos ao peito', exampleTriggers: ['Quero'] }));
  });

  it('substituir por outro gesto chama replaceGesture e mostra o resultado', async () => {
    const user = userEvent.setup();
    montar();
    const substituir = vi.spyOn(api, 'replaceGesture').mockResolvedValue({ ok: true, reescritos: 1, falhas: [{ materialId: 'g9', motivo: 'objeto não existe no R2' }] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Gesto substituto' })).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gesto substituto' }), 'bbbbbbbbbbbb');
    await user.click(screen.getByRole('checkbox', { name: /Reescrever os documentos agora/ }));
    await user.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(substituir).toHaveBeenCalledWith('aaaaaaaaaaaa', 'bbbbbbbbbbbb', true));
    expect(await screen.findByText(/1 documento\(s\) reescrito\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/g9/)).toBeInTheDocument();
    expect(api.getGesture).toHaveBeenCalledTimes(2);
  });

  it('o resultado da substituição sobrevive ao reload que torna o gesto depreciado', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getMe').mockResolvedValue({ sub: 'u1', name: 'Revisor' } as never);
    vi.spyOn(api, 'getGesture')
      .mockResolvedValueOnce(entrada)
      .mockResolvedValue({ ...entrada, status: 'deprecated', replacedBy: 'bbbbbbbbbbbb' });
    vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dic);
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/gestos/dicionario/aaaaaaaaaaaa']}>
          <Routes><Route path="/gestos/dicionario/:id" element={<GestureDetailPage />} /></Routes>
        </MemoryRouter>
      </AuthProvider>
    );
    const substituir = vi.spyOn(api, 'replaceGesture').mockResolvedValue({ ok: true, reescritos: 1, falhas: [] });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Gesto substituto' })).toBeInTheDocument());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Gesto substituto' }), 'bbbbbbbbbbbb');
    await user.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(substituir).toHaveBeenCalledWith('aaaaaaaaaaaa', 'bbbbbbbbbbbb', false));
    expect(await screen.findByText(/1 documento\(s\) reescrito\(s\)/)).toBeInTheDocument();
    expect(await screen.findByText(/Substituído por/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Substituir' })).toBeNull();
  });

  it('com sessão troca a figura via o input acessível', async () => {
    const user = userEvent.setup();
    montar();
    const trocar = vi.spyOn(api, 'uploadGestureImage').mockResolvedValue(entrada);
    await waitFor(() => expect(screen.getByLabelText('Trocar figura')).toBeInTheDocument());
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Trocar figura'), png);
    await waitFor(() => expect(trocar).toHaveBeenCalledWith('aaaaaaaaaaaa', png));
  });

  it('gesto depreciado mostra o substituto e não oferece substituir de novo', async () => {
    montar(true, { ...entrada, status: 'deprecated', replacedBy: 'bbbbbbbbbbbb' });
    await waitFor(() => expect(screen.getByText(/Substituído por/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Viver/ })).toHaveAttribute('href', '/gestos/dicionario/bbbbbbbbbbbb');
    expect(screen.queryByRole('button', { name: 'Substituir' })).toBeNull();
  });
});
