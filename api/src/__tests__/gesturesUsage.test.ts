import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { GestureDocument } from '../gestures/schema';
import { contarUsos, substituirGesto } from '../gestures/usage';

const exemplo = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'gestures', '__fixtures__', 'valido-exemplo.json'), 'utf8')
) as GestureDocument;

describe('contarUsos', () => {
  it('conta gestos em qualquer profundidade', () => {
    const usos = contarUsos(exemplo);
    // 5 no coro + 1 no repeat + 2 no link dentro do repeat + 1 no final = 9 ids distintos
    expect(usos.size).toBe(9);
    expect(usos.get('c687580e7682')).toBe(1);
    expect(usos.get('deadbeef0004')).toBe(1);
  });

  it('soma repetições do mesmo id', () => {
    const doc: GestureDocument = {
      schema: 'coldigom.gestures/1',
      title: 'x',
      dictionaryVersion: 0,
      items: [
        { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] },
        {
          type: 'coro',
          children: [{ type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'b', text: '' }] }],
        },
      ],
    };
    expect(contarUsos(doc).get('000000000001')).toBe(2);
  });

  it('ignora instruções e texto livre', () => {
    const doc: GestureDocument = {
      schema: 'coldigom.gestures/1',
      title: 'x',
      dictionaryVersion: 0,
      items: [
        { type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] },
        { type: 'text', text: 'livre' },
        { type: 'instruction', kind: 'instruments' },
      ],
    };
    expect([...contarUsos(doc).keys()]).toEqual(['000000000001']);
  });
});

describe('substituirGesto', () => {
  it('troca o id em qualquer profundidade e devolve documento novo', () => {
    const { doc, trocados } = substituirGesto(exemplo, 'deadbeef0004', 'ffffffffffff');
    expect(trocados).toBe(1);
    expect(doc).not.toBe(exemplo);
    expect(contarUsos(doc).get('ffffffffffff')).toBe(1);
    expect(contarUsos(doc).has('deadbeef0004')).toBe(false);
    // o original não foi tocado
    expect(contarUsos(exemplo).has('deadbeef0004')).toBe(true);
  });

  it('sem ocorrência: zero trocados e o mesmo conteúdo', () => {
    const { doc, trocados } = substituirGesto(exemplo, 'nao-existe-00', 'ffffffffffff');
    expect(trocados).toBe(0);
    expect(doc).toEqual(exemplo);
  });
});
