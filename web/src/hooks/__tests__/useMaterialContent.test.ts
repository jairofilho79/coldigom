import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMaterialContent } from '../useMaterialContent';

const KEY = 'assets/praises/p/m.chord';

afterEach(() => vi.unstubAllGlobals());

describe('useMaterialContent', () => {
  it('200 vira ready com o conteúdo', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('{title: X}\n[C]letra', { status: 200 })));
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('ready'));
    expect(result.current.content).toEqual({ status: 'ready', source: '{title: X}\n[C]letra' });
  });

  it('404 vira absent, não erro — é o caminho normal de 97,5% dos registros', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('{"error":"File not found"}', { status: 404 })));
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('absent'));
  });

  it('falha de rede vira error, distinto de absent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))));
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
    expect(result.current.content).toEqual({ status: 'error', message: 'Failed to fetch' });
  });

  it('5xx vira error, não absent', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Response('boom', { status: 500 })));
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
  });

  it('r2_key nulo vira absent sem tocar na rede', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const { result } = renderHook(() => useMaterialContent(null));
    await waitFor(() => expect(result.current.content.status).toBe('absent'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('faz um único GET — nunca HEAD', async () => {
    const spy = vi.fn(() => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const init = spy.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('retry refaz o GET depois de uma falha', async () => {
    let chamadas = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        chamadas += 1;
        return chamadas === 1
          ? Promise.reject(new Error('Failed to fetch'))
          : Promise.resolve(new Response('[C]ok', { status: 200 }));
      })
    );
    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.content.status).toBe('ready'));
  });
});
