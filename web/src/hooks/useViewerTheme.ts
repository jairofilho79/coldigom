import { useCallback, useState } from 'react';

export const VIEWER_THEME_KEY = 'coldigom_chordpro_theme';
export type ViewerTheme = 'dark' | 'light';

function readStored(): ViewerTheme {
  try {
    const stored = localStorage.getItem(VIEWER_THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

/** Tema local ao viewer, persistido. Não toca no tema global da aplicação. */
export function useViewerTheme() {
  const [theme, setTheme] = useState<ViewerTheme>(readStored);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ViewerTheme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(VIEWER_THEME_KEY, next);
      } catch {
        // storage indisponível — o tema vale só para esta sessão
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
