import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../schema';
import { achatar, caminhoDaChave, chaveDoCaminho, irmaosContiguos, itemEm, ordenar, pai } from '../flatten';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const exemplo = JSON.parse(readFileSync(resolve(FIXTURES, 'valido-exemplo.json'), 'utf8')) as GestureDocument;

describe('achatar', () => {
  it('lista em pré-ordem, com o bloco antes dos filhos', () => {
    const cartoes = achatar(exemplo);
    expect(cartoes.map((c) => c.item.type)).toEqual([
      'coro', 'gesture', 'gesture', 'gesture', 'gesture', 'gesture',
      'repeat', 'gesture', 'link', 'gesture', 'gesture',
      'text', 'final', 'gesture', 'instruction', 'instruction',
    ]);
  });

  it('cada cartão carrega caminho, profundidade e blocos abertos', () => {
    const cartoes = achatar(exemplo);
    const dentroDoLink = cartoes[9];
    expect(dentroDoLink.caminho).toEqual([1, 1, 0]);
    expect(dentroDoLink.profundidade).toBe(2);
    expect(dentroDoLink.blocosAbertos.map((b) => b.type)).toEqual(['repeat', 'link']);
    expect(cartoes[0].profundidade).toBe(0);
    expect(cartoes[0].blocosAbertos).toEqual([]);
  });

  it('achatar → caminho → itemEm é identidade', () => {
    for (const c of achatar(exemplo)) expect(itemEm(exemplo, c.caminho)).toBe(c.item);
  });
});

describe('caminhos', () => {
  it('chaveDoCaminho usa o formato do path da API, e caminhoDaChave é o inverso', () => {
    expect(chaveDoCaminho([0])).toBe('items[0]');
    expect(chaveDoCaminho([1, 1, 0])).toBe('items[1].children[1].children[0]');
    expect(caminhoDaChave('items[1].children[1].children[0]')).toEqual([1, 1, 0]);
    expect(caminhoDaChave('items[0].lyrics[2].trigger')).toEqual([0]);
    expect(caminhoDaChave('')).toBeNull();
    expect(caminhoDaChave('schema')).toBeNull();
  });

  it('pai da raiz é null', () => {
    expect(pai([3])).toBeNull();
    expect(pai([1, 1, 0])).toEqual([1, 1]);
  });

  it('itemEm devolve undefined para caminho inexistente', () => {
    expect(itemEm(exemplo, [99])).toBeUndefined();
    expect(itemEm(exemplo, [2, 0])).toBeUndefined(); // items[2] é text, não tem filhos
  });
});

describe('irmaosContiguos', () => {
  it('aceita irmãos consecutivos em qualquer ordem', () => {
    expect(irmaosContiguos([[0, 2], [0, 0], [0, 1]])).toBe(true);
    expect(irmaosContiguos([[3]])).toBe(true);
  });

  it('recusa pais diferentes, buracos e lista vazia', () => {
    expect(irmaosContiguos([[0, 0], [1, 0]])).toBe(false);
    expect(irmaosContiguos([[0, 0], [0, 2]])).toBe(false);
    expect(irmaosContiguos([[0], [0, 0]])).toBe(false);
    expect(irmaosContiguos([])).toBe(false);
  });

  it('ordenar põe na ordem do documento', () => {
    expect(ordenar([[1, 1], [0], [1, 0], [1]])).toEqual([[0], [1], [1, 0], [1, 1]]);
  });
});
