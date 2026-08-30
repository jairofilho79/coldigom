import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordProPage } from '../ChordProPage';
import { AuthProvider } from '../../context/AuthContext';
import * as AuthContext from '../../context/AuthContext';
import * as api from '../../services/api';
import { parse } from '../../lib/chordpro/parse';
import { serialize } from '../../lib/chordpro/serialize';
import type { PraiseDetail } from '../../types';

const praise = {
  id: 'p1',
  name: 'Confio em Deus',
  number: '344',
  author: 'Let.: W. C. Martin',
  rhythm: 'Básico',
  tonality: 'G',
  category: '',
  lyrics: '',
  group_id: null,
  tag_ids: null,
  tag_names: null,
  tags: [],
  group_members: [],
  materials: [
    {
      id: 'm1',
      praise_id: 'p1',
      material_kind: 'k1',
      material_kind_name: 'Cifra I',
      type: 'chord',
      r2_key: 'assets/praises/p1/m1.chord',
      file_path_legacy: '',
      source_material_id: 'pdf1',
    },
    {
      id: 'pdf1',
      praise_id: 'p1',
      material_kind: 'k2',
      material_kind_name: 'Partitura',
      type: 'pdf',
      r2_key: 'assets/praises/p1/pdf1.pdf',
      file_path_legacy: '',
      source_material_id: null,
    },
  ],
} as unknown as PraiseDetail;

/** A página lê a sessão para decidir entre o switch de revisão e o selo,
 *  então o provider precisa existir também no teste. */
function renderPage({ authenticated = false }: { authenticated?: boolean } = {}) {
  vi.spyOn(api, 'getMe').mockResolvedValue(
    authenticated ? ({ sub: 'u1', name: 'Revisor' } as never) : null
  );
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/praise/p1/cifra/m1']}>
        <Routes>
          <Route path="/praise/:praiseId/cifra/:materialId" element={<ChordProPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

/** O AuthProvider real faria uma chamada de rede; aqui a sessão é decidida no teste.
 *  Os testes antigos continuam sem chamar isto — o `vi.restoreAllMocks()` do
 *  `afterEach` desfaz o spy entre um teste e outro. */
function mockAuth(user: { name?: string; email?: string } | null) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user,
    ready: true,
    isAuthenticated: Boolean(user),
    logout: vi.fn(),
    authError: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
}

function stubFetch(impl: () => Promise<Response> | Response) {
  vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ChordProPage', () => {
  it('renderiza a cifra quando o arquivo existe', async () => {
    stubFetch(() => new Response('{title: Confio Em Deus}\n{key: A}\n\nConfio em [A]Deus', { status: 200 }));
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cp-line')).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'Confio Em Deus' })).toBeInTheDocument();
  });

  it('o cabeçalho mostra o tom do arquivo, não o do banco', async () => {
    // o arquivo diz A, o banco diz G — a cifra manda, o viewer nunca reconcilia
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Tom A/)).toBeInTheDocument());
    expect(screen.queryByText(/Tom G/)).not.toBeInTheDocument();
  });

  it('404 vira "ainda não foi publicada", com link para o PDF de origem', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/ainda não foi publicada/i)).toBeInTheDocument());
    // o link aparece no estado vazio e de novo no painel do material
    expect(screen.getAllByRole('link', { name: /PDF de origem/i }).length).toBeGreaterThan(0);
  });

  it('falha de rede vira erro com botão de tentar de novo, distinto do 404', async () => {
    stubFetch(() => Promise.reject(new Error('Failed to fetch')));
    renderPage();
    await waitFor(() => expect(screen.getByText(/falha ao carregar/i)).toBeInTheDocument());
    expect(screen.queryByText(/ainda não foi publicada/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('arquivo sem letra não vira tela em branco — mostra as notas do pipeline', async () => {
    stubFetch(() =>
      new Response('{title: Clama}\n\n; Reanexe o PDF correto e processe de novo.', { status: 200 })
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/Reanexe o PDF correto/)).toBeInTheDocument());
  });

  it('o painel mostra os dados do banco identificados como tal', async () => {
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/no banco/i)).toBeInTheDocument());
    // 'Cifra I' aparece no chip do cabecalho e na linha Categoria do painel
    expect(screen.getAllByText('Cifra I').length).toBeGreaterThan(0);
    expect(screen.getByText('Let.: W. C. Martin')).toBeInTheDocument();
  });

  it('sem sessão, a revisão é só um selo — não dá para alterar', async () => {
    stubFetch(() => new Response('{title: X}\n\n[A]letra', { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/não revisada/i)).toBeInTheDocument());
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('com sessão, o switch marca a cifra como revisada', async () => {
    stubFetch(() => new Response('{title: X}\n\n[A]letra', { status: 200 }));
    const revisada = {
      ...praise,
      materials: praise.materials.map((m) =>
        m.id === 'm1' ? { ...m, is_reviewed: true, reviewed_by: 'Revisor' } : m
      ),
    } as PraiseDetail;
    const update = vi.spyOn(api, 'updateMaterial').mockResolvedValue(revisada);

    renderPage({ authenticated: true });
    const sw = await screen.findByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(sw);

    expect(update).toHaveBeenCalledWith('m1', { is_reviewed: true });
    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    );
    expect(screen.getByText(/Revisor/)).toBeInTheDocument();
  });
});

describe('modo de edição', () => {
  it('sem sessão não há botão de editar', async () => {
    mockAuth(null);
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'X' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('com sessão, editar abre o editor', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    expect(screen.getByLabelText('Tom')).toHaveValue('A');
  });

  it('acorde inválido desabilita o salvar e oferece o forçar', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response('{title: X}\n\nletra [Bmm]aqui', { status: 200 }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));

    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /salvar assim mesmo/i })).toBeEnabled();
    expect(screen.getByText(/1 acorde não reconhecido/i)).toBeInTheDocument();
  });

  it('salvar manda o ChordPro serializado para o endpoint', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(calls.some(([, i]) => i?.method === 'PUT')).toBe(true));
    const put = calls.find(([, i]) => i?.method === 'PUT')!;
    expect(put[0]).toContain('/api/materials/m1/content');
    expect(String(put[1]!.body)).toContain('[A]letra');
    expect(String(put[1]!.body)).toContain('{key: A}');
    // contrato com o endpoint: o corpo é o ChordPro verbatim, byte a byte. O endpoint
    // grava o que recebe no R2 — um JSON.stringify por engano escreveria aspas e "\n"
    // literais dentro do .chord, e o parser leria o arquivo inteiro como uma linha de letra.
    expect(put[1]!.headers).toMatchObject({ 'content-type': 'text/plain; charset=utf-8' });
    expect(put[1]!.body).toBe(serialize(parse('{title: X}\n{key: A}\n\n[A]letra')));
  });

  it('depois de salvar, a leitura mostra o que foi gravado, não o texto antigo', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
      // o GET nunca muda: se a tela mostrasse a resposta dele, mostraria o tom antigo
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    const tom = screen.getByLabelText('Tom');
    await userEvent.clear(tom);
    await userEvent.type(tom, 'G');
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    // editor fechado e o cabeçalho já com o tom novo
    await waitFor(() => expect(screen.queryByLabelText('Tom')).not.toBeInTheDocument());
    expect(screen.getByText('Tom G')).toBeInTheDocument();
  });

  it('aborta quando o arquivo mudou no servidor desde o carregamento', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    let gets = 0;
    let puts = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      // o AuthProvider de verdade também usa fetch (/auth/refresh); aqui só o
      // arquivo da cifra conta, senão a contagem de GETs vira corrida
      if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
      gets += 1;
      // o segundo GET (a checagem antes de gravar) devolve conteúdo diferente
      return new Response(
        gets === 1 ? '{title: X}\n\n[A]letra' : '{title: X}\n\n[A]OUTRA COISA',
        { status: 200 }
      );
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/mudou no servidor/i)).toBeInTheDocument();
    // o que importa: nada foi gravado por cima do trabalho do outro
    expect(puts).toBe(0);
  });

  it('"salvar assim mesmo" contorna o validador, nunca a proteção de concorrência', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    let gets = 0;
    let puts = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
      gets += 1;
      return new Response(
        gets === 1 ? '{title: X}\n\nletra [Bmm]aqui' : '{title: X}\n\nOUTRA COISA',
        { status: 200 }
      );
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /salvar assim mesmo/i }));

    expect(await screen.findByText(/mudou no servidor/i)).toBeInTheDocument();
    expect(puts).toBe(0);
  });

  it('releitura que falha não manda recarregar — recarregar jogaria o rascunho fora', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    let gets = 0;
    let puts = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
      gets += 1;
      // a checagem antes de gravar bate num soluço do R2: nada mudou, só não dá para saber
      if (gets > 1) return new Response('', { status: 500 });
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/não foi possível verificar o arquivo/i)).toBeInTheDocument();
    // não é conflito: nunca mandar recarregar num caso em que nada mudou
    expect(screen.queryByText(/mudou no servidor/i)).not.toBeInTheDocument();
    expect(puts).toBe(0);
    // o rascunho continua na tela, intacto
    expect(screen.getByLabelText('Tom')).toHaveValue('A');
  });

  it('erro de gravação não tira a pessoa do editor', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ error: 'R2 fora do ar' }), { status: 500 });
      }
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/R2 fora do ar/)).toBeInTheDocument();
    // o trabalho continua na tela: o editor não fechou
    expect(screen.getByLabelText('Tom')).toHaveValue('A');
  });

  it('rascunho sem nenhuma linha de letra desabilita o salvar, com o motivo', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response('{title: X}\n\n[A]letra', { status: 200 }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));

    // "Remover linha" não pede confirmação e não tem desfazer: em uma cifra de uma
    // linha, um clique deixa o Song sem células.
    await userEvent.click(screen.getByRole('button', { name: /remover linha/i }));

    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeDisabled();
    expect(screen.getByText(/ficaria sem nenhuma linha de letra/i)).toBeInTheDocument();
  });

  it('"salvar assim mesmo" não grava um arquivo sem linha de letra', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    let puts = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts += 1;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
      return new Response('{title: X}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /remover linha/i }));

    // O forçar contorna o validador de acordes; apagar a cifra do acervo não é
    // "acorde raro", e o R2 não tem versionamento para desfazer.
    const forcar = screen.getByRole('button', { name: /salvar assim mesmo/i });
    expect(forcar).toBeDisabled();
    await userEvent.click(forcar);

    expect(puts).toBe(0);
  });

  it('cifra sem letra ainda pode ser reaberta no editor — é o caminho de volta', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    // Exatamente o que uma gravação vazia deixa no R2: só o cabeçalho.
    stubFetch(() => new Response('{title: X}\n\n', { status: 200 }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/ainda não foi publicada/i)).toBeInTheDocument());
    // Sem este botão a pessoa fica trancada para fora do próprio arquivo.
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getByLabelText('Título')).toHaveValue('X');
  });

  it('"cancelar edição" sai do editor e limpa a mensagem de erro', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return new Response(JSON.stringify({ error: 'R2 fora do ar' }), { status: 500 });
      }
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    expect(await screen.findByText(/R2 fora do ar/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /cancelar edição/i }));

    expect(screen.queryByLabelText('Tom')).not.toBeInTheDocument();
    expect(screen.queryByText(/R2 fora do ar/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
  });
});
