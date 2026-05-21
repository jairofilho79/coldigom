import { describe, expect, it } from 'vitest';
import { compareMaterialKindLabels } from '../materialKindLabels';

describe('compareMaterialKindLabels', () => {
  it('sorts Áudio before Baixo (pt-BR, not Unicode tail)', () => {
    const labels = ['Baixo', 'Áudio', 'Violino', 'Zabumba'];
    const sorted = [...labels].sort(compareMaterialKindLabels);
    expect(sorted.indexOf('Áudio')).toBeLessThan(sorted.indexOf('Baixo'));
  });

  it('distinguishes Grade and Partitura lexicographically', () => {
    expect(compareMaterialKindLabels('Grade', 'Partitura')).toBeLessThan(0);
  });
});
