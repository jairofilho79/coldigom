import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VALID_SORT_FIELDS, type SortField } from '../types';

export interface FilterState {
  query: string;
  tags: string[];
  rhythm: string[];
  tonality: string[];
  category: string[];
  materialKinds: string[];
  numberMin?: number;
  numberMax?: number;
  sort: SortField;
  order: 'asc' | 'desc';
  page: number;
}

/**
 * Leitores puros da query string.
 *
 * Ficam fora do hook de propósito. Declarados no corpo do componente, eram
 * recriados a cada render e o React Compiler recusava otimizar o hook inteiro
 * ("Compilation Skipped"), porque a dependência inferida (`getParam`) não batia
 * com a declarada (`searchParams`). Como funções de módulo, a única dependência
 * do useMemo é o próprio searchParams — que é o que sempre foi verdade.
 */
function lerTexto(params: URLSearchParams, chave: string): string {
  return params.get(chave) ?? '';
}

function lerLista(params: URLSearchParams, chave: string): string[] {
  const bruto = params.get(chave);
  return bruto ? bruto.split(',').filter(Boolean) : [];
}

/**
 * Inteiro da URL, ou undefined. A URL é editável à mão e compartilhável:
 * `?numberMin=abc` virava NaN, era contado como filtro ativo e chegava à API
 * literalmente como "numberMin=NaN" — que ela agora recusa com 400.
 */
function lerInteiro(params: URLSearchParams, chave: string, minimo = 0): number | undefined {
  const bruto = params.get(chave);
  if (bruto === null || !/^\d+$/.test(bruto.trim())) return undefined;
  const valor = Number(bruto);
  return valor >= minimo ? valor : undefined;
}

/** O `as SortField` de antes não validava nada: ?sort=qualquer_coisa ia cru para a API. */
function lerOrdenacao(params: URLSearchParams): SortField {
  const bruto = params.get('sort');
  return (VALID_SORT_FIELDS as readonly string[]).includes(bruto ?? '')
    ? (bruto as SortField)
    : 'number';
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<FilterState>(() => ({
    query: lerTexto(searchParams, 'q'),
    tags: lerLista(searchParams, 'tags'),
    rhythm: lerLista(searchParams, 'rhythm'),
    tonality: lerLista(searchParams, 'tonality'),
    category: lerLista(searchParams, 'category'),
    materialKinds: lerLista(searchParams, 'materialKinds'),
    numberMin: lerInteiro(searchParams, 'numberMin'),
    numberMax: lerInteiro(searchParams, 'numberMax'),
    sort: lerOrdenacao(searchParams),
    order: searchParams.get('order') === 'desc' ? 'desc' : 'asc',
    page: lerInteiro(searchParams, 'page', 1) ?? 1,
  }), [searchParams]);

  const setFilters = useCallback((updates: Partial<FilterState>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      const shouldResetPage =
        !('page' in updates) &&
        ('query' in updates ||
          'tags' in updates ||
          'rhythm' in updates ||
          'tonality' in updates ||
          'category' in updates ||
          'materialKinds' in updates ||
          'numberMin' in updates ||
          'numberMax' in updates ||
          'sort' in updates ||
          'order' in updates);

      if (shouldResetPage) {
        newParams.delete('page');
      }

      if ('query' in updates) {
        if (updates.query) newParams.set('q', updates.query);
        else newParams.delete('q');
      }
      if ('tags' in updates) {
        if (updates.tags && updates.tags.length > 0) newParams.set('tags', updates.tags.join(','));
        else newParams.delete('tags');
      }
      if ('rhythm' in updates) {
        if (updates.rhythm && updates.rhythm.length > 0) newParams.set('rhythm', updates.rhythm.join(','));
        else newParams.delete('rhythm');
      }
      if ('tonality' in updates) {
        if (updates.tonality && updates.tonality.length > 0) newParams.set('tonality', updates.tonality.join(','));
        else newParams.delete('tonality');
      }
      if ('category' in updates) {
        if (updates.category && updates.category.length > 0) newParams.set('category', updates.category.join(','));
        else newParams.delete('category');
      }
      if ('materialKinds' in updates) {
        if (updates.materialKinds && updates.materialKinds.length > 0) {
          newParams.set('materialKinds', updates.materialKinds.join(','));
        } else newParams.delete('materialKinds');
      }
      if ('numberMin' in updates) {
        if (updates.numberMin !== undefined) newParams.set('numberMin', updates.numberMin.toString());
        else newParams.delete('numberMin');
      }
      if ('numberMax' in updates) {
        if (updates.numberMax !== undefined) newParams.set('numberMax', updates.numberMax.toString());
        else newParams.delete('numberMax');
      }
      if ('sort' in updates) {
        if (updates.sort && updates.sort !== 'number') newParams.set('sort', updates.sort);
        else newParams.delete('sort');
      }
      if ('order' in updates) {
        if (updates.order && updates.order !== 'asc') newParams.set('order', updates.order);
        else newParams.delete('order');
      }
      if ('page' in updates) {
        if (updates.page && updates.page !== 1) newParams.set('page', updates.page.toString());
        else newParams.delete('page');
      }

      return newParams;
    });
  }, [setSearchParams]);

  const toggleTag = useCallback((tagId: string) => {
    const newTags = filters.tags.includes(tagId)
      ? filters.tags.filter(id => id !== tagId)
      : [...filters.tags, tagId];
    setFilters({ tags: newTags, page: 1 });
  }, [filters.tags, setFilters]);

  const clearAllFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const activeFilterCount = 
    (filters.query ? 1 : 0) +
    filters.tags.length +
    filters.rhythm.length +
    filters.tonality.length +
    filters.category.length +
    filters.materialKinds.length +
    (filters.numberMin !== undefined ? 1 : 0) +
    (filters.numberMax !== undefined ? 1 : 0);

  return {
    filters,
    setFilters,
    toggleTag,
    clearAllFilters,
    activeFilterCount,
  };
}