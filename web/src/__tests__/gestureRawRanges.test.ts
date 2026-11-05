import { describe, expect, it } from 'vitest';
import { encontrarLimitesDosItens, itemNoOffset, itensNoIntervalo } from '../lib/gestures/rawRanges';

describe('intervalos no JSON de gestos', () => {
  it('ignora documentos incompletos antes do array de itens', () => {
    for (const raw of ['{}', '{"items" ', '{"items": null}', '{"items":']) {
      expect(encontrarLimitesDosItens(raw)).toEqual([]);
    }
  });

  it('seleciona o filho mais específico ou os itens de nível superior', () => {
    const raw = JSON.stringify({
      items: [
        { type: 'coro', children: [{ type: 'text', text: 'filho' }] },
        { type: 'text', text: 'outro' },
      ],
    }, null, 2);
    const ranges = encontrarLimitesDosItens(raw);
    const filho = raw.indexOf('filho');
    const outro = raw.indexOf('outro');
    expect(itemNoOffset(ranges, filho)).toEqual([0, 0]);
    expect(itensNoIntervalo(ranges, filho, filho)).toEqual([[0, 0]]);
    expect(itensNoIntervalo(ranges, filho, outro)).toEqual([[0], [1]]);
    expect(itemNoOffset(ranges, 0)).toBeNull();
    expect(itensNoIntervalo(ranges, 0, 0)).toEqual([]);
    expect(itensNoIntervalo(ranges, 0, 1)).toEqual([]);
  });

  it('tolera valores não objeto e children que não é um array durante a edição', () => {
    const raw = '{"items": [null, {"type":"text","children":null}, 5, {"type":"text"}]}';
    const ranges = encontrarLimitesDosItens(raw);
    expect(ranges.map((range) => range.caminho)).toEqual([[0], [1]]);
  });
});
