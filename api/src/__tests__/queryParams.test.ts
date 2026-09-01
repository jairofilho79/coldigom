import { describe, expect, it } from 'vitest';

import { MAX_PAGE_SIZE, clampPageSize, parseIntParam } from '../queryParams';

describe('parseIntParam', () => {
  it('devolve o padrão quando o parâmetro não veio', () => {
    expect(parseIntParam(undefined, { fallback: 1 })).toEqual({ ok: true, value: 1 });
    expect(parseIntParam('', { fallback: 7 })).toEqual({ ok: true, value: 7 });
  });

  it('aceita inteiro válido', () => {
    expect(parseIntParam('42', { fallback: 1 })).toEqual({ ok: true, value: 42 });
  });

  it('recusa o que não é inteiro em vez de virar NaN', () => {
    // parseInt('abc') dava NaN, que seguia até o SQL: LIMIT NaN quebrava a
    // paginação e numberMin NaN virava "CAST(...) >= NULL", que nunca é
    // verdade — zero resultados com HTTP 200 e nenhuma explicação.
    for (const bruto of ['abc', 'xyz', '1.5.2', '--3', 'NaN', 'Infinity']) {
      expect(parseIntParam(bruto, { fallback: 1 }).ok).toBe(false);
    }
  });

  it('recusa número com sufixo, que o parseInt aceitaria calado', () => {
    // parseInt('12abc') devolve 12. Aceitar isso é aceitar entrada corrompida.
    expect(parseIntParam('12abc', { fallback: 1 }).ok).toBe(false);
  });

  it('respeita o mínimo quando pedido', () => {
    expect(parseIntParam('0', { fallback: 1, min: 1 }).ok).toBe(false);
    expect(parseIntParam('-5', { fallback: 1, min: 1 }).ok).toBe(false);
    expect(parseIntParam('1', { fallback: 1, min: 1 })).toEqual({ ok: true, value: 1 });
  });

  it('aceita negativo quando não há mínimo', () => {
    expect(parseIntParam('-5', { fallback: 0 })).toEqual({ ok: true, value: -5 });
  });
});

describe('clampPageSize', () => {
  it('limita o tamanho de página ao teto', () => {
    // ?limit=999999 passava direto e devolvia o acervo inteiro numa resposta.
    expect(clampPageSize(999999)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE);
  });

  it('deixa passar o que está dentro do teto', () => {
    expect(clampPageSize(20)).toBe(20);
    expect(clampPageSize(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });
});
