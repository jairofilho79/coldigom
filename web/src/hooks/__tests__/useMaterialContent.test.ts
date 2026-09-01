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

describe('a guarda de corrida — a maquinaria que ninguém estava testando', () => {
  /** Promessa que o teste resolve quando quiser. */
  function adiavel<T>() {
    let resolver!: (v: T) => void;
    const promessa = new Promise<T>((res) => {
      resolver = res;
    });
    return { promessa, resolver };
  }

  it('resposta da chave antiga não é exibida sob a chave nova', async () => {
    // Sem o carimbo `{key}`, trocar de cifra com uma requisição no ar mostraria o
    // conteúdo da cifra anterior sob o título da nova. Removendo a guarda do hook,
    // os testes existentes continuavam todos verdes: esta corrida não tinha rede.
    const antiga = adiavel<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('antiga.chord')
          ? antiga.promessa
          : new Response('conteudo NOVO', { status: 200 })
      )
    );

    const { result, rerender } = renderHook(({ k }) => useMaterialContent(k), {
      initialProps: { k: 'assets/praises/p/antiga.chord' },
    });
    rerender({ k: 'assets/praises/p/nova.chord' });
    await waitFor(() => expect(result.current.content).toEqual({ status: 'ready', source: 'conteudo NOVO' }));

    // Só agora a requisição da cifra anterior responde.
    await act(async () => {
      antiga.resolver(new Response('conteudo ANTIGO', { status: 200 }));
      await antiga.promessa;
    });

    expect(result.current.content).toEqual({ status: 'ready', source: 'conteudo NOVO' });
  });

  it('trocar de chave volta para loading em vez de mostrar a cifra anterior', async () => {
    const nova = adiavel<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        String(url).includes('antiga.chord')
          ? new Response('conteudo ANTIGO', { status: 200 })
          : nova.promessa
      )
    );

    const { result, rerender } = renderHook(({ k }) => useMaterialContent(k), {
      initialProps: { k: 'assets/praises/p/antiga.chord' },
    });
    await waitFor(() => expect(result.current.content.status).toBe('ready'));

    rerender({ k: 'assets/praises/p/nova.chord' });
    // O resultado guardado ainda é o da chave antiga: não pode passar por pronto.
    expect(result.current.content).toEqual({ status: 'loading' });
  });

  it('a requisição em voo é cancelada de verdade ao trocar de chave', async () => {
    // Não basta descartar o resultado: a requisição antiga seguia trafegando.
    const sinais: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) sinais.push(init.signal);
        return new Promise<Response>(() => {});
      })
    );

    const { rerender } = renderHook(({ k }) => useMaterialContent(k), {
      initialProps: { k: 'assets/praises/p/antiga.chord' },
    });
    rerender({ k: 'assets/praises/p/nova.chord' });

    expect(sinais[0].aborted).toBe(true);
    expect(sinais[1].aborted).toBe(false);
  });

  it('desmontar cancela a requisição em voo', async () => {
    const sinais: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.signal) sinais.push(init.signal);
        return new Promise<Response>(() => {});
      })
    );

    const { unmount } = renderHook(() => useMaterialContent(KEY));
    unmount();

    expect(sinais[0].aborted).toBe(true);
  });

  it('durante uma nova tentativa o estado é loading, não o erro anterior', async () => {
    // O carimbo `{attempt}` existe para isto: sem ele, clicar em "tentar de novo"
    // deixaria o erro antigo na tela enquanto a nova requisição viaja.
    const segunda = adiavel<Response>();
    let chamadas = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        chamadas += 1;
        return chamadas === 1 ? Promise.reject(new Error('caiu')) : segunda.promessa;
      })
    );

    const { result } = renderHook(() => useMaterialContent(KEY));
    await waitFor(() => expect(result.current.content.status).toBe('error'));

    act(() => result.current.retry());
    expect(result.current.content).toEqual({ status: 'loading' });

    await act(async () => {
      segunda.resolver(new Response('deu certo', { status: 200 }));
      await segunda.promessa;
    });
    expect(result.current.content).toEqual({ status: 'ready', source: 'deu certo' });
  });
});
