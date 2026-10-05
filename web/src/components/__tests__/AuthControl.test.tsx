import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthControl } from '../AuthControl';
import * as AuthContext from '../../context/useAuth';

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

  it('logado vê o botão de perfil e o botão sair não fica solto na barra', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    render(<AuthControl />);
    expect(screen.getByRole('button', { name: /perfil de jairo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sair/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /entrar/i })).not.toBeInTheDocument();
  });

  it('ao clicar no botão de perfil, abre menu com informações e opção sair', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    render(<AuthControl />);
    await userEvent.click(screen.getByRole('button', { name: /perfil de jairo/i }));

    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.getByText('Jairo')).toBeInTheDocument();
    expect(screen.getByText('j@x.com')).toBeInTheDocument();
  });

  it('mostra o prefixo quando ele é passado, com o nome em <strong> no menu', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl prefixo="Logado como" />);
    await userEvent.click(screen.getByRole('button', { name: /perfil de jairo/i }));

    expect(screen.getByText('Logado como')).toBeInTheDocument();
    expect(container.querySelector('.auth-profile-menu-name strong')!.textContent).toBe('Jairo');
  });

  it('sem prefixo, o menu só mostra o nome sem rótulo', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl />);
    await userEvent.click(screen.getByRole('button', { name: /perfil de jairo/i }));

    expect(container.querySelector('.auth-profile-menu-name strong')!.textContent).toBe('Jairo');
    expect(screen.queryByText(/logado como/i)).toBeNull();
    expect(container.querySelector('.auth-profile-menu-prefix')).toBeNull();
  });

  it('cai para o email quando não há nome', async () => {
    mockAuth({ email: 'j@x.com' });
    render(<AuthControl />);
    const profileBtn = screen.getByRole('button', { name: /perfil de j@x.com/i });
    expect(profileBtn).toBeInTheDocument();

    await userEvent.click(profileBtn);
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

  it('mostra fallback quando não há picture', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(<AuthControl />);
    expect(container.querySelector('img.auth-avatar')).toBeNull();
    const fallback = container.querySelector('.auth-avatar-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toBe('J');
  });

  it('renderiza children antes do botão de perfil para mantê-lo no fim', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { container } = render(
      <AuthControl>
        <button type="button" className="auth-btn">Ação da Página</button>
      </AuthControl>
    );

    const buttons = container.querySelectorAll('button');
    expect(buttons[0].textContent).toBe('Ação da Página');
    expect(buttons[1]).toHaveClass('auth-profile-btn');
  });

  it('chama onAfterLogout depois que o logout resolve ao sair pelo menu', async () => {
    const { logout } = mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const onAfterLogout = vi.fn();
    render(<AuthControl onAfterLogout={onAfterLogout} />);

    await userEvent.click(screen.getByRole('button', { name: /perfil de jairo/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sair' }));

    expect(logout).toHaveBeenCalled();
    expect(onAfterLogout).toHaveBeenCalled();
  });

  it('fecha o menu ao pressionar Escape ou clicar fora', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    render(
      <div>
        <div data-testid="fora">Fora</div>
        <AuthControl />
      </div>
    );

    const profileBtn = screen.getByRole('button', { name: /perfil de jairo/i });
    await userEvent.click(profileBtn);
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Sair' })).not.toBeInTheDocument();

    await userEvent.click(profileBtn);
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('fora'));
    expect(screen.queryByRole('menuitem', { name: 'Sair' })).not.toBeInTheDocument();
  });
});
