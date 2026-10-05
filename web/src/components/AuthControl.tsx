import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { getLoginUrl } from '../services/api';

type AuthControlProps = {
  children?: React.ReactNode;
  /** Tamanho (px) do avatar exibido no botão de perfil. */
  avatarSize?: number;
  /** Chamado depois que o `logout()` resolve, para quem precisa limpar estado local (ex.: fechar edição). */
  onAfterLogout?: () => void;
  /**
   * Rótulo antes do nome no menu de perfil, ex.: "Logado como". A PraiseDetailPage usa esse texto.
   */
  prefixo?: string;
};

/**
 * Controle de sessão.
 * Quando o usuário está autenticado, exibe as ações filhas e, ao final, o botão de perfil
 * (com avatar ou fallback). Ao clicar no botão de perfil, abre um menu com os dados do usuário e a opção "Sair".
 */
export function AuthControl({
  children,
  avatarSize = 24,
  onAfterLogout,
  prefixo,
}: AuthControlProps) {
  const { user, ready, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Enquanto a sessão não resolveu, não mostrar nada: piscar "Entrar" para quem
  // já está logado é pior que esperar.
  if (!ready) return null;

  if (!user) {
    return (
      <a className="auth-btn" href={getLoginUrl()}>
        Entrar com o Google
      </a>
    );
  }

  const handleLogout = async () => {
    setIsOpen(false);
    await logout();
    onAfterLogout?.();
  };

  const displayName = user.name || user.email || '';

  return (
    <>
      {children}
      <div className="auth-profile-container" ref={menuRef}>
        <button
          type="button"
          className="auth-profile-btn"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={displayName ? `Perfil de ${displayName}` : 'Perfil do usuário'}
          title={displayName || 'Perfil do usuário'}
        >
          {user.picture ? (
            <img
              className="auth-avatar"
              src={user.picture}
              alt=""
              width={avatarSize}
              height={avatarSize}
            />
          ) : (
            <span
              className="auth-avatar auth-avatar-fallback"
              style={{ width: avatarSize, height: avatarSize }}
              aria-hidden="true"
            >
              {(displayName || '?')[0].toUpperCase()}
            </span>
          )}
        </button>

        {isOpen && (
          <div
            className="auth-profile-menu"
            role="menu"
            aria-label="Menu de perfil"
          >
            <div className="auth-profile-menu-header">
              {prefixo ? (
                <div className="auth-profile-menu-prefix">{prefixo}</div>
              ) : null}
              <div className="auth-profile-menu-name">
                <strong>{user.name || user.email}</strong>
              </div>
              {user.name && user.email ? (
                <div className="auth-profile-menu-email">{user.email}</div>
              ) : null}
            </div>
            <div className="auth-profile-menu-divider" />
            <button
              type="button"
              className="auth-profile-menu-item"
              role="menuitem"
              onClick={() => void handleLogout()}
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </>
  );
}
