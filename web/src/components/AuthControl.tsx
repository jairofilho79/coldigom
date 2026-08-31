import { useAuth } from '../context/useAuth';
import { getLoginUrl } from '../services/api';

type AuthControlProps = {
  children?: React.ReactNode;
  /** Tamanho (px) do avatar exibido ao lado do nome, quando `user.picture` existe. */
  avatarSize?: number;
  /** Chamado depois que o `logout()` resolve, para quem precisa limpar estado local (ex.: fechar edição). */
  onAfterLogout?: () => void;
  /**
   * Rótulo antes do nome, ex.: "Logado como". A PraiseDetailPage tinha esse texto antes
   * da extração deste componente e o perdeu na mudança; a HomePage nunca teve, e por
   * isso o prefixo é opcional em vez de fixo aqui dentro.
   */
  prefixo?: string;
};

/**
 * Controle de sessão. Estava duplicado inline na HomePage e na PraiseDetailPage,
 * com textos divergentes; aqui o texto é um só.
 */
export function AuthControl({
  children,
  avatarSize = 24,
  onAfterLogout,
  prefixo,
}: AuthControlProps) {
  const { user, ready, logout } = useAuth();

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
    await logout();
    onAfterLogout?.();
  };

  return (
    <>
      {user.picture ? (
        // Decorativo: o nome já aparece ao lado em texto, então alt="" evita ruído em leitor de tela.
        <img
          className="auth-avatar"
          src={user.picture}
          alt=""
          width={avatarSize}
          height={avatarSize}
        />
      ) : null}
      {/* O <strong> é do prefixo, não do componente: a regra `.auth-user strong` do
          global.css existe para separar o rótulo do nome, e só há rótulo quando há
          prefixo. Sem prefixo (HomePage) o markup fica igual ao que já estava na tela —
          este componente não muda a aparência de quem não pediu nada. */}
      <span className="auth-user">
        {prefixo ? (
          <>
            {`${prefixo} `}
            <strong>{user.name || user.email}</strong>
          </>
        ) : (
          user.name || user.email
        )}
      </span>
      {children}
      <button type="button" className="auth-btn" onClick={() => void handleLogout()}>
        Sair
      </button>
    </>
  );
}
