import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useFilters } from '../useFilters';

describe('useFilters — limites e filtros de material', () => {
  it('recusa página zero e atualiza categorias de material e ordenação', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/?page=0&category=legado']}>{children}</MemoryRouter>
    );
    const { result } = renderHook(() => useFilters(), { wrapper });
    expect(result.current.filters.page).toBe(1);
    act(() => result.current.setFilters({ materialKinds: ['cifra', 'voz'], order: 'desc' }));
    expect(result.current.filters.materialKinds).toEqual(['cifra', 'voz']);
    expect(result.current.filters.order).toBe('desc');
    act(() => result.current.setFilters({ materialKinds: [], order: 'asc' }));
    expect(result.current.filters.materialKinds).toEqual([]);
    expect(result.current.filters.order).toBe('asc');
  });
});
