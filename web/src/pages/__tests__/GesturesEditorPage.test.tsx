import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GesturesEditorPage } from '../GesturesEditorPage';
import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
import type { PraiseDetail } from '../../types';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const EXEMPLO = readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8');

const praise = {
  id: 'p1', name: 'Quero viver pra sempre com Jesus', number: '182', author: '', rhythm: '', tonality: '', category: '', lyrics: '',
  group_id: null, tag_ids: null, tag_names: null, tags: [], group_members: [],
  materials: [
    { id: 'g1', praise_id: 'p1', material_kind: 'k1', material_kind_name: 'Gestos', type: 'gestures', r2_key: 'assets/praises/p1/g1.gestures', file_path_legacy: '', source_material_id: 'pdf1', is_reviewed: false },
    { id: 'pdf1', praise_id: 'p1', material_kind: 'k2', material_kind_name: 'Gestos PDF', type: 'pdf', r2_key: 'assets/praises/p1/pdf1.pdf', file_path_legacy: '', source_material_id: null },
  ],
} as unknown as PraiseDetail;

const dicionario = {
  schema: 'coldigom.gesture-dictionary/1' as const, version: 3, generatedAt: 't',
  gestures: [{ id: 'c687580e7682', name: 'Quero', description: '', exampleTriggers: ['Quero'], image: 'assets/cia/gestures/c687580e7682.png', gif: null, status: 'active' as const, replacedBy: null, updatedAt: 't' }],
};

function montar({ asset = EXEMPLO, status = 200, etag = '"v1"', autenticado = true }: { asset?: string; status?: number; etag?: string; autenticado?: boolean } = {}) {
  vi.spyOn(api, 'getMe').mockResolvedValue(autenticado ? ({ sub: 'u1', name: 'Revisor' } as never) : null);
  vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
  vi.spyOn(api, 'getGestureDictionary').mockResolvedValue(dicionario);
  vi.stubGlobal('fetch', vi.fn(() => new Response(status === 200 ? asset : '', { status, headers: status === 200 ? { ETag: etag } : {} })));
  const put = vi.spyOn(api, 'putGesturesContent');
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/praise/p1/gestos/g1']}>
        <Routes>
          <Route path="/praise/:praiseId/gestos/:materialId" element={<GesturesEditorPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
  return { put };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GesturesEditorPage', () => {
  it('abre o exemplo da spec: CORO com chave tracejada sobre 5 cartões, gatilhos vermelhos, duas instruções', async () => {
    montar();
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    const coro = document.querySelector('.gv-coro')!;
    expect(coro.querySelectorAll(':scope > .gv-filhos > .gv-gesto')).toHaveLength(5);
    expect(coro.querySelector('.gv-chave--tracejada')).not.toBeNull();
    expect(document.querySelectorAll('.gv-papel .gv-gatilho').length).toBeGreaterThan(5);
    expect(document.querySelectorAll('.gv-papel .gv-instrucao')).toHaveLength(2);
    // editor à esquerda com os mesmos cartões
    expect(document.querySelectorAll('[data-cartao]').length).toBe(16);
    expect(screen.getByRole('link', { name: 'Abrir PDF de gestos' })).toHaveAttribute('target', '_blank');
  });

  it('asset 404 é documento novo: título padrão, editor vazio, Salvar desabilitado', async () => {
    montar({ status: 404 });
    await waitFor(() => expect(screen.getByText(/Documento vazio/)).toBeInTheDocument());
    // o cabeçalho da página e o papel da pré-visualização mostram o mesmo título
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toContain('182 - QUERO VIVER PRA SEMPRE COM JESUS');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('salva com o ETag do GET e mostra "Salvo."', async () => {
    const user = userEvent.setup();
    const { put } = montar({ etag: '"v7"' });
    put.mockResolvedValue({ etag: '"v8"' });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Salvo.')).toBeInTheDocument());
    expect(put).toHaveBeenCalledTimes(1);
    const [id, doc, etag] = put.mock.calls[0];
    expect(id).toBe('g1');
    expect(etag).toBe('"v7"');
    expect(doc.dictionaryVersion).toBe(3);
    expect(JSON.stringify(doc)).toContain('Quero!');
    // a segunda gravação usa o ETag novo
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '?');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1][2]).toBe('"v8"');
  });

  it('Ctrl+S salva; Ctrl+Z desfaz e Ctrl+Shift+Z refaz', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockResolvedValue({ etag: '"v2"' });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    const gatilho = () => within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0];
    await user.type(gatilho(), '!');
    expect(gatilho()).toHaveValue('Quero!');
    await user.keyboard('{Control>}z{/Control}');
    expect(gatilho()).toHaveValue('Quero');
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(gatilho()).toHaveValue('Quero!');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  });

  it('409 vira cartão de conflito com Recarregar e o JSON para copiar; o rascunho fica na tela', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockRejectedValue(new api.ConflitoDeGravacao());
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText(/alterado por outra pessoa/)).toBeInTheDocument());
    expect((screen.getByRole('textbox', { name: 'Seu documento' }) as HTMLTextAreaElement).value).toContain('Quero!');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    // o editor continua com o texto digitado
    expect(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0]).toHaveValue('Quero!');
  });

  it('400 com path marca o cartão e mostra a frase do servidor', async () => {
    const user = userEvent.setup();
    const { put } = montar();
    put.mockRejectedValue(new api.DocumentoRecusado('Tipo de item desconhecido neste ponto do documento.', 'tipo_desconhecido', 'items[1].children[1].children[0]'));
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    await user.type(within(document.querySelector('[data-cartao="items[0].children[0]"]') as HTMLElement).getAllByRole('textbox', { name: 'Gatilho' })[0], '!');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Tipo de item desconhecido neste ponto do documento.')).toBeInTheDocument());
    expect(document.querySelector('[data-cartao="items[1].children[1].children[0]"]')).toHaveClass('is-erro');
  });

  it('rascunho inválido não vai à rede: remove o último gesto do mínimo e Salvar explica', async () => {
    const user = userEvent.setup();
    const { put } = montar({ asset: readFileSync(resolve(FIXTURES, 'valido-minimo.json'), 'utf8') });
    await waitFor(() => expect(document.querySelector('[data-cartao="items[0]"]')).not.toBeNull());
    await user.click(document.querySelector('[data-cartao="items[0]"]') as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByText(/ao menos um item/)).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('documento inválido no servidor mostra código e caminho em vez de abrir o editor', async () => {
    montar({ asset: JSON.stringify({ schema: 'coldigom.gestures/1', title: 'x', dictionaryVersion: 0, items: [{ type: 'x' }] }) });
    await waitFor(() => expect(screen.getByText(/tipo_desconhecido/)).toBeInTheDocument());
    expect(screen.getByText(/items\[0\]/)).toBeInTheDocument();
    expect(document.querySelector('[data-cartao]')).toBeNull();
  });

  it('sem sessão o switch de revisão vira selo e o editor fica só leitura', async () => {
    montar({ autenticado: false });
    await waitFor(() => expect(document.querySelector('.gv-coro')).not.toBeNull());
    expect(screen.getByText(/não revisada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
  });
});
