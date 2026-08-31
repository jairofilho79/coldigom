import { describe, expect, it } from 'vitest';

import { buildWhereClause, escapeLikePattern } from '../praiseQuery';

describe('escapeLikePattern', () => {
  it('neutraliza os curingas do LIKE', () => {
    // '%' e '_' são curingas no SQLite. Sem escapar, buscar "%" virava
    // LIKE '%%%', que casa com tudo — e com ?limit alto era um dump do acervo.
    expect(escapeLikePattern('%')).toBe('\\%');
    expect(escapeLikePattern('_')).toBe('\\_');
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('escapa a própria barra invertida', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('deixa texto comum intacto', () => {
    expect(escapeLikePattern('Graça')).toBe('Graça');
  });
});

describe('buildWhereClause — busca', () => {
  it('declara ESCAPE em todo LIKE de busca', () => {
    const { clause } = buildWhereClause({ search: 'graça' });
    const likes = (clause.match(/LIKE \?/g) ?? []).length;
    const escapes = (clause.match(/LIKE \? ESCAPE/g) ?? []).length;
    expect(likes).toBeGreaterThan(0);
    expect(escapes).toBe(likes);
  });

  it('busca por "%" não vira curinga', () => {
    const { bindings } = buildWhereClause({ search: '%' });
    expect(bindings.every((b) => b !== '%%%')).toBe(true);
    expect(bindings).toContain('%\\%%');
  });

  it('procura em nome e letra quando a busca só tem pontuação', () => {
    // buildFtsMatchQuery remove tudo que não é letra ou número, então "!!!"
    // produzia MATCH vazio e a consulta caía para "id LIKE ? OR number LIKE ?":
    // abandonava nome e letra em silêncio, e o usuário via zero resultados.
    const { clause } = buildWhereClause({ search: '!!!', useFts: true });
    expect(clause).toContain('p.name LIKE');
    expect(clause).toContain('p.lyrics LIKE');
  });

  it('usa o FTS quando a busca tem termo aproveitável', () => {
    const { clause } = buildWhereClause({ search: 'graça', useFts: true });
    expect(clause).toContain('praises_fts MATCH');
  });

  it('sem FTS, procura nos campos de texto', () => {
    const { clause } = buildWhereClause({ search: 'graça', useFts: false });
    expect(clause).toContain('p.name LIKE');
    expect(clause).toContain('p.lyrics LIKE');
    expect(clause).toContain('p.author LIKE');
  });
});
