import { useCallback, useEffect, useState } from 'react';
import { getAssetUrl } from '../services/api';

export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; source: string }
  | { status: 'absent' }
  | { status: 'error'; message: string };

/** Resultado carimbado com a chave e a tentativa a que pertence. É isso que
 *  deixa o `loading` ser derivado em vez de setado dentro do efeito. */
type Resolved = { key: string; attempt: number; state: ContentState };

/**
 * Carrega o .chord de um material. Um GET responde "existe?" e "qual é o conteúdo?"
 * de uma vez — os arquivos têm 611 bytes em média, então HEAD não economizaria nada.
 *
 * `absent` (404) e `error` são separados de propósito: "ainda não existe, crie" não é
 * "existe e a rede falhou". São telas diferentes e ações diferentes.
 */
export function useMaterialContent(r2Key: string | null): {
  content: ContentState;
  retry: () => void;
} {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!r2Key) return;

    let cancelled = false;
    const settle = (state: ContentState) => {
      if (!cancelled) setResolved({ key: r2Key, attempt, state });
    };

    (async () => {
      try {
        const response = await fetch(getAssetUrl(r2Key));
        if (response.status === 404) {
          settle({ status: 'absent' });
          return;
        }
        if (!response.ok) {
          settle({ status: 'error', message: `HTTP ${response.status}` });
          return;
        }
        settle({ status: 'ready', source: await response.text() });
      } catch (err) {
        settle({
          status: 'error',
          message: err instanceof Error ? err.message : 'Falha de rede',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [r2Key, attempt]);

  // Material sem r2_key nunca teve arquivo: é ausência, não erro.
  // Resultado de outra chave ou de uma tentativa anterior não conta — ainda é loading.
  const content: ContentState = !r2Key
    ? { status: 'absent' }
    : resolved && resolved.key === r2Key && resolved.attempt === attempt
      ? resolved.state
      : { status: 'loading' };

  return { content, retry };
}
