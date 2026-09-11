import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validarDocumento, type GestureDocument, type Item } from '../schema';
import { achatar, itemEm } from '../flatten';
import {
  adicionarLinha, definirInstrucao, definirRepeticoes, desagrupar, editarLinha, editarTexto, envolver,
  inserirApos, mover, novoGesto, podeDesagrupar, podeEnvolver, remover, removerLinha, trocarGesto, type Resultado,
} from '../edit';

const FIXTURES = resolve(__dirname, '..', '..', '..', '..', '..', 'api', 'src', 'gestures', '__fixtures__');
const ler = (n: string) => JSON.parse(readFileSync(resolve(FIXTURES, n), 'utf8')) as GestureDocument;
const exemplo = ler('valido-exemplo.json');
const minimo = ler('valido-minimo.json');
const valido = (doc: GestureDocument) => expect(validarDocumento(doc)).toMatchObject({ ok: true });

describe('envolver', () => {
  it('três cartões vizinhos viram { type: "repeat", count: 2, children: [...] }', () => {
    // o critério de aceite: os 3 primeiros gestos do coro em "Repetir 2x"
    const { doc, foco } = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'repeat', count: 2 });
    const bloco = itemEm(doc, [0, 0]);
    expect(bloco).toMatchObject({ type: 'repeat', count: 2 });
    expect((bloco as { children: Item[] }).children).toHaveLength(3);
    expect((bloco as { children: Item[] }).children[0]).toBe(exemplo.items[0] && (exemplo.items[0] as { children: Item[] }).children[0]);
    expect((itemEm(doc, [0]) as { children: Item[] }).children).toHaveLength(3); // 1 repeat + 2 gestos
    expect(foco).toEqual([0, 0]);
    expect(doc).not.toBe(exemplo);
    valido(doc);
  });

  it('aceita a seleção em qualquer ordem', () => {
    const { doc } = envolver(exemplo, [[0, 2], [0, 0], [0, 1]], { type: 'coro' });
    expect(itemEm(doc, [0, 0])).toMatchObject({ type: 'coro' });
    valido(doc);
  });

  it('recusa seleção que não é de irmãos contíguos', () => {
    expect(podeEnvolver(exemplo, [[0, 0], [0, 2]], { type: 'coro' })).toMatch(/vizinhos/);
    expect(podeEnvolver(exemplo, [[0, 0], [1, 0]], { type: 'coro' })).toMatch(/vizinhos/);
    expect(() => envolver(exemplo, [[0, 0], [0, 2]], { type: 'coro' })).toThrow(/vizinhos/);
  });

  it('recusa instrução, texto livre e FINAL dentro de bloco', () => {
    expect(podeEnvolver(exemplo, [[2]], { type: 'coro' })).toMatch(/não entram/);
    expect(podeEnvolver(exemplo, [[4]], { type: 'repeat', count: 2 })).toMatch(/não entram/);
    expect(podeEnvolver(exemplo, [[3]], { type: 'coro' })).toMatch(/não entram/);
  });

  it('FINAL só na raiz e só um', () => {
    expect(podeEnvolver(exemplo, [[0, 0]], { type: 'final' })).toMatch(/raiz/);
    expect(podeEnvolver(exemplo, [[1]], { type: 'final' })).toMatch(/Já existe/);
    const { doc } = envolver(minimo, [[0]], { type: 'final' });
    expect(doc.items[0]).toMatchObject({ type: 'final' });
    valido(doc);
  });

  it('link exige 2 ou 3 cartões, e repetir exige count >= 2', () => {
    expect(podeEnvolver(exemplo, [[0, 0]], { type: 'link' })).toMatch(/2 ou 3/);
    expect(podeEnvolver(exemplo, [[0, 0], [0, 1], [0, 2], [0, 3]], { type: 'link' })).toMatch(/2 ou 3/);
    expect(podeEnvolver(exemplo, [[0, 0], [0, 1]], { type: 'repeat', count: 1 })).toMatch(/mínimo 2/);
  });

  it('não deixa um link com menos de 2 itens ao envolver parte dele', () => {
    // items[1].children[1] é um link com 2 filhos; envolver um deles deixaria o link com 1
    expect(podeEnvolver(exemplo, [[1, 1, 0]], { type: 'coro' })).toBeNull(); // 2 - 1 + 1 = 2, ainda válido
    const tres = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'link' }).doc; // link de 3 no coro
    expect(podeEnvolver(tres, [[0, 0, 0], [0, 0, 1]], { type: 'coro' })).toBeNull(); // 3 - 2 + 1 = 2
    expect(podeEnvolver(tres, [[0, 0, 0], [0, 0, 1], [0, 0, 2]], { type: 'coro' })).toMatch(/link/); // 3 - 3 + 1 = 1
  });
});

describe('desagrupar', () => {
  it('os filhos sobem para o lugar do bloco', () => {
    const { doc, foco } = desagrupar(exemplo, [0]);
    expect(doc.items.slice(0, 5).every((i) => i.type === 'gesture')).toBe(true);
    expect(doc.items).toHaveLength(exemplo.items.length + 4);
    expect(foco).toEqual([0]);
    valido(doc);
  });

  it('recusa cartão que não é bloco e link que ficaria fora de 2..3', () => {
    expect(podeDesagrupar(exemplo, [0, 0])).toMatch(/blocos/);
    const doc = envolver(exemplo, [[1, 1, 0]], { type: 'coro' }).doc; // link: [coro(1), gesto]
    const depois = envolver(doc, [[1, 1, 0, 0]], { type: 'repeat', count: 2 }).doc; // coro: [repeat: [gesto]]
    // desagrupar o coro dentro do link deixaria o link com 2 (repeat, gesto): ok
    expect(podeDesagrupar(depois, [1, 1, 0])).toBeNull();
    // FINAL na raiz desagrupa normalmente
    expect(podeDesagrupar(exemplo, [3])).toBeNull();
    valido(desagrupar(exemplo, [3]).doc);
  });
});

describe('remover', () => {
  it('foca quem ocupa o índice, senão o anterior, senão o pai', () => {
    expect(remover(exemplo, [0, 0]).foco).toEqual([0, 0]);
    expect(remover(exemplo, [0, 4]).foco).toEqual([0, 3]);
    expect(remover(exemplo, [3, 0]).foco).toEqual([3]); // final esvaziou e sumiu; foco em quem ocupa o índice 3 agora
    valido(remover(exemplo, [3, 0]).doc);
  });

  it('esvaziar um bloco remove o bloco; deixar um link com 1 dissolve o link', () => {
    const semFinal = remover(exemplo, [3, 0]).doc;
    expect(semFinal.items.some((i) => i.type === 'final')).toBe(false);
    const semUmDoLink = remover(exemplo, [1, 1, 0]).doc;
    expect(itemEm(semUmDoLink, [1, 1])).toMatchObject({ type: 'gesture', gestureId: 'deadbeef0004' });
    valido(semUmDoLink);
  });

  it('remover o último gesto do documento é permitido (o editor barra o salvar)', () => {
    const { doc } = remover(minimo, [0]);
    expect(doc.items).toEqual([]);
  });
});

describe('inserirApos e mover', () => {
  it('insere depois do cartão, dentro do mesmo pai', () => {
    const { doc, foco } = inserirApos(exemplo, [0, 1], { ...novoGesto('aaaaaaaaaaaa'), lyrics: [{ trigger: 'x', text: '' }] });
    expect(itemEm(doc, [0, 2])).toMatchObject({ gestureId: 'aaaaaaaaaaaa' });
    expect(foco).toEqual([0, 2]);
    valido(doc);
  });

  it('null insere no fim da raiz; instrução vai para a raiz mesmo com foco aninhado', () => {
    expect(inserirApos(exemplo, null, { type: 'instruction', kind: 'instruments' }).foco).toEqual([6]);
    const { doc, foco } = inserirApos(exemplo, [0, 1], { type: 'text', text: 'x' });
    expect(foco).toEqual([1]);
    expect(doc.items[1]).toMatchObject({ type: 'text' });
    valido(doc);
  });

  it('gesto nunca cai depois do FINAL; link cheio recebe depois do link', () => {
    const { doc, foco } = inserirApos(exemplo, [4], { ...novoGesto('aaaaaaaaaaaa'), lyrics: [{ trigger: 'x', text: '' }] });
    expect(foco).toEqual([3]); // antes do final, que agora é items[4]
    expect(doc.items[4]).toMatchObject({ type: 'final' });
    valido(doc);
    const cheio = envolver(exemplo, [[0, 0], [0, 1], [0, 2]], { type: 'link' }).doc;
    const r = inserirApos(cheio, [0, 0, 2], { ...novoGesto('aaaaaaaaaaaa'), lyrics: [{ trigger: 'x', text: '' }] });
    expect(r.foco).toEqual([0, 1]);
    valido(r.doc);
  });

  it('mover troca com o irmão e não faz nada na borda', () => {
    const { doc, foco } = mover(exemplo, [0, 0], 1);
    expect(itemEm(doc, [0, 1])).toBe((exemplo.items[0] as { children: Item[] }).children[0]);
    expect(foco).toEqual([0, 1]);
    const borda = mover(exemplo, [0, 0], -1);
    expect(borda.doc).toBe(exemplo);
    expect(borda.foco).toEqual([0, 0]);
  });
});

describe('edição do cartão', () => {
  it('linhas: editar, adicionar até 3, remover até 1', () => {
    let doc = editarLinha(minimo, [0], 0, { trigger: 'Só' }).doc;
    expect(itemEm(doc, [0])).toMatchObject({ lyrics: [{ trigger: 'Só', text: 'só leitura' }] });
    doc = adicionarLinha(doc, [0]).doc;
    doc = adicionarLinha(doc, [0]).doc;
    doc = adicionarLinha(doc, [0]).doc; // 4ª não entra
    expect((itemEm(doc, [0]) as { lyrics: unknown[] }).lyrics).toHaveLength(3);
    doc = removerLinha(doc, [0], 2).doc;
    doc = removerLinha(doc, [0], 1).doc;
    doc = removerLinha(doc, [0], 0).doc; // a última não sai
    expect((itemEm(doc, [0]) as { lyrics: unknown[] }).lyrics).toHaveLength(1);
    valido(doc);
  });

  it('trocarGesto, definirRepeticoes (piso 2), editarTexto e definirInstrucao', () => {
    expect(itemEm(trocarGesto(exemplo, [0, 0], 'bbbbbbbbbbbb').doc, [0, 0])).toMatchObject({ gestureId: 'bbbbbbbbbbbb' });
    expect(itemEm(definirRepeticoes(exemplo, [1], 1).doc, [1])).toMatchObject({ count: 2 });
    expect(itemEm(definirRepeticoes(exemplo, [1], 4).doc, [1])).toMatchObject({ count: 4 });
    expect(itemEm(editarTexto(exemplo, [2], 'novo').doc, [2])).toMatchObject({ text: 'novo' });
    expect(itemEm(definirInstrucao(exemplo, [4], 'instruments').doc, [4])).toMatchObject({ kind: 'instruments' });
  });
});

describe('invariantes sobre o corpo de fixtures', () => {
  it('toda operação devolve documento novo e válido, e nunca muda o original', () => {
    for (const base of [exemplo, minimo]) {
      const congelado = JSON.stringify(base);
      const cartoes = achatar(base);
      for (const c of cartoes) {
        const ops: [string, () => Resultado | null][] = [
          ['remover', () => remover(base, c.caminho)],
          ['mover+1', () => mover(base, c.caminho, 1)],
          ['mover-1', () => mover(base, c.caminho, -1)],
          ['inserir gesto', () => inserirApos(base, c.caminho, { ...novoGesto('cccccccccccc'), lyrics: [{ trigger: 'x', text: '' }] })],
          ['inserir instrução', () => inserirApos(base, c.caminho, { type: 'instruction', kind: 'repeat_praise' })],
          ['envolver', () => (podeEnvolver(base, [c.caminho], { type: 'coro' }) ? null : envolver(base, [c.caminho], { type: 'coro' }))],
          ['desagrupar', () => (podeDesagrupar(base, c.caminho) ? null : desagrupar(base, c.caminho))],
        ];
        for (const [nome, op] of ops) {
          const r = op();
          if (!r) continue;
          // mover na borda é um no-op legítimo que devolve a mesma referência (ver describe 'inserirApos e mover').
          if (!nome.startsWith('mover')) expect(r.doc).not.toBe(base);
          // remover pode deixar o documento sem gesto (o editor barra o salvar); fora isso, válido
          const v = validarDocumento(r.doc);
          if (!v.ok) expect(v.erro.codigo).toMatch(/^(sem_gesto|itens_vazios)$/);
        }
      }
      expect(JSON.stringify(base)).toBe(congelado);
    }
  });
});
