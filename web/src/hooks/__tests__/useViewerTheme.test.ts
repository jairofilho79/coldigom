import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewerTheme, VIEWER_THEME_KEY } from '../useViewerTheme';

/**
 * O jsdom desta configuração entrega um `localStorage` sem métodos — o
 * AudioPlayer já convive com isso guardando `typeof getItem !== 'function'`.
 * Aqui o teste fornece um storage de verdade, senão não há o que testar.
 */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('useViewerTheme', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterAll(() => vi.unstubAllGlobals());

  it('começa no escuro', () => {
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('dark');
  });

  it('alterna e persiste', () => {
    const { result } = renderHook(() => useViewerTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(VIEWER_THEME_KEY)).toBe('light');
  });

  it('lê a preferência salva na montagem', () => {
    localStorage.setItem(VIEWER_THEME_KEY, 'light');
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('light');
  });

  it('ignora valor inválido no storage', () => {
    localStorage.setItem(VIEWER_THEME_KEY, 'roxo');
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('dark');
  });

  it('sobrevive a storage indisponível — alterna sem persistir, não quebra', () => {
    vi.stubGlobal('localStorage', {});
    const { result } = renderHook(() => useViewerTheme());
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
  });
});
