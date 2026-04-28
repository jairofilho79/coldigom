import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFilters } from '../hooks/useFilters';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import React from 'react';

// Wrapper for testing hooks that use useSearchParams
function createWrapper(initialEntries: string = '/') {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntries]}>
        {children}
      </MemoryRouter>
    );
  };
}

describe('useFilters Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return default values with no URL params', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/'),
      });

      expect(result.current.filters.query).toBe('');
      expect(result.current.filters.tags).toEqual([]);
      expect(result.current.filters.rhythm).toEqual([]);
      expect(result.current.filters.tonality).toEqual([]);
      expect(result.current.filters.category).toEqual([]);
      expect(result.current.filters.numberMin).toBeUndefined();
      expect(result.current.filters.numberMax).toBeUndefined();
      expect(result.current.filters.sort).toBe('number');
      expect(result.current.filters.order).toBe('asc');
      expect(result.current.filters.page).toBe(1);
    });

    it('should parse query param from URL', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?q=test'),
      });

      expect(result.current.filters.query).toBe('test');
    });

    it('should parse tags param from URL', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?tags=tag1,tag2,tag3'),
      });

      expect(result.current.filters.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should parse pagination param from URL', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?page=3'),
      });

      expect(result.current.filters.page).toBe(3);
    });

    it('should parse number range params from URL', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?numberMin=1&numberMax=10'),
      });

      expect(result.current.filters.numberMin).toBe(1);
      expect(result.current.filters.numberMax).toBe(10);
    });

    it('should parse sort and order from URL', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?sort=name&order=desc'),
      });

      expect(result.current.filters.sort).toBe('name');
      expect(result.current.filters.order).toBe('desc');
    });
  });

  describe('setFilters', () => {
    it('should update query param', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/'),
      });

      await act(async () => {
        result.current.setFilters({ query: 'new search' });
      });

      expect(result.current.filters.query).toBe('new search');
    });

    it('should set page to 1 when updating query', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?page=5'),
      });

      await act(async () => {
        result.current.setFilters({ query: 'new search' });
      });

      expect(result.current.filters.page).toBe(1);
    });

    it('should update tags array', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/'),
      });

      await act(async () => {
        result.current.setFilters({ tags: ['tag1', 'tag2'] });
      });

      expect(result.current.filters.tags).toEqual(['tag1', 'tag2']);
    });

    it('should clear query when empty string is set', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?q=test'),
      });

      await act(async () => {
        result.current.setFilters({ query: '' });
      });

      expect(result.current.filters.query).toBe('');
    });

    it('should remove param from URL when undefined is set', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?numberMin=1'),
      });

      await act(async () => {
        result.current.setFilters({ numberMin: undefined });
      });

      expect(result.current.filters.numberMin).toBeUndefined();
    });

    it('should update sort and reset page', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?page=5'),
      });

      await act(async () => {
        result.current.setFilters({ sort: 'name' });
      });

      expect(result.current.filters.sort).toBe('name');
      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('toggleTag', () => {
    it('should add tag when not present', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/'),
      });

      await act(async () => {
        result.current.toggleTag('tag1');
      });

      expect(result.current.filters.tags).toContain('tag1');
    });

    it('should remove tag when already present', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?tags=tag1,tag2'),
      });

      await act(async () => {
        result.current.toggleTag('tag1');
      });

      expect(result.current.filters.tags).not.toContain('tag1');
      expect(result.current.filters.tags).toContain('tag2');
    });

    it('should reset page when toggling tag', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?page=5'),
      });

      await act(async () => {
        result.current.toggleTag('tag1');
      });

      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('clearAllFilters', () => {
    it('should clear all filters', async () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?q=test&tags=tag1&rhythm=Avulsos&page=5'),
      });

      await act(async () => {
        result.current.clearAllFilters();
      });

      expect(result.current.filters.query).toBe('');
      expect(result.current.filters.tags).toEqual([]);
      expect(result.current.filters.rhythm).toEqual([]);
      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('activeFilterCount', () => {
    it('should count query as 1 when present', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?q=test'),
      });

      expect(result.current.activeFilterCount).toBe(1);
    });

    it('should count multiple tags', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?tags=tag1,tag2,tag3'),
      });

      expect(result.current.activeFilterCount).toBe(3);
    });

    it('should count rhythm, tonality, category filters', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?rhythm=Avulsos&tonality=C&category=Louvor'),
      });

      expect(result.current.activeFilterCount).toBe(3);
    });

    it('should count number range as 2 filters', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?numberMin=1&numberMax=10'),
      });

      expect(result.current.activeFilterCount).toBe(2);
    });

    it('should count all filters combined', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/?q=test&tags=tag1,tag2&rhythm=Avulsos&numberMin=1&numberMax=10'),
      });

      // 1 (query) + 2 (tags) + 1 (rhythm) + 2 (number range) = 6
      expect(result.current.activeFilterCount).toBe(6);
    });

    it('should return 0 when no filters are active', () => {
      const { result } = renderHook(() => useFilters(), {
        wrapper: createWrapper('/'),
      });

      expect(result.current.activeFilterCount).toBe(0);
    });
  });
});
