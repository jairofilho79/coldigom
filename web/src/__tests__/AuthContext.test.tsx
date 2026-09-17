import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../context/useAuth';

vi.mock('../services/api', () => ({
  getMe: vi.fn(),
  refreshSession: vi.fn(),
  exchangeAuthCode: vi.fn(),
  logout: vi.fn(),
  isAuthStorageKey: (key: string | null) =>
    key === null || key === 'coldigom_access' || key === 'coldigom_refresh',
}));

import { getMe, refreshSession, exchangeAuthCode, logout } from '../services/api';

const CHAVE_ERRO = 'coldigom_auth_error';

const mockUser = { sub: 'u1', email: 'gente@teste.com', name: 'Gente Teste' };

function Sonda() {
  const { user, ready, isAuthenticated, authError, logout: sair } = useAuth();
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.name ?? ''}</span>
      <span data-testid="error">{authError ?? ''}</span>
      <button onClick={() => void sair()}>Sair</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>
  );
}

function irPara(url: string) {
  window.history.pushState({}, '', url);
}

const descritorSessionStorageOriginal = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

/** Mesma técnica de storageResilience.test.tsx: navegador com armazenamento bloqueado
 * (Safari privado, cookies desligados) — spyOn no protótipo não intercepta o Storage
 * do jsdom, então o bloqueio precisa substituir o getter de `window.sessionStorage`. */
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

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    irPara('/');
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (refreshSession as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (exchangeAuthCode as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (logout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (descritorSessionStorageOriginal) {
      Object.defineProperty(window, 'sessionStorage', descritorSessionStorageOriginal);
    }
  });

  it('fica pronto e autenticado quando a sessão já existe', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).toHaveTextContent('Gente Teste');
  });

  it('sem sessão e sem token de refresh, fica pronto e deslogado', async () => {
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(refreshSession).toHaveBeenCalled();
  });

  it('sessão expirada renova via refresh e busca o usuário de novo', async () => {
    (getMe as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUser);
    (refreshSession as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('mostra o erro salvo no armazenamento já no primeiro render', () => {
    sessionStorage.setItem(CHAVE_ERRO, 'Falha no login. Tente de novo.');

    renderProvider();

    expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
  });

  it('armazenamento bloqueado ao ler o erro não derruba a árvore', () => {
    bloquearSessionStorage();

    expect(() => renderProvider()).not.toThrow();
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });

  it('auth=error na URL define o erro e limpa o parâmetro', async () => {
    irPara('/?auth=error');

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
    });
    expect(window.location.search).toBe('');
    expect(sessionStorage.getItem(CHAVE_ERRO)).toBe('Falha no login. Tente de novo.');
  });

  it('auth=drive_error na URL define o mesmo erro de login', async () => {
    irPara('/?auth=drive_error');

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
    });
    expect(window.location.search).toBe('');
  });

  it('armazenamento bloqueado ao salvar o erro não impede o aviso na aba', async () => {
    bloquearSessionStorage();
    irPara('/?auth=error');

    expect(() => renderProvider()).not.toThrow();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
    });
  });

  it('auth=exchange com código válido troca o código pela sessão', async () => {
    sessionStorage.setItem(CHAVE_ERRO, 'erro antigo');
    irPara('/?auth=exchange&code=abc123');
    (exchangeAuthCode as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });
    expect(exchangeAuthCode).toHaveBeenCalledWith('abc123');
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(sessionStorage.getItem(CHAVE_ERRO)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('auth=exchange sem código define erro sem chamar a troca', async () => {
    irPara('/?auth=exchange');

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
    });
    expect(exchangeAuthCode).not.toHaveBeenCalled();
  });

  it('auth=exchange com código recusado pelo servidor define erro', async () => {
    irPara('/?auth=exchange&code=ruim');
    (exchangeAuthCode as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Falha no login. Tente de novo.');
    });
    expect(exchangeAuthCode).toHaveBeenCalledWith('ruim');
  });

  it('auth=success tenta buscar o usuário várias vezes com atraso entre tentativas', async () => {
    irPara('/?auth=success');
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    renderProvider();

    // 4 tentativas do laço de auth=success (com 350ms de intervalo) + 1 busca
    // final fora do laço — a autenticação já aparece após a 1ª, bem antes de o
    // efeito inteiro terminar, então a contagem só fecha esperando por ela.
    await waitFor(
      () => {
        expect(getMe).toHaveBeenCalledTimes(5);
      },
      { timeout: 5000 }
    );
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
  }, 10000);

  it('valor de auth desconhecido não dispara o laço de tentativas', async () => {
    irPara('/?auth=drive_connected');

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    // Sem laço: só a busca final, fora do bloco de auth.
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
  });

  it('não revalida ao ganhar foco antes de a sessão estar pronta', async () => {
    let resolverGetMe: (u: typeof mockUser | null) => void = () => {};
    (getMe as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolverGetMe = resolve;
      })
    );

    renderProvider();
    expect(screen.getByTestId('ready')).toHaveTextContent('false');

    window.dispatchEvent(new Event('focus'));
    // Ainda não pronto: o foco não deve provocar uma segunda busca.
    expect(getMe).toHaveBeenCalledTimes(1);

    resolverGetMe(mockUser);
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
  });

  it('revalida ao ganhar foco depois que a sessão está pronta', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    const chamadasAntes = (getMe as ReturnType<typeof vi.fn>).mock.calls.length;

    window.dispatchEvent(new Event('focus'));

    // Timeout maior: sob a suíte inteira em paralelo, o padrão (1s) já foi
    // curto demais para o efeito de foco terminar de revalidar.
    await waitFor(
      () => {
        expect((getMe as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(chamadasAntes);
      },
      { timeout: 3000 }
    );
  });

  it('revalida quando a aba volta a ficar visível', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    const chamadasAntes = (getMe as ReturnType<typeof vi.fn>).mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(
      () => {
        expect((getMe as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(chamadasAntes);
      },
      { timeout: 3000 }
    );
  });

  it('outra aba logou: o evento storage dos tokens faz esta aba revalidar', async () => {
    // A sessão agora vive no localStorage, compartilhado entre abas. Sem escutar
    // o `storage`, quem logou na aba B só via a mudança na aba A no próximo foco.
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');

    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    window.dispatchEvent(new StorageEvent('storage', { key: 'coldigom_refresh', newValue: 'r2' }));

    await waitFor(
      () => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      },
      { timeout: 3000 }
    );
  });

  it('evento storage de outra chave não revalida', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    const chamadasAntes = (getMe as ReturnType<typeof vi.fn>).mock.calls.length;

    window.dispatchEvent(new StorageEvent('storage', { key: 'coldigom_rascunho_louvor', newValue: '{}' }));

    await new Promise((r) => setTimeout(r, 50));
    expect((getMe as ReturnType<typeof vi.fn>).mock.calls.length).toBe(chamadasAntes);
  });

  it('não revalida quando a aba fica oculta', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('ready')).toHaveTextContent('true');
    });
    const chamadasAntes = (getMe as ReturnType<typeof vi.fn>).mock.calls.length;

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Dá tempo para uma chamada indevida acontecer, se houvesse.
    await new Promise((r) => setTimeout(r, 20));
    expect((getMe as ReturnType<typeof vi.fn>).mock.calls.length).toBe(chamadasAntes);
  });

  it('logout limpa o usuário e chama a API', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    const user = userEvent.setup();
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    await user.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('cancela sem quebrar quando o provider desmonta com uma busca em voo', async () => {
    let resolverGetMe: (u: typeof mockUser | null) => void = () => {};
    (getMe as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolverGetMe = resolve;
      })
    );

    const { unmount } = renderProvider();
    unmount();

    expect(() => resolverGetMe(mockUser)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
