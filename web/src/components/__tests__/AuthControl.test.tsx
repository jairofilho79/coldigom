import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthControl } from '../AuthControl';
import * as AuthContext from '../../context/AuthContext';

function mockAuth(
  user: { name?: string; email?: string; picture?: string } | null,
  ready = true
) {
  const logout = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user,
    ready,
    isAuthenticated: Boolean(user),
    logout,
    authError: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
  return { logout };
}

describe('AuthControl', () => {
  it('anônimo vê o botão de entrar, com o texto padronizado', () => {
    mockAuth(null);
    render(<AuthControl />);
    const link = screen.getByRole('link', { name: 'Entrar com o Google' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth'));
  });

  it('logado vê o nome e o sair', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    render(<AuthControl />);
    expect(screen.getByText('Jairo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /entrar/i })).not.toBeInTheDocument();
  });

  it('mostra o prefixo quando ele é passado, com o nome em <strong>', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl prefixo="Logado como" />);

    expect(container.querySelector('.auth-user')!.textContent).toBe('Logado como Jairo');
    // `.auth-user strong` no global.css só existe porque o nome é o pedaço destacado.
    expect(container.querySelector('.auth-user strong')!.textContent).toBe('Jairo');
  });

  it('sem prefixo, só o nome em texto simples — a HomePage nunca teve rótulo nem <strong>', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl />);

    expect(container.querySelector('.auth-user')!.textContent).toBe('Jairo');
    expect(screen.queryByText(/logado como/i)).toBeNull();
    // O <strong> pertence ao prefixo: sem rótulo não há o que distinguir do nome, e
    // acrescentá-lo aqui mudaria a aparência de uma tela que não pediu mudança.
    expect(container.querySelector('.auth-user strong')).toBeNull();
  });

  it('cai para o email quando não há nome', () => {
    mockAuth({ email: 'j@x.com' });
    render(<AuthControl />);
    expect(screen.getByText('j@x.com')).toBeInTheDocument();
  });

  it('enquanto a sessão não resolveu, não pisca o botão de entrar', () => {
    mockAuth(null, false);
    render(<AuthControl />);
    expect(screen.queryByRole('link', { name: /entrar/i })).not.toBeInTheDocument();
  });

  it('mostra o avatar com o tamanho pedido quando há picture', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com', picture: 'https://example.com/foto.png' });
    const { container } = render(<AuthControl avatarSize={28} />);
    // alt="" torna a imagem decorativa e some do papel "img" da árvore de acessibilidade;
    // por isso consultamos direto pela tag em vez de getByRole.
    const avatar = container.querySelector('img.auth-avatar');
    expect(avatar).not.toBeNull();
    expect(avatar).toHaveAttribute('src', 'https://example.com/foto.png');
    expect(avatar).toHaveAttribute('width', '28');
    expect(avatar).toHaveAttribute('height', '28');
    // Decorativo: o nome já aparece em texto ao lado.
    expect(avatar).toHaveAttribute('alt', '');
  });

  it('não mostra avatar quando não há picture', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl />);
    expect(container.querySelector('img.auth-avatar')).toBeNull();
  });

  it('chama onAfterLogout depois que o logout resolve', async () => {
    const { logout } = mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const onAfterLogout = vi.fn();
    render(<AuthControl onAfterLogout={onAfterLogout} />);

    await userEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(logout).toHaveBeenCalled();
    expect(onAfterLogout).toHaveBeenCalled();
  });
});
