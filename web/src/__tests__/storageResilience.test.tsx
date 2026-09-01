import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthProvider } from '../context/AuthContext';
import { clearAuthTokens, setAuthTokens } from '../services/api';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return { ...actual, getMe: vi.fn().mockResolvedValue(null), refreshSession: vi.fn().mockResolvedValue(false) };
});

const descritorOriginal = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

/** Navegador com armazenamento bloqueado: Safari privado, cookies desligados. */
function bloquearSessionStorage() {
  const lancar = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    get() {
      return { getItem: lancar, setItem: lancar, removeItem: lancar, clear: lancar, key: lancar, length: 0 };
    },
  });
}

afterEach(() => {
  if (descritorOriginal) Object.defineProperty(window, 'sessionStorage', descritorOriginal);
});

describe('resiliência a armazenamento bloqueado', () => {
  it('a aplicação abre mesmo sem sessionStorage', async () => {
    // O AuthProvider lia sessionStorage no inicializador do useState, que roda
    // DURANTE o render: com armazenamento bloqueado, a árvore inteira caía.
    // É justamente o cenário Safari/iPhone que o projeto já teve trabalho para
    // contornar em outro ponto.
    bloquearSessionStorage();

    expect(() =>
      render(
        <MemoryRouter>
          <AuthProvider>
            <p>conteúdo</p>
          </AuthProvider>
        </MemoryRouter>
      )
    ).not.toThrow();

    expect(screen.getByText('conteúdo')).toBeTruthy();
  });

  it('guardar tokens não derruba o login quando o armazenamento recusa', async () => {
    // As leituras já eram protegidas; as escritas não. setAuthTokens é chamado
    // no caminho de login, que é onde isso dói.
    bloquearSessionStorage();
    expect(() => setAuthTokens('a', 'r')).not.toThrow();
    expect(() => clearAuthTokens()).not.toThrow();
  });
});
