import { describe, expect, it } from 'vitest';

import { MAX_SALTOS, adicionarAoIndice, buscar, indexar, normalizar, resolver, type GestureDictionary, type GestureEntry } from '../dictionary';

const entrada = (id: string, extra: Partial<GestureEntry> = {}): GestureEntry => ({
  id, name: id, description: '', exampleTriggers: [], image: `assets/cia/gestures/${id}.png`, gif: null,
  status: 'active', replacedBy: null, updatedAt: 't', ...extra,
});

const dic: GestureDictionary = {
  schema: 'coldigom.gesture-dictionary/1',
  version: 4,
  generatedAt: 't',
  gestures: [
    entrada('aaaaaaaaaaaa', { name: 'Quero', exampleTriggers: ['Quero', 'Desejo'] }),
    entrada('bbbbbbbbbbbb', { name: 'Viver', exampleTriggers: ['viver', 'vida'] }),
    entrada('cccccccccccc', { name: 'Coração', exampleTriggers: ['coração'] }),
    entrada('111111111111', { name: 'Velho', status: 'deprecated', replacedBy: 'aaaaaaaaaaaa' }),
    entrada('222222222222', { name: 'Mais velho', status: 'deprecated', replacedBy: '111111111111' }),
    entrada('333333333333', { name: 'Ciclo A', status: 'deprecated', replacedBy: '444444444444' }),
    entrada('444444444444', { name: 'Ciclo B', status: 'deprecated', replacedBy: '333333333333' }),
    entrada('999999999999', { name: 'Solto', status: 'deprecated', replacedBy: 'nao-existe-0' }),
  ],
};

describe('indexar', () => {
  it('guarda a versão, o mapa por id e só os ativos na lista', () => {
    const i = indexar(dic);
    expect(i.version).toBe(4);
    expect(i.porId.size).toBe(8);
    expect(i.ativos.map((g) => g.name)).toEqual(['Coração', 'Quero', 'Viver']);
  });
});

describe('resolver', () => {
  const i = indexar(dic);

  it('ativo resolve para ele mesmo', () => {
    expect(resolver(i, 'aaaaaaaaaaaa')).toEqual({ ok: true, entrada: i.porId.get('aaaaaaaaaaaa'), idFinal: 'aaaaaaaaaaaa', viaAlias: false });
  });

  it('segue a cadeia de replacedBy até o ativo', () => {
    const r = resolver(i, '222222222222');
    expect(r).toMatchObject({ ok: true, idFinal: 'aaaaaaaaaaaa', viaAlias: true });
  });

  it('ausente, ciclo e alvo inexistente falham com motivo', () => {
    expect(resolver(i, 'nao-existe-0')).toEqual({ ok: false, motivo: 'ausente', idFinal: 'nao-existe-0' });
    expect(resolver(i, '333333333333')).toMatchObject({ ok: false, motivo: 'ciclo' });
    expect(resolver(i, '999999999999')).toEqual({ ok: false, motivo: 'ausente', idFinal: 'nao-existe-0' });
  });

  it('estoura em 5 saltos', () => {
    const longa: GestureDictionary = { ...dic, gestures: [entrada('ffffffffffff')] };
    for (let n = 0; n <= MAX_SALTOS; n++) {
      const id = `${n}`.repeat(12);
      const proximo = n === MAX_SALTOS ? 'ffffffffffff' : `${n + 1}`.repeat(12);
      longa.gestures.push(entrada(id, { status: 'deprecated', replacedBy: proximo }));
    }
    // 0→1→2→3→4→5→f: 6 saltos
    expect(resolver(indexar(longa), '000000000000')).toMatchObject({ ok: false, motivo: 'estouro' });
    // 1→2→3→4→5→f: 5 saltos, no limite
    expect(resolver(indexar(longa), '111111111111')).toMatchObject({ ok: true, idFinal: 'ffffffffffff' });
  });
});

describe('buscar', () => {
  const i = indexar(dic);

  it('ignora acento e caixa, casa por prefixo de palavra no nome e nos exemplos', () => {
    expect(normalizar('  Coração ')).toBe('coracao');
    expect(buscar(i, 'cora').map((g) => g.name)).toEqual(['Coração']);
    expect(buscar(i, 'VID').map((g) => g.name)).toEqual(['Viver']);
    expect(buscar(i, 'desej').map((g) => g.name)).toEqual(['Quero']);
  });

  it('não devolve depreciados, e termo vazio lista por nome até o limite', () => {
    expect(buscar(i, 'velho')).toEqual([]);
    expect(buscar(i, '', 2).map((g) => g.name)).toEqual(['Coração', 'Quero']);
  });
});

describe('adicionarAoIndice', () => {
  const i = indexar(dic);
  const novo = entrada('dddddddddddd', { name: 'Amor', exampleTriggers: ['amor'] });

  it('devolve um índice novo com a entrada no mapa e entre os ativos, em ordem de nome', () => {
    const j = adicionarAoIndice(i, novo);
    expect(j).not.toBe(i);
    expect(i.porId.has('dddddddddddd')).toBe(false);
    expect(j.porId.get('dddddddddddd')).toBe(novo);
    expect(j.ativos.map((g) => g.name)).toEqual(['Amor', 'Coração', 'Quero', 'Viver']);
    expect(buscar(j, 'am')).toEqual([novo]);
  });

  it('avança a versão: o servidor incrementou ao criar', () => {
    expect(adicionarAoIndice(i, novo).version).toBe(5);
  });

  it('substitui uma entrada de mesmo id em vez de duplicar', () => {
    const j = adicionarAoIndice(i, entrada('aaaaaaaaaaaa', { name: 'Quero (novo)' }));
    expect(j.ativos.filter((g) => g.id === 'aaaaaaaaaaaa')).toHaveLength(1);
    expect(j.porId.get('aaaaaaaaaaaa')?.name).toBe('Quero (novo)');
  });
});
