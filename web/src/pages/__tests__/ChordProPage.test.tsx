import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordProPage } from '../ChordProPage';
import { AuthProvider } from '../../context/AuthContext';
import * as api from '../../services/api';
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
