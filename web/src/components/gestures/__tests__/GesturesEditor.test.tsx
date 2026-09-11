import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GestureDocument, Item } from '../../../lib/gestures/schema';
import { itemEm, type Caminho } from '../../../lib/gestures/flatten';
import type { Indice } from '../../../lib/gestures/dictionary';
import type { Resultado } from '../../../lib/gestures/edit';
import { GesturesEditor } from '../GesturesEditor';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

/** A página real guarda doc e foco em estado e aplica cada Resultado; o harness faz o mesmo. */
function Harness({ inicial, focoInicial, onMudar, indice = null, erroNoCaminho }: {
  inicial: GestureDocument; focoInicial: Caminho | null; onMudar: (r: Resultado) => void; indice?: Indice | null; erroNoCaminho?: string | null;
}) {
  const [doc, setDoc] = useState(inicial);
  const [foco, setFoco] = useState<Caminho | null>(focoInicial);
  return (
    <GesturesEditor
      doc={doc}
      indice={indice}
      foco={foco}
      onFoco={setFoco}
      onMudar={(r) => { onMudar(r); setDoc(r.doc); setFoco(r.foco); }}
      erroNoCaminho={erroNoCaminho}
    />
  );
}

function montar(foco: Caminho | null = null, extras: { indice?: Indice | null; erroNoCaminho?: string | null } = {}) {
  const onMudar = vi.fn<(r: Resultado) => void>();
  const utils = render(<Harness inicial={exemplo} focoInicial={foco} onMudar={onMudar} {...extras} />);
  const cartao = (chave: string) => utils.container.querySelector(`[data-cartao="${chave}"]`) as HTMLElement;
  const ultimo = () => onMudar.mock.calls.at(-1)![0];
  return { ...utils, onMudar, cartao, ultimo };
}

describe('GesturesEditor — seleção e envolver', () => {
  it('três cartões vizinhos em "Repetir 2x" viram um repeat de count 2', async () => {
    const user = userEvent.setup();
    const { onMudar, cartao } = montar();
    await user.click(cartao('items[0].children[0]'));
    await user.keyboard('{Shift>}');
    await user.click(cartao('items[0].children[2]'));
    await user.keyboard('{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Repetir 2x' }));

    expect(onMudar).toHaveBeenCalledTimes(1);
    const { doc, foco } = onMudar.mock.calls[0][0];
    const bloco = itemEm(doc, [0, 0]) as { type: string; count: number; children: Item[] };
    expect(bloco).toMatchObject({ type: 'repeat', count: 2 });
    expect(bloco.children).toHaveLength(3);
    expect((itemEm(doc, [0]) as { children: Item[] }).children).toHaveLength(3);
    expect(foco).toEqual([0, 0]);
    // o cartão novo aparece na lista, em foco
    expect(cartao('items[0].children[0]')).toHaveClass('is-foco');
    expect(cartao('items[0].children[0]')).toHaveClass('ge-cartao--repeat');
  });

  it('o número de vezes vem do campo ao lado do botão', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar([0, 0]);
    const vezes = screen.getByRole('spinbutton', { name: 'Vezes' });
    await user.tripleClick(vezes);
    await user.keyboard('3');
    await user.click(screen.getByRole('button', { name: 'Repetir 3x' }));
    expect(itemEm(ultimo().doc, [0, 0])).toMatchObject({ type: 'repeat', count: 3 });
  });

  it('Link desabilitado com motivo quando só há um selecionado', () => {
    montar([0, 0]);
    const link = screen.getByRole('button', { name: 'Link' });
    expect(link).toBeDisabled();
    expect(link).toHaveAttribute('title', 'Um link liga 2 ou 3 cartões.');
  });

  it('Desagrupar no coro sobe os filhos', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar([0]);
    await user.click(screen.getByRole('button', { name: 'Desagrupar' }));
    expect(ultimo().doc.items.slice(0, 5).every((i) => i.type === 'gesture')).toBe(true);
  });
});

describe('GesturesEditor — edição do cartão', () => {
  it('editar o gatilho chama onMudar com a linha nova', async () => {
    const user = userEvent.setup();
    const { ultimo, cartao } = montar([0, 0]);
    const gatilho = within(cartao('items[0].children[0]')).getAllByRole('textbox', { name: 'Gatilho' })[0];
    await user.type(gatilho, '!');
    expect(itemEm(ultimo().doc, [0, 0])).toMatchObject({ lyrics: [{ trigger: 'Quero!' }] });
  });

  it('+ linha, repetições, instrução e texto', async () => {
    const user = userEvent.setup();
    const { ultimo, cartao } = montar([0, 0]);
    await user.click(within(cartao('items[0].children[0]')).getByRole('button', { name: '+ linha' }));
    expect((itemEm(ultimo().doc, [0, 0]) as { lyrics: unknown[] }).lyrics).toHaveLength(2);

    const rep = within(cartao('items[1]')).getByRole('spinbutton', { name: 'Repetições' });
    await user.tripleClick(rep);
    await user.keyboard('4');
    expect(itemEm(ultimo().doc, [1])).toMatchObject({ count: 4 });

    await user.selectOptions(within(cartao('items[4]')).getByRole('combobox', { name: 'Instrução' }), 'instruments');
    expect(itemEm(ultimo().doc, [4])).toMatchObject({ kind: 'instruments' });

    await user.type(within(cartao('items[2]')).getByRole('textbox', { name: 'Texto' }), 'x');
    expect(itemEm(ultimo().doc, [2])).toMatchObject({ text: '(pausa para os instrumentos)x' });
  });

  it('Mover para baixo e Remover usam o foco', async () => {
    const user = userEvent.setup();
    const { onMudar } = montar([0, 0]);
    await user.click(screen.getByRole('button', { name: 'Mover para baixo' }));
    expect(onMudar.mock.calls[0][0].foco).toEqual([0, 1]);
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect((itemEm(onMudar.mock.calls[1][0].doc, [0]) as { children: unknown[] }).children).toHaveLength(4);
  });

  it('Adicionar gesto abre o seletor e insere depois do foco', async () => {
    const user = userEvent.setup();
    const indice: Indice = {
      version: 1, porId: new Map(),
      ativos: [{ id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: [], image: 'a.png', gif: null, status: 'active', replacedBy: null, updatedAt: 't' }],
    };
    const { ultimo } = montar([0, 1], { indice });
    await user.click(screen.getByRole('button', { name: 'Adicionar gesto' }));
    await user.click(screen.getByRole('button', { name: /Quero/ }));
    expect(ultimo().foco).toEqual([0, 2]);
    expect(itemEm(ultimo().doc, [0, 2])).toMatchObject({ gestureId: 'aaaaaaaaaaaa' });
  });

  it('o cartão do erro do servidor fica marcado', () => {
    const { cartao } = montar(null, { erroNoCaminho: 'items[1].children[1].children[0]' });
    expect(cartao('items[1].children[1].children[0]')).toHaveClass('is-erro');
    expect(cartao('items[0]')).not.toHaveClass('is-erro');
  });
});
