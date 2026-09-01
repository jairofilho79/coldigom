import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PraiseDetailPage } from '../pages/PraiseDetailPage';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import type { PraiseDetail } from '../types';

// Mock the api module (preserve exports such as API_BASE_URL used by the page)
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getPraise: vi.fn(),
    getAssetUrl: vi.fn((key: string) => `http://localhost:8787/${key}`),
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
    getMaterialKinds: vi.fn().mockResolvedValue([
      { id: 'kind1', name: 'Partitura' },
      { id: 'kind2', name: 'Áudio' },
      { id: 'kind3', name: 'Cifra' },
      { id: 'c7454ea9-3ae0-4548-9cc5-c4187b80641a', name: 'Desconhecido' },
    ]),
    createPraise: vi.fn(),
    updatePraise: vi.fn(),
    getTags: vi.fn().mockResolvedValue([
      { id: 'tag1', name: 'Coletânea', parent_id: null },
      { id: 'tag2', name: 'Avulsos', parent_id: null },
      { id: 'tag3', name: 'GLTM', parent_id: null },
    ]),
    addPraiseTag: vi.fn(),
    removePraiseTag: vi.fn(),
    groupPraise: vi.fn(),
    createTag: vi.fn(),
    createMaterial: vi.fn(),
    updateMaterial: vi.fn(),
    deleteMaterial: vi.fn(),
    bulkUploadMaterials: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  };
});

import {
  getPraise,
  getMe,
  createPraise,
  groupPraise,
  bulkUploadMaterials,
  removePraiseTag,
  deleteMaterial,
  createTag,
  addPraiseTag,
  updatePraise,
  getMaterialKinds,
} from '../services/api';

const mockAdminUser = { sub: 'admin-1', email: 'admin@test.com', name: 'Admin Teste' };

const mockPraiseDetail: PraiseDetail = {
  id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
  name: 'Grande Deus',
  number: '001',
  author: 'Autor 1',
  rhythm: 'Avulsos',
  tonality: 'C',
  category: 'Louvor',
  lyrics: 'Esta é a letra do louvor',
  group_id: null,
  tag_ids: 'tag1,tag2',
  tag_names: 'Coletânea,Avulsos',
  tags: [
    { id: 'tag1', name: 'Coletânea', parent_id: null },
    { id: 'tag2', name: 'Avulsos', parent_id: null },
  ],
  materials: [
    {
      id: 'mat1',
      praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
      material_kind: 'kind1',
      material_kind_name: 'Partitura',
      type: 'pdf',
      r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat1.pdf',
      file_path_legacy: 'path/to/file.pdf',
      source_material_id: null,
    },
    {
      id: 'mat2',
      praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
      material_kind: 'kind2',
      material_kind_name: 'Áudio',
      type: 'mp3',
      r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat2.mp3',
      file_path_legacy: 'path/to/file.mp3',
      source_material_id: null,
    },
  ],
  group_members: [],
};

describe('PraiseDetailPage Component', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  function renderWithRouter(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/praise/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it('should render loading state initially', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    expect(screen.getByText(/carregando louvor/i)).toBeTruthy();
  });

  it('should render praise details', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Grande Deus')).toBeTruthy();
    });

    expect(screen.getByText('Nº 001')).toBeTruthy();
    expect(screen.getByText('Autor 1')).toBeTruthy();
    expect(screen.getAllByText('Avulsos').length).toBeGreaterThan(0);
    expect(screen.getByText('C')).toBeTruthy();
    expect(screen.getByText('Louvor')).toBeTruthy();
  });

  it('should show download zip link without login', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Baixar em ZIP' });
      expect(link.getAttribute('href')).toBe(
        'http://localhost:8787/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/download.zip'
      );
      expect(link.getAttribute('download')).not.toBeNull();
    });

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('should show praise id and copy to clipboard', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText(mockPraiseDetail.id)).toBeTruthy();
    });

    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /copiar id/i }));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith(mockPraiseDetail.id);
      expect(screen.getByRole('button', { name: /copiar id/i })).toHaveTextContent('Copiado!');
    });

    writeTextSpy.mockRestore();
  });

  it('should render tags', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Coletânea')).toBeTruthy();
      expect(screen.getAllByText('Avulsos').length).toBeGreaterThan(0);
    });
  });

  it('should render lyrics section', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Letra')).toBeTruthy();
      expect(screen.getByText('Esta é a letra do louvor')).toBeTruthy();
    });
  });

  it('should render audio player', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByLabelText('Áudio')).toBeTruthy();
      expect(
        document.querySelector('audio.audio-player-element')
      ).toBeTruthy();
    });

    expect(screen.queryByLabelText('Categoria do material')).toBeNull();
  });

  it('should render PDF links', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Partituras')).toBeTruthy();
      expect(screen.getByText('Partitura')).toBeTruthy();
    });
  });

  it('should render back link', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText('Voltar para lista')).toBeTruthy();
    });
  });

  it('should show error state on API error', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getByText(/erro ao carregar/i)).toBeTruthy();
    });
  });

  it('should show not found state when praise is null', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    renderWithRouter('non-existent-id');

    await waitFor(() => {
      expect(screen.getByText('Louvor não encontrado')).toBeTruthy();
    });
  });

  it('should not render audio section when no audio materials', async () => {
    const praiseWithoutAudio = {
      ...mockPraiseDetail,
      materials: [mockPraiseDetail.materials[0]], // Only PDF
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithoutAudio);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    // Espera o carregamento: afirmar ausência com a tela ainda vazia não prova nada.
    await screen.findByText('Grande Deus');

    expect(screen.queryByText('Áudio')).toBeNull();
    expect(screen.getByText('Partituras')).toBeTruthy();
  });

  it('louvor sem letra mostra a seção com o aviso, não some com ela', async () => {
    // O teste antigo afirmava que a seção NÃO era renderizada — e passava porque a
    // assertiva negativa rodava na primeira execução síncrona do waitFor, com a
    // tela ainda em "Carregando louvor...". A seção sempre existiu. Numa
    // ferramenta de gestão, mostrar a lacuna é melhor que escondê-la: quem abre o
    // louvor precisa ver que falta letra.
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      lyrics: '',
    });

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await screen.findByText('Grande Deus');

    expect(screen.getByText('Letra')).toBeTruthy();
    expect(screen.getByText('Sem letra cadastrada.')).toBeTruthy();
  });

  it('should not render tags section when no tags', async () => {
    const praiseWithoutTags = {
      ...mockPraiseDetail,
      tags: [],
      tag_ids: '',
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithoutTags);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await screen.findByText('Grande Deus');

    expect(screen.queryByText('Coletânea')).toBeNull();
  });

  describe('Novo louvor', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    });

    it('exibe formulário vazio e não chama getPraise', async () => {
      renderWithRouter('new');

      await waitFor(() => {
        expect(screen.getByText('Novo louvor')).toBeTruthy();
      });
      expect(getPraise).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Criar louvor' })).toBeTruthy();
      expect(screen.getByText('Materiais (após salvar)')).toBeTruthy();
      expect(screen.getByText('Importar do Google Drive')).toBeTruthy();
      expect(screen.queryByText('Materiais (admin)')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Baixar em ZIP' })).toBeNull();
    });

    it('cria louvor ao salvar', async () => {
      const user = userEvent.setup();
      const created: PraiseDetail = {
        ...mockPraiseDetail,
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Louvor Novo',
        materials: [],
        tags: [],
        tag_ids: '',
      };
      (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      renderWithRouter('new');

      await waitFor(() => {
        expect(screen.getByText('Novo louvor')).toBeTruthy();
      });

      const nameInput = screen.getAllByRole('textbox')[0];
      await user.type(nameInput, 'Louvor Novo');
      await user.click(screen.getByRole('button', { name: 'Criar louvor' }));

      await waitFor(() => {
        expect(createPraise).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Louvor Novo',
            tag_ids: [],
          })
        );
      });
    });

    it('aponta o arquivo que a API recusaria e trava o envio até resolver', async () => {
      // Um arquivo sem extensão vira o tipo "louvor 42", que a API recusa — e a
      // recusa derruba o LOTE INTEIRO. Antes, isso só aparecia depois do upload
      // completo, com a lista truncada em 25 itens e sem botão para tirar o culpado.
      const user = userEvent.setup();
      renderWithRouter('new');
      await screen.findByText('Novo louvor');

      await user.type(screen.getAllByRole('textbox')[0], 'Louvor Novo');
      await user.upload(screen.getByLabelText('Escolher pasta'), [
        new File(['x'], 'Partitura.pdf', { type: 'application/pdf' }),
        new File(['x'], 'Louvor 42'),
      ]);
      await screen.findByText(/Louvor 42/);

      expect(screen.getByText(/1 arquivo\(s\) precisam de atenção/)).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Criar louvor' }) as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it('mostra todos os arquivos quando são mais que a prévia', async () => {
      const user = userEvent.setup();
      renderWithRouter('new');
      await screen.findByText('Novo louvor');

      const muitos = Array.from(
        { length: 30 },
        (_, i) => new File(['x'], `Partitura ${i}.pdf`, { type: 'application/pdf' })
      );
      await user.upload(screen.getByLabelText('Escolher pasta'), muitos);
      await screen.findByText('Partitura 0.pdf');

      // O 29º não cabia na prévia de 25 e ficava sem categoria nem botão Remover.
      expect(screen.queryByText('Partitura 29.pdf')).toBeNull();
      await user.click(screen.getByRole('button', { name: /Ver os 30/ }));
      expect(screen.getByText('Partitura 29.pdf')).toBeTruthy();
    });

    it('não cria um segundo louvor quando o envio dos arquivos falha', async () => {
      // Criar é uma sequência: createPraise, depois bulkUploadMaterials, depois o
      // import do Drive. Falhando o segundo passo, o louvor do primeiro já existe —
      // e a tela ficava em /praise/new com o formulário intacto, convidando a clicar
      // de novo e criar um louvor duplicado e vazio no acervo.
      const user = userEvent.setup();
      const created: PraiseDetail = {
        ...mockPraiseDetail,
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Louvor Novo',
        materials: [],
        tags: [],
        tag_ids: '',
      };
      (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Máximo de 200 arquivos por lote')
      );

      renderWithRouter('new');
      await screen.findByText('Novo louvor');

      await user.type(screen.getAllByRole('textbox')[0], 'Louvor Novo');
      await user.upload(
        screen.getByLabelText('Escolher pasta'),
        [new File(['x'], 'Partitura.pdf', { type: 'application/pdf' })]
      );
      await screen.findByText(/Partitura\.pdf/);

      const botao = screen.getByRole('button', { name: 'Criar louvor' });
      await user.click(botao);
      await screen.findByText(/Máximo de 200 arquivos por lote/);

      // Segunda tentativa: o louvor já existe, então não pode nascer outro.
      await user.click(screen.getByRole('button', { name: /Criar louvor|Tentar enviar/ }));

      await waitFor(() => {
        expect(bulkUploadMaterials).toHaveBeenCalledTimes(2);
      });
      expect(createPraise).toHaveBeenCalledTimes(1);
    });

    it('avisa que o louvor já foi criado quando só o envio falhou', async () => {
      const user = userEvent.setup();
      (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPraiseDetail,
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        materials: [],
        tags: [],
        tag_ids: '',
      });
      (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Falha de rede')
      );

      renderWithRouter('new');
      await screen.findByText('Novo louvor');

      await user.type(screen.getAllByRole('textbox')[0], 'Louvor Novo');
      await user.upload(
        screen.getByLabelText('Escolher pasta'),
        [new File(['x'], 'Partitura.pdf', { type: 'application/pdf' })]
      );
      await screen.findByText(/Partitura\.pdf/);
      await user.click(screen.getByRole('button', { name: 'Criar louvor' }));

      expect(await screen.findByText(/louvor já foi criado/i)).toBeTruthy();
    });
  });

  describe('Rascunho no redirecionamento do Google Drive', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      sessionStorage.clear();
    });

    function renderComQuery(entrada: string) {
      return render(
        <MemoryRouter initialEntries={[entrada]}>
          <AuthProvider>
            <Routes>
              <Route path="/praise/:id" element={<PraiseDetailPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );
    }

    it('guarda o que foi digitado antes de sair para autorizar o Drive', async () => {
      // O redirecionamento é navegação de página inteira: na volta o componente
      // remonta e nome, número, autor, tags e o link colado voltavam em branco.
      const user = userEvent.setup();
      renderComQuery('/praise/new');
      await screen.findByText('Novo louvor');

      await user.type(screen.getAllByRole('textbox')[0], 'Louvor Novo');
      await user.click(screen.getByRole('button', { name: 'Conectar Google Drive' }));

      const salvo = sessionStorage.getItem('coldigom_rascunho_louvor');
      expect(salvo).toBeTruthy();
      expect(JSON.parse(salvo!).edit.name).toBe('Louvor Novo');
    });

    it('devolve o rascunho ao voltar da autorização', async () => {
      sessionStorage.setItem(
        'coldigom_rascunho_louvor',
        JSON.stringify({
          rota: '/praise/new',
          edit: { name: 'Louvor Novo', number: '42', author: '', rhythm: '', tonality: '', category: '', lyrics: '' },
          pendingTagIds: [],
          driveUrl: 'https://drive.google.com/drive/folders/abc',
        })
      );

      renderComQuery('/praise/new?auth=drive_connected');
      await screen.findByText('Novo louvor');

      await waitFor(() => {
        expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('Louvor Novo');
      });
      // Consumido: um F5 depois disso não deve ressuscitar o rascunho.
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeNull();
    });
  });

  describe('Catálogo de categorias indisponível', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    });

    it('avisa que falhou em vez de sumir em silêncio, e o retry refaz a busca', async () => {
      // O catch era vazio. Sem catálogo, o seletor de categoria fica sem opção, o
      // botão "Adicionar material" nunca habilita, e a mensagem do scan em lote
      // dizia "ainda carregando" — mentira: tinha falhado, e o "Tentar novamente"
      // só refazia o scan local, nunca a busca do catálogo.
      const user = userEvent.setup();
      (getMaterialKinds as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('rede caiu'))
        .mockResolvedValueOnce([{ id: 'kind1', name: 'Partitura' }]);

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
      });
      await user.click(screen.getByRole('button', { name: 'Editar' }));

      const aviso = await screen.findByText(/não foi possível carregar as categorias/i);
      expect(aviso).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Tentar carregar de novo' }));
      await waitFor(() => {
        expect(screen.queryByText(/não foi possível carregar as categorias/i)).toBeNull();
      });
      expect(getMaterialKinds).toHaveBeenCalledTimes(2);
    });
  });

  describe('Materiais (admin)', () => {
    beforeEach(() => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    });

    async function enterEditMode() {
      const user = userEvent.setup();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
      });
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      return user;
    }

    it('exibe botão Agrupar Louvor no modo edição e agrupa por praiseId', async () => {
      const targetId = '1c12786e-4d32-4e95-a136-d85266008e11';
      (groupPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPraiseDetail,
        group_id: targetId,
        group_members: [
          { id: targetId, tags: [{ id: 'tag3', name: 'GLTM' }] },
        ],
      });

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      expect(screen.getByRole('button', { name: 'Agrupar Louvor' })).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Agrupar Louvor' }));

      const input = screen.getByLabelText('ID do louvor a agrupar');
      await user.type(input, targetId);
      await user.click(screen.getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(groupPraise).toHaveBeenCalledWith(
          '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          targetId
        );
      });

      expect(screen.getByText('Louvores agrupados')).toBeTruthy();
      expect(screen.getByText('GLTM')).toBeTruthy();
      expect(screen.getByRole('link', { name: /GLTM/ })).toHaveAttribute(
        'href',
        `/praise/${targetId}`
      );
      expect(screen.getByRole('link', { name: /GLTM/ })).toHaveAttribute('target', '_blank');
    });

    it('exibe botão Mesclar quando logado', async () => {
      (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Mesclar' })).toBeTruthy();
      });
      expect(screen.getByRole('link', { name: 'Mesclar' })).toHaveAttribute(
        'href',
        '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/merge'
      );
    });

    it('exibe Baixar em ZIP ao lado de Editar quando logado', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Baixar em ZIP' })).toBeTruthy();
      });

      expect(screen.getByRole('link', { name: 'Baixar em ZIP' })).toHaveAttribute(
        'href',
        'http://localhost:8787/api/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/download.zip'
      );
    });

    it('não exibe Materiais (admin) fora do modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
      });

      expect(screen.queryByText('Materiais (admin)')).toBeNull();
    });

    it('exibe seções de adicionar material e importação em lote', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Materiais (admin)')).toBeTruthy();
      });
      expect(screen.getByRole('heading', { name: 'Adicionar material' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Importação em lote (pasta)' })).toBeTruthy();
      expect(screen.getByText(/A categoria de cada arquivo é inferida pelo nome/)).toBeTruthy();
    });

    it('usa PDF como tipo padrão e mostra seletor de arquivo', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      expect(screen.getByLabelText('Tipo do material')).toHaveTextContent('PDF');
      expect(screen.getByText('Escolher PDF')).toBeTruthy();
      expect(screen.queryByLabelText('Link do YouTube')).toBeNull();
    });

    it('ao selecionar YouTube exibe campo de link em vez de arquivo', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      await user.click(screen.getByLabelText('Tipo do material'));
      await user.click(screen.getByRole('option', { name: 'YouTube' }));
      expect(screen.getByLabelText('Link do YouTube')).toBeTruthy();
      expect(screen.queryByText('Escolher PDF')).toBeNull();
    });

    it('ao selecionar Cifra exibe placeholder e desabilita adicionar', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      await waitFor(() => {
        expect(screen.getByLabelText('Tipo do material')).toBeTruthy();
      });

      await user.click(screen.getByLabelText('Tipo do material'));
      await user.click(screen.getByRole('option', { name: 'Cifra' }));
      expect(screen.getByText('Editor de cifras — em breve')).toBeTruthy();

      const addPanel = screen.getByRole('heading', { name: 'Adicionar material' }).closest('.materials-panel');
      expect(addPanel).toBeTruthy();
      const addBtn = within(addPanel!).getByRole('button', { name: 'Adicionar material' });
      expect((addBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('o painel de admin lista os materiais que já existem, editáveis', async () => {
      // Este teste substitui um que afirmava a ausência do título
      // "Materiais cadastrados" — string que não existe em componente nenhum,
      // então ele não podia falhar por motivo algum.
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Materiais (admin)')).toBeTruthy();
      });

      // O PDF e o MP3 da fixture aparecem com edição inline, um seletor cada.
      expect(screen.getAllByLabelText('Categoria do material')).toHaveLength(2);
    });

    it('não exibe edição/remoção de material fora do modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

      await waitFor(() => {
        expect(screen.getByText('Partituras')).toBeTruthy();
        expect(screen.getByLabelText('Áudio')).toBeTruthy();
      });

      expect(screen.queryAllByLabelText('Categoria do material')).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Remover' })).toHaveLength(0);
    });

    it('exibe edição inline de categoria em Áudio e Partituras no modo edição', async () => {
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Partituras')).toBeTruthy();
        expect(screen.getByLabelText('Áudio')).toBeTruthy();
      });

      const categorySelects = screen.getAllByLabelText('Categoria do material');
      expect(categorySelects.length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByRole('button', { name: 'Remover' }).length).toBeGreaterThanOrEqual(2);
    });

    it('apagar material pergunta antes, e recusar não apaga nada', async () => {
      // Um clique apagava o material e o arquivo no R2, sem volta. Numa ferramenta
      // de gestão isso é perda de acervo por clique torto.
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
      try {
        renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
        const user = await enterEditMode();

        await waitFor(() => {
          expect(screen.getByText('Partituras')).toBeTruthy();
        });
        await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);

        expect(confirmar).toHaveBeenCalled();
        expect(confirmar.mock.calls[0][0]).toMatch(/permanentemente|definitiv/i);
        expect(deleteMaterial).not.toHaveBeenCalled();
      } finally {
        confirmar.mockRestore();
      }
    });

    it('apagar material segue em frente quando o usuário confirma', async () => {
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      try {
        (deleteMaterial as ReturnType<typeof vi.fn>).mockResolvedValue({
          ...mockPraiseDetail,
          materials: [],
        });
        renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
        const user = await enterEditMode();

        await waitFor(() => {
          expect(screen.getByText('Partituras')).toBeTruthy();
        });
        await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);

        await waitFor(() => {
          expect(deleteMaterial).toHaveBeenCalledTimes(1);
        });
      } finally {
        confirmar.mockRestore();
      }
    });

    it('salvar manda o token de versão que a tela carregou', async () => {
      // Sem token, duas pessoas editando o mesmo louvor: a última a salvar vence
      // em silêncio, e o trabalho da primeira some sem aviso. O editor de cifras
      // já tinha essa detecção; os metadados não.
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockPraiseDetail,
        updated_at: '2026-08-31 12:00:00',
      });
      (updatePraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      await waitFor(() => {
        expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('Grande Deus');
      });
      await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

      await waitFor(() => {
        expect(updatePraise).toHaveBeenCalledWith(
          '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          expect.objectContaining({ name: 'Grande Deus' }),
          '2026-08-31 12:00:00'
        );
      });
    });

    it('fechar a edição descarta o que não foi salvo', async () => {
      // `edit` é cópia derivada de `praise`, semeada uma única vez no fetch. Fechar a
      // edição só invertia `isEditing`: o valor alterado continuava lá, invisível.
      // Ao reabrir e salvar qualquer outro campo, o nome ia junto — o usuário achava
      // que tinha descartado, e gravava sem saber.
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      const campoNome = () => screen.getAllByRole('textbox')[0] as HTMLInputElement;
      await waitFor(() => {
        expect(campoNome().value).toBe('Grande Deus');
      });

      await user.clear(campoNome());
      await user.type(campoNome(), 'Aleluia 2');
      expect(campoNome().value).toBe('Aleluia 2');

      await user.click(screen.getByRole('button', { name: 'Fechar edição' }));
      await user.click(screen.getByRole('button', { name: 'Editar' }));

      expect(campoNome().value).toBe('Grande Deus');
    });

    it('não deixa salvar o louvor com o nome vazio', async () => {
      // A checagem de nome obrigatório existia só no ramo de criação. No de edição a
      // tela mandava assim mesmo e o usuário recebia de volta a frase do servidor,
      // em inglês, num app inteiramente em português.
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      const campoNome = () => screen.getAllByRole('textbox')[0] as HTMLInputElement;
      await waitFor(() => {
        expect(campoNome().value).toBe('Grande Deus');
      });
      await user.clear(campoNome());
      await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

      expect(await screen.findByText('Nome é obrigatório')).toBeTruthy();
      expect(updatePraise).not.toHaveBeenCalled();
    });

    it('subtag criada não é criada de novo quando só a associação falha', async () => {
      // "Criar e associar" são duas escritas: POST /api/tags e depois
      // POST /api/praises/:id/tags. Falhando a segunda, a mensagem culpava a
      // primeira ("Falha ao criar subtag") e os campos não eram limpos — clicar de
      // novo criava uma segunda tag de mesmo nome sob o mesmo pai, no catálogo que
      // todo mundo enxerga, e as duas ficavam indistinguíveis no dropdown.
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      (createTag as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'tag-nova',
        name: '4.2026',
        parent_id: 'tag1',
        parent_name: 'Coletânea',
      });
      (addPraiseTag as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha de rede'));

      await screen.findByText('Nova subtag');
      await user.click(screen.getByLabelText('Tag pai da subtag'));
      await user.click(screen.getByRole('option', { name: 'Coletânea' }));
      await user.type(screen.getByLabelText('Nome da subtag'), '4.2026');

      await user.click(screen.getByRole('button', { name: /Criar e associar|Associar/ }));
      await screen.findByText(/Falha de rede/);

      await user.click(screen.getByRole('button', { name: /Criar e associar|Associar/ }));
      await waitFor(() => {
        expect(addPraiseTag).toHaveBeenCalledTimes(2);
      });
      expect(createTag).toHaveBeenCalledTimes(1);
    });

    it('resposta de escrita antiga não ressuscita material já apagado', async () => {
      // Cada mutação devolve o louvor inteiro e chamava setPraise cru. As flags de
      // "ocupado" são separadas (tagsBusy, savingMaterials), então nada impedia duas
      // escritas ao mesmo tempo — e a resposta que chegasse por último vencia, mesmo
      // sendo a mais antiga. O PDF apagado no servidor voltava para a tela.
      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      const user = await enterEditMode();

      let resolverTag: (v: PraiseDetail) => void = () => {};
      (removePraiseTag as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<PraiseDetail>((resolve) => {
          resolverTag = resolve;
        })
      );
      const semPdf: PraiseDetail = {
        ...mockPraiseDetail,
        materials: mockPraiseDetail.materials.filter((m) => m.type !== 'pdf'),
      };
      (deleteMaterial as ReturnType<typeof vi.fn>).mockResolvedValue(semPdf);

      await waitFor(() => {
        expect(screen.getByText('Partituras')).toBeTruthy();
      });

      // Escrita 1: remover a tag — fica em voo.
      await user.click(screen.getByLabelText('Remover tag Coletânea'));
      // Escrita 2: remover o PDF — responde primeiro, tirando a seção da tela.
      const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
      await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
      confirmar.mockRestore();
      await waitFor(() => {
        expect(screen.queryByText('Partituras')).toBeNull();
      });

      // Só agora a escrita 1 responde, com o louvor de antes (o PDF ainda lá).
      resolverTag(mockPraiseDetail);

      await waitFor(() => {
        expect(removePraiseTag).toHaveBeenCalled();
      });
      expect(screen.queryByText('Partituras')).toBeNull();
    });

    it('exibe placeholder de edição em Acordes no modo edição', async () => {
      const praiseWithChords = {
        ...mockPraiseDetail,
        materials: [
          ...mockPraiseDetail.materials,
          {
            id: 'mat3',
            praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
            material_kind: 'kind3',
            material_kind_name: 'Acordes',
            type: 'chord' as const,
            r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
            file_path_legacy: 'path/to/file.chord',
            source_material_id: null,
          },
        ],
      };
      (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithChords);

      renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await enterEditMode();

      await waitFor(() => {
        expect(screen.getByText('Edição de categoria — em breve')).toBeTruthy();
      });
    });
  });

  it('should render chord materials when present', async () => {
    const praiseWithChords = {
      ...mockPraiseDetail,
      materials: [
        ...mockPraiseDetail.materials,
        {
          id: 'mat3',
          praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          material_kind: 'kind3',
          material_kind_name: 'Acordes',
          type: 'chord',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
          file_path_legacy: 'path/to/file.chord',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithChords);

    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await waitFor(() => {
      expect(screen.getAllByText('Acordes').length).toBeGreaterThan(0);
    });
  });

  function praiseWithChord(has_content: boolean | undefined) {
    return {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat3',
          praise_id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
          material_kind: 'kind3',
          material_kind_name: 'Cifra I',
          type: 'chord',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
          file_path_legacy: 'path/to/file.chord',
          source_material_id: null,
          ...(has_content === undefined ? {} : { has_content }),
        },
      ],
    };
  }

  it('o card de cifra linka para a página dedicada, não para o arquivo cru', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithChord(true));
    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    const link = await screen.findByRole('link', { name: /Cifra I/ });
    expect(link).toHaveAttribute(
      'href',
      '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/cifra/mat3'
    );
  });

  it('cifra sem conteúdo aparece marcada e continua clicável', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseWithChord(false));
    renderWithRouter('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    const link = await screen.findByRole('link', { name: /Cifra I/ });
    expect(link).toHaveAttribute(
      'href',
      '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/cifra/mat3'
    );
    expect(screen.getByText(/sem conte\u00fado/i)).toBeInTheDocument();
  });
});

describe('Materiais de tipo fora dos quatro com apresentação própria', () => {
  // A API aceita qualquer tipo `^[a-z0-9]{1,16}$` (api/src/uploadLimits.ts) porque o
  // acervo tem mid, gestures, txt e link vindos de ingestão legada, e a importação
  // em lote infere o tipo pela extensão do arquivo. A tela só sabia desenhar quatro.
  const praiseComMid: PraiseDetail = {
    ...mockPraiseDetail,
    materials: [
      {
        id: 'mat-mid',
        praise_id: mockPraiseDetail.id,
        material_kind: 'kind1',
        material_kind_name: 'Coral',
        type: 'mid',
        r2_key: `assets/praises/${mockPraiseDetail.id}/mat-mid.mid`,
        file_path_legacy: 'Louvor/Coral.mid',
        source_material_id: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComMid);
  });

  function render1(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/praise/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it('exibe o material em vez de descartá-lo em silêncio', async () => {
    render1(mockPraiseDetail.id);

    // Espera o carregamento terminar antes de afirmar qualquer ausência/presença.
    await screen.findByText('Grande Deus');

    expect(screen.getByText('Outros materiais')).toBeTruthy();
    expect(screen.getByText('Coral')).toBeTruthy();
  });

  it('oferece link para abrir o arquivo guardado', async () => {
    render1(mockPraiseDetail.id);
    await screen.findByText('Grande Deus');

    const link = screen.getByRole('link', { name: /Coral/ });
    expect(link.getAttribute('href')).toContain('mat-mid.mid');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('permite trocar a categoria e remover no modo edição', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      sub: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin Teste',
    });
    const user = userEvent.setup();
    render1(mockPraiseDetail.id);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await waitFor(() => {
      expect(screen.getByText('Outros materiais')).toBeTruthy();
    });
    expect(screen.getAllByLabelText('Categoria do material').length).toBeGreaterThanOrEqual(1);
  });
});

describe('acessibilidade do formulário e dos materiais', () => {
  function render2(id: string) {
    return render(
      <MemoryRouter initialEntries={[`/praise/${id}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('cada campo de metadado tem nome acessível', async () => {
    // Eram `<label>Nome</label>` com o `<input>` como IRMÃO: sem `htmlFor` e sem
    // envolver o campo, nenhum dos seis tinha nome. Quem usa leitor de tela ouvia
    // "campo de edição, em branco" seis vezes e não sabia qual era qual; quem usa
    // Controle por Voz não conseguia dizer "clique em Nome". É o formulário
    // central de um CRUD.
    const user = userEvent.setup();
    render2('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Editar' })[0]).toBeTruthy();
    });
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);

    for (const rotulo of ['Nome', 'Número', 'Autor', 'Ritmo', 'Tom', 'Categoria']) {
      expect(screen.getAllByLabelText(rotulo).length).toBeGreaterThan(0);
    }
  });

  it('a página tem um landmark principal', async () => {
    render2('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await screen.findByText('Grande Deus');
    expect(screen.getByRole('main')).toBeTruthy();
  });
});
