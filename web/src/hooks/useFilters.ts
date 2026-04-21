import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortField } from '../types';

export interface FilterState {
  query: string;
  tags: string[];
  rhythm: string[];
  tonality: string[];
  category: string[];
  numberMin?: number;
  numberMax?: number;
  sort: SortField;
  order: 'asc' | 'desc';
  page: number;
}

export function useFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const getParam = <T>(key: string, defaultValue: T): T => {
    const value = searchParams.get(key);
    if (value === null) return defaultValue;
    if (typeof defaultValue === 'string') return value as T;
    if (typeof defaultValue === 'number') return parseInt(value, 10) as T;
    if (Array.isArray(defaultValue)) return value.split(',').filter(Boolean) as T;
    return defaultValue;
  };

  const filters: FilterState = {
    query: getParam('q', ''),
    tags: getParam('tags', []),
    rhythm: getParam('rhythm', []),
    tonality: getParam('tonality', []),
    category: getParam('category', []),
    numberMin: searchParams.has('numberMin') ? parseInt(searchParams.get('numberMin')!, 10) : undefined,
    numberMax: searchParams.has('numberMax') ? parseInt(searchParams.get('numberMax')!, 10) : undefined,
    sort: getParam('sort', 'number') as SortField,
    order: getParam('order', 'asc'),
    page: getParam('page', 1),
  };

  const setFilters = useCallback((updates: Partial<FilterState>) => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);

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