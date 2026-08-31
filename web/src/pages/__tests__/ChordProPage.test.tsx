import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordProPage } from '../ChordProPage';
import { AuthProvider } from '../../context/AuthContext';
import * as AuthContext from '../../context/useAuth';
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

/** Cifra servida no GET e um contador de PUTs — a única coisa que importa nos
 *  testes de bloqueio é que nenhuma gravação chegue ao R2. */
function stubSalvar(fonte: string) {
  let puts = 0;
  vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
    return new Response(fonte, { status: 200 });
  }));
  return { puts: () => puts };
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
    const { puts } = stubSalvar('{title: X}\n\n[A]letra');

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /remover linha/i }));

    // Clique de verdade num botão HABILITADO: é este teste que cobre a guarda dentro
    // de `salvar()`, e não o `disabled` de nenhum botão. (O React não despacha clique
    // em elemento de formulário desabilitado — nem por fireEvent, porque ele lê
    // `props.disabled` da fibra —, então um botão travado deixaria a guarda sem teste.)
    const forcar = screen.getByRole('button', { name: /salvar assim mesmo/i });
    expect(forcar).toBeEnabled();
    await userEvent.click(forcar);

    // O forçar contorna o validador de acordes; apagar a cifra do acervo não é
    // "acorde raro", e o R2 não tem versionamento para desfazer.
    expect(await screen.findByText(/não a perda de conteúdo/i)).toBeInTheDocument();
    expect(puts()).toBe(0);
  });

  it('inserir uma linha e remover a que tinha conteúdo não pode gravar', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const { puts } = stubSalvar('{title: X}\n\n[A]letra');

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));

    // Dois cliques na barra de ações da linha real: "+" cria uma linha de células
    // VAZIA abaixo, "−" apaga a que tinha o conteúdo. Sobra `[{chord: null, text: ''}]`
    // — uma linha `kind: 'cells'`, que uma checagem só de `kind` daria por boa.
    await userEvent.click(screen.getByRole('button', { name: /inserir linha abaixo/i }));
    const remover = screen.getAllByRole('button', { name: /remover linha/i });
    expect(remover).toHaveLength(2);
    await userEvent.click(remover[0]);

    // O que isso gravaria é `"{title: X}\n\n\n"`: na releitura a linha vazia é
    // separador de estrofe, o arquivo volta com `stanzas: []` e `hasLyrics: false`.
    // Indistinguível da perda total — e o editor sem linhas não teria nem o "+" para
    // recriar uma, porque o "+" só existe dentro de uma linha.
    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeDisabled();
    expect(screen.getByText(/ficaria sem nenhuma linha de letra/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /salvar assim mesmo/i }));
    expect(puts()).toBe(0);
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

describe('não perder o trabalho de quem edita', () => {
  const FONTE = '{title: X}\n{key: A}\n\n[A]letra';

  /** Promessa que o teste resolve quando quiser, para segurar a gravação no ar. */
  function adiavel<T>() {
    let resolver!: (v: T) => void;
    let rejeitar!: (e: unknown) => void;
    const promessa = new Promise<T>((res, rej) => {
      resolver = res;
      rejeitar = rej;
    });
    return { promessa, resolver, rejeitar };
  }

  it('o que for digitado durante a gravação não é descartado em silêncio', async () => {
    // O editor continua editável enquanto o PUT viaja, e `salvar` fecha o editor
    // com um setDraft(null) incondicional sobre a closure do clique. O que a pessoa
    // digitou no meio não foi gravado E some da tela, sem aviso — e a próxima
    // checagem de concorrência passa, porque a tela já se acha em dia.
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const put = adiavel<Response>();
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return put.promessa;
        if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
        return new Response(FONTE, { status: 200 });
      })
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    // Com a gravação no ar, a pessoa corrige o tom.
    const tom = screen.getByLabelText('Tom');
    await userEvent.clear(tom);
    await userEvent.type(tom, 'D');

    put.resolver(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    // `findBy` espera de verdade; um `waitFor` com assertiva de presença passaria
    // na primeira execução síncrona, antes de a gravação concluir — foi o que
    // aconteceu na primeira versão deste teste.
    expect(await screen.findByText(/alterações novas/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Tom')).toHaveValue('D');
  });

  it('gravação que deu certo mas cuja resposta se perdeu não vira conflito falso', async () => {
    // O PUT chega ao servidor e grava; a resposta se perde (queda de conexão, 502
    // de intermediário). Na segunda tentativa a releitura traz o texto que a própria
    // pessoa acabou de gravar, e a tela acusava "o arquivo mudou no servidor",
    // mandando recarregar — o que joga o rascunho fora. E o ciclo se repetia sempre.
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const gravado = serialize(parse(FONTE));
    let tentativas = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          tentativas += 1;
          // A primeira gravação acontece no servidor, mas a resposta não chega.
          if (tentativas === 1) return Promise.reject(new TypeError('Failed to fetch'));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
        // Depois da primeira tentativa, o servidor já tem o texto novo.
        return new Response(tentativas === 0 ? FONTE : gravado, { status: 200 });
      })
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(tentativas).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/mudou no servidor/i)).not.toBeInTheDocument();
    });
  });

  it('erro de rede ao salvar não aparece em inglês', async () => {
    // `mensagemAmigavel` só roda dentro do `if (!response.ok)` do fetchJson: uma
    // rejeição do próprio fetch escapava crua para a tela.
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') return Promise.reject(new TypeError('Failed to fetch'));
        if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
        return new Response(FONTE, { status: 200 });
      })
    );

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/conexão|rede/i)).toBeInTheDocument();
  });

  it('cancelar a edição com alterações pendentes pergunta antes de descartar', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response(FONTE, { status: 200 }));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    const tom = screen.getByLabelText('Tom');
    await userEvent.clear(tom);
    await userEvent.type(tom, 'D');

    await userEvent.click(screen.getByRole('button', { name: /cancelar edição/i }));

    expect(confirmar).toHaveBeenCalled();
    // Recusou: o editor continua aberto, com o que foi digitado.
    expect(screen.getByLabelText('Tom')).toHaveValue('D');
  });

  it('cancelar sem ter mudado nada não pergunta nada', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response(FONTE, { status: 200 }));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancelar edição/i }));

    expect(confirmar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Tom')).not.toBeInTheDocument();
  });

  it('fechar a aba com edição aberta é barrado pelo navegador', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response(FONTE, { status: 200 }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    const tom = screen.getByLabelText('Tom');
    await userEvent.clear(tom);
    await userEvent.type(tom, 'D');

    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
  });
});

describe('marca de revisão', () => {
  const FONTE_R = '{title: X}\n{key: A}\n\n[A]letra';

  it('o nome acessível do switch é o rótulo que está na tela', async () => {
    // Era `aria-label="Marcar cifra como revisada"` fixo, enquanto o texto visível
    // vira "Revisada" quando ligado: quem usa Controle por Voz e diz "clicar
    // Revisada" não ativava nada, e o leitor de tela anunciava o contrário do que
    // a tela mostra. WCAG 2.5.3, Label in Name.
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response(FONTE_R, { status: 200 }));

    renderPage();
    const sw = await screen.findByRole('switch');
    expect(sw).toHaveAccessibleName('Marcar como revisada');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('falha ao marcar como revisada é anunciada, não só pintada', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response(FONTE_R, { status: 200 }));
    vi.spyOn(api, 'updateMaterial').mockRejectedValue(new Error('Sem permissão'));

    renderPage();
    await userEvent.click(await screen.findByRole('switch'));

    const erro = await screen.findByText('Sem permissão');
    expect(erro).toHaveAttribute('role', 'status');
    expect(erro).toHaveAttribute('aria-live', 'polite');
  });
});

describe('cifra que ainda não existe no R2', () => {
  it('dá para criar a cifra do zero, em vez de ficar trancado para fora', async () => {
    // Sem arquivo, `song` é null e o botão de editar nem era renderizado: um
    // registro de cifra sem `.chord` não tinha nenhum caminho na interface para
    // virar cifra. A única saída era subir o arquivo por fora.
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const puts: string[] = [];
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          puts.push(String(init.body));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (!String(url).includes('.chord')) return new Response('{}', { status: 200 });
        return new Response('', { status: 404 });
      })
    );

    renderPage();
    await waitFor(() => expect(screen.getByText(/ainda não foi publicada/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /adicionar linha/i }));
    // A linha nasce vazia e fechada; abrir para editar é o passo seguinte.
    await userEvent.click(screen.getByRole('button', { name: /Editar linha 1, vazia/i }));

    const campo = screen.getByRole('textbox', { name: 'Texto da linha' });
    // `[[` é o escape do userEvent para um colchete literal: `[C]` sozinho vira
    // descritor de tecla e o acorde não chegaria ao campo.
    await userEvent.type(campo, 'Louvado [[C]seja');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toContain('Louvado [C]seja');
  });
});
