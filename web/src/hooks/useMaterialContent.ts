import { useCallback, useEffect, useState } from 'react';
import { getAssetUrl } from '../services/api';

export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; source: string }
  | { status: 'absent' }
  | { status: 'error'; message: string };

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
  const [content, setContent] = useState<ContentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!r2Key) {
      setContent({ status: 'absent' });
      return;
    }

    let cancelled = false;
    setContent({ status: 'loading' });

    (async () => {
      try {
        const response = await fetch(getAssetUrl(r2Key));
        if (cancelled) return;
        if (response.status === 404) {
          setContent({ status: 'absent' });
          return;
        }
        if (!response.ok) {
          setContent({ status: 'error', message: `HTTP ${response.status}` });
          return;
        }
        const source = await response.text();
        if (!cancelled) setContent({ status: 'ready', source });
      } catch (err) {
        if (!cancelled) {
          setContent({
            status: 'error',
            message: err instanceof Error ? err.message : 'Falha de rede',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [r2Key, attempt]);

  return { content, retry };
}
