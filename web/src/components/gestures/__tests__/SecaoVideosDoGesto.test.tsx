import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GestureEntry, GestureVideo } from '../../../lib/gestures/dictionary';
import * as api from '../../../services/api';
import type { Praise, PraiseDetail } from '../../../types';
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

describe('SecaoVideosDoGesto — adicionar vídeo', () => {
  const louvores = [
    { id: 'p3', name: 'Três', number: '3' },
    { id: 'p1', name: 'Nove', number: '9' },
  ] as unknown as Praise[];
  const detalheComYoutube = {
    id: 'p3', name: 'Três', number: '3', materials: [
      { id: 'pdf3', type: 'pdf', material_kind_name: 'Partitura', url: null },
      { id: 'y3', type: 'youtube', material_kind_name: 'Vídeo CIAs', url: 'https://youtu.be/ccccccccccc' },
    ],
  } as unknown as PraiseDetail;

  it('busca o louvor, mostra só os materiais youtube e liga com seconds vazio', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'searchPraises').mockResolvedValue({ data: louvores, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } as never);
    vi.spyOn(api, 'getPraise').mockResolvedValue(detalheComYoutube);
    const put = vi.spyOn(api, 'putGestureVideo').mockResolvedValue(entrada);
    const { onAlterado } = montar();
    await user.click(screen.getByRole('button', { name: 'Adicionar vídeo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar louvor' }), 'tr');
    await user.click(await screen.findByRole('button', { name: '3 - Três' }));
    expect(screen.queryByText('Partitura')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Vídeo CIAs' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y3', []));
    expect(onAlterado).toHaveBeenCalledWith(entrada);
    expect(screen.getByRole('status')).toHaveTextContent('Vídeo ligado.');
    expect(screen.queryByRole('searchbox', { name: 'Buscar louvor' })).toBeNull();
  });

  it('louvor sem youtube avisa; material já ligado aparece desabilitado', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'searchPraises').mockResolvedValue({ data: louvores, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } as never);
    vi.spyOn(api, 'getPraise')
      .mockResolvedValueOnce({ id: 'p3', name: 'Três', number: '3', materials: [{ id: 'pdf3', type: 'pdf', url: null }] } as unknown as PraiseDetail)
      .mockResolvedValueOnce({ id: 'p1', name: 'Nove', number: '9', materials: [{ id: 'y1', type: 'youtube', material_kind_name: 'Vídeo', url: 'https://youtu.be/aaaaaaaaaaa' }] } as unknown as PraiseDetail);
    montar();
    await user.click(screen.getByRole('button', { name: 'Adicionar vídeo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar louvor' }), 'x');
    await user.click(await screen.findByRole('button', { name: '3 - Três' }));
    expect(await screen.findByText('Este louvor não tem vídeo do YouTube.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '9 - Nove' }));
    const jaLigado = await screen.findByRole('button', { name: /Vídeo.*já ligado/ });
    expect(jaLigado).toBeDisabled();
  });

  it('sem sessão não há "Adicionar vídeo"', () => {
    montar(false);
    expect(screen.queryByRole('button', { name: 'Adicionar vídeo' })).toBeNull();
  });
});
