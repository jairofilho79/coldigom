import { describe, expect, it } from 'vitest';
import { encontrarLimitesDosItens, itemNoOffset, itensNoIntervalo } from '../rawRanges';

describe('rawRanges', () => {
  const json = JSON.stringify(
    {
      schema: 'coldigom.gestures/1',
      title: '50 - DO ALTO CÉU',
      dictionaryVersion: 0,
      items: [
        { type: 'gesture', gestureId: 'e473b25ea89b', lyrics: [{ trigger: 'Do alto', text: 'céu' }] },
        {
          type: 'repeat',
          count: 2,
          children: [
            { type: 'gesture', gestureId: 'e114cea04d3c', lyrics: [{ trigger: 'Do mundo', text: 'mau' }] },
            { type: 'gesture', gestureId: 'c687580e7682', lyrics: [{ trigger: 'Fiz a escolha', text: 'da salvação' }] },
          ],
        },
        { type: 'instruction', kind: 'instruments' },
      ],
    },
    null,
    2
  );

  it('encontra os limites de todos os itens e filhos', () => {
    const ranges = encontrarLimitesDosItens(json);
    expect(ranges).toHaveLength(5);
    const caminhos = ranges.map((r) => r.caminho);
    expect(caminhos).toEqual([[0], [1, 0], [1, 1], [1], [2]]);
  });

  it('determina o item correto pelo offset', () => {
    const ranges = encontrarLimitesDosItens(json);
    const r0 = ranges.find((r) => JSON.stringify(r.caminho) === '[0]')!;
    expect(itemNoOffset(ranges, r0.start + 5)).toEqual([0]);

    const r10 = ranges.find((r) => JSON.stringify(r.caminho) === '[1,0]')!;
    expect(itemNoOffset(ranges, r10.start + 5)).toEqual([1, 0]);

    // Offset antes de items
    expect(itemNoOffset(ranges, 0)).toBeNull();
  });

  it('determina os itens envolvidos na seleção por faixa', () => {
    const ranges = encontrarLimitesDosItens(json);
    const r0 = ranges.find((r) => JSON.stringify(r.caminho) === '[0]')!;
    const r1 = ranges.find((r) => JSON.stringify(r.caminho) === '[1]')!;

    const sel = itensNoIntervalo(ranges, r0.start + 2, r1.end - 2);
    expect(sel).toEqual([[0], [1]]);
  });
});
