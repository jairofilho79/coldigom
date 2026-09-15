import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GestureEntry, GestureVideo } from '../../../lib/gestures/dictionary';
import * as api from '../../../services/api';
import { SecaoVideosDoGesto } from '../SecaoVideosDoGesto';

const videos: GestureVideo[] = [
  { materialId: 'y1', praiseId: 'p1', praiseNumber: '9', praiseName: 'Nove', url: 'https://youtu.be/aaaaaaaaaaa', seconds: [] },
  { materialId: 'y2', praiseId: 'p2', praiseNumber: '10', praiseName: 'Dez', url: 'https://youtu.be/bbbbbbbbbbb', seconds: [83, 141] },
];
const entrada = {
  id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: [], image: 'a.png', gif: null,
  status: 'active', replacedBy: null, updatedAt: 't', videos,
} as GestureEntry;

function montar(podeEditar = true, lista = videos) {
  const onAlterado = vi.fn();
  render(<MemoryRouter><SecaoVideosDoGesto gestureId="aaaaaaaaaaaa" videos={lista} podeEditar={podeEditar} onAlterado={onAlterado} /></MemoryRouter>);
  return { onAlterado };
}

afterEach(() => vi.restoreAllMocks());

describe('SecaoVideosDoGesto — leitura', () => {
  it('lista os vídeos com link para o louvor, "Abrir no YouTube" no primeiro tempo e um chip por ocorrência', () => {
    montar(false);
    expect(screen.getByRole('link', { name: '9 - Nove' })).toHaveAttribute('href', '/praise/p1');
    const abrir = screen.getAllByRole('link', { name: 'Abrir no YouTube' });
    expect(abrir[0]).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    expect(abrir[1]).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=83s');
    expect(abrir[1]).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '1:23' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=83s');
    expect(screen.getByRole('link', { name: '2:21' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=141s');
    expect(screen.getByText('tempos não mapeados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar tempos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
  });

  it('sem vídeos avisa', () => {
    montar(false, []);
    expect(screen.getByText('Nenhum vídeo ligado a este gesto.')).toBeInTheDocument();
  });
});

describe('SecaoVideosDoGesto — edição', () => {
  it('o campo de tempos nasce com os tempos formatados; salvar manda os segundos e avisa a página', async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, 'putGestureVideo').mockResolvedValue(entrada);
    const { onAlterado } = montar();
    const campo = screen.getAllByRole('textbox', { name: 'Tempos' })[1];
    expect(campo).toHaveValue('1:23, 2:21');
    await user.clear(campo);
    await user.type(campo, '2:21, 10, 0:10');
    await user.click(screen.getAllByRole('button', { name: 'Salvar tempos' })[1]);
    await waitFor(() => expect(put).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y2', [10, 141]));
    expect(onAlterado).toHaveBeenCalledWith(entrada);
    expect(screen.getByRole('status')).toHaveTextContent('Tempos salvos.');
  });

  it('tempo inválido mostra o motivo e não chama a API', async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, 'putGestureVideo');
    montar();
    const campo = screen.getAllByRole('textbox', { name: 'Tempos' })[0];
    await user.type(campo, 'abc');
    await user.click(screen.getAllByRole('button', { name: 'Salvar tempos' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Tempo inválido: "abc"');
    expect(put).not.toHaveBeenCalled();
  });

  it('Desligar chama a API e avisa a página; erro da API aparece', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'deleteGestureVideo').mockResolvedValueOnce({ ...entrada, videos: [videos[1]] }).mockRejectedValueOnce(new Error('Video is not linked to this gesture'));
    const { onAlterado } = montar();
    await user.click(screen.getAllByRole('button', { name: 'Desligar' })[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y1'));
    expect(onAlterado).toHaveBeenCalledWith({ ...entrada, videos: [videos[1]] });
    await user.click(screen.getAllByRole('button', { name: 'Desligar' })[1]);
    expect(await screen.findByRole('status')).toHaveTextContent('Video is not linked to this gesture');
  });
});
