import { describe, expect, it } from 'vitest';
import { fuzzyAcceptable, levenshtein, similarityRatio } from '../lib/materialKindInference/levenshtein';
import { buildCandidates, extractZipLabel, findKindUuidsInText } from '../lib/materialKindInference/normalize';
import { folderNameFromFiles } from '../lib/materialKindInference/scanFolder';

describe('limites da identificação de materiais', () => {
  it('calcula distâncias para textos iguais, vazios e diferentes', () => {
    expect(levenshtein('cifra', 'cifra')).toBe(0);
    expect(levenshtein('', 'voz')).toBe(3);
    expect(levenshtein('voz', '')).toBe(3);
    expect(levenshtein('soprano', 'sopreno')).toBe(1);
    expect(similarityRatio('', '')).toBe(1);
  });

  it('limita erros aceitos para nomes curtos e longos', () => {
    expect(fuzzyAcceptable('voz', 'vos')).toBe(true);
    expect(fuzzyAcceptable('voz', 'abc')).toBe(false);
    expect(fuzzyAcceptable('clarinetes', 'clarinete')).toBe(true);
    expect(fuzzyAcceptable('clarinetes', 'trompetes')).toBe(false);
  });

  it('ignora candidatos vazios e rótulo vazio em arquivo exportado', () => {
    expect(buildCandidates('', '')).toEqual([]);
    expect(extractZipLabel('-12345678-1234-1234-1234-123456789abc.pdf')).toBeNull();
    expect(findKindUuidsInText('sem identificador', new Set())).toBeNull();
    expect(findKindUuidsInText('12345678-1234-1234-1234-123456789abc', new Set())).toBeNull();
  });

  it('não inventa pasta quando a seleção está vazia ou não tem caminho relativo', () => {
    expect(folderNameFromFiles([])).toBeNull();
    expect(folderNameFromFiles([new File([''], 'partitura.pdf')])).toBeNull();
  });
});
