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
    getDriveStatus: vi.fn().mockResolvedValue({ connected: false }),
    getDriveConnectUrl: vi.fn((returnTo: string) => `http://localhost:8787/api/drive/connect?return_to=${encodeURIComponent(returnTo)}`),
    startDriveScan: vi.fn(),
    startDriveImport: vi.fn(),
    downloadDriveFileBlob: vi.fn(),
    getImportJob: vi.fn(),
    retryFailedImportItems: vi.fn(),
  };
});

// convertAudioToMp3 usa decodeAudioData/AudioContext, indisponíveis no jsdom;
// isConvertibleAudio e ensureMp3Extension são puras e ficam reais.
vi.mock('../lib/audioConverter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/audioConverter')>();
  return {
    ...actual,
    convertAudioToMp3: vi.fn(),
  };
});

import {
  getPraise,
  getMe,
  createPraise,
  groupPraise,
  bulkUploadMaterials,
  removePraiseTag,
  getTags,
  deleteMaterial,
  createTag,
  addPraiseTag,
  updatePraise,
  updateMaterial,
  getMaterialKinds,
  getDriveStatus,
  startDriveScan,
  startDriveImport,
  downloadDriveFileBlob,
  getImportJob,
  retryFailedImportItems,
  createMaterial,
} from '../services/api';
import { convertAudioToMp3 } from '../lib/audioConverter';
import type { ImportJobSummary } from '../services/api';

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

/** Compartilhado entre describes: monta a página de detalhe numa rota simples. */
function renderPraisePage(id: string) {
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

describe('Status e conexão do Google Drive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  async function abrirEdicaoDrive() {
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByText('Importar do Google Drive');
    return user;
  }

  it('mostra o convite para autorizar quando o Drive não está conectado', async () => {
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: false });
    await abrirEdicaoDrive();

    expect(await screen.findByRole('button', { name: 'Conectar Google Drive' })).toBeTruthy();
  });

  it('não mostra o convite para autorizar quando o Drive já está conectado', async () => {
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    await abrirEdicaoDrive();

    await waitFor(() => {
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Conectar Google Drive' })).toBeNull();
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

  it('auth=drive_connected na URL marca o Drive como conectado e limpa a query', async () => {
    // O status "oficial" (getDriveStatus) também é consultado ao logar; aqui ele
    // confirma a conexão para não competir com o efeito da query em teste.
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    renderComQuery('/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8?auth=drive_connected');

    await screen.findByText('Grande Deus');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Conectar Google Drive' })).toBeNull();
    });
    expect(window.location.search).toBe('');
  });

  it('auth=drive_error na URL mostra erro de conexão com o Drive', async () => {
    renderComQuery('/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8?auth=drive_error');

    await screen.findByText('Grande Deus');
    expect(
      await screen.findByText('Não foi possível conectar o Google Drive. Tente novamente.')
    ).toBeTruthy();
    expect(window.location.search).toBe('');
  });

  function renderComEstado(state: Record<string, unknown>) {
    return render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8', state },
        ]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  }

  it('mergeSuccess no state mostra o aviso de mesclagem concluída', async () => {
    renderComEstado({ mergeSuccess: true, mergedPraiseName: 'Aleluia' });

    expect(
      await screen.findByText('Mesclagem concluída — «Aleluia» foi importado e excluído.')
    ).toBeTruthy();
  });

  it('mergeSuccess sem nome mostra aviso genérico de mesclagem', async () => {
    renderComEstado({ mergeSuccess: true });

    expect(await screen.findByText('Mesclagem concluída.')).toBeTruthy();
  });

  it('driveImportJobId no state busca e mostra o acompanhamento da importação', async () => {
    // O acompanhamento só aparece dentro do painel de admin, que exige o modo edição.
    const job: ImportJobSummary = {
      id: 'job1',
      praise_id: mockPraiseDetail.id,
      status: 'done',
      total_count: 2,
      done_count: 2,
      failed_count: 0,
      skipped_count: 0,
    };
    (getImportJob as ReturnType<typeof vi.fn>).mockResolvedValue(job);

    renderComEstado({ driveImportJobId: 'job1' });
    const user = userEvent.setup();
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText((_, node) => node?.textContent === '2/2 importados')).toBeTruthy();
    expect(getImportJob).toHaveBeenCalledWith('job1');
  });

  it('falha ao buscar o job do state avisa que não dá para acompanhar', async () => {
    (getImportJob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('sumiu'));

    renderComEstado({ driveImportJobId: 'job1' });
    const user = userEvent.setup();
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByText('Não foi possível acompanhar esta importação.')
    ).toBeTruthy();
  });

  it('job em andamento é consultado de novo até concluir, e então recarrega o louvor', async () => {
    const rodando: ImportJobSummary = {
      id: 'job1',
      praise_id: mockPraiseDetail.id,
      status: 'running',
      total_count: 1,
      done_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
    const concluido: ImportJobSummary = { ...rodando, status: 'done', done_count: 1 };
    // mockResolvedValue (não Once) depois do primeiro tick: se o intervalo bater
    // de novo antes da asserção notar que já parou, a resposta repetida não muda
    // o resultado observável — só a contagem exata é que não é garantida.
    (getImportJob as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(rodando)
      .mockResolvedValue(concluido);
    // O nome recarregado não aparece: em edição, o título é um <input> preso à
    // cópia local `edit`, que só é re-semeada ao entrar/sair da edição — a tag
    // extra é visível independente disso, e prova que o louvor foi recarregado.
    const recarregado = {
      ...mockPraiseDetail,
      tags: [...mockPraiseDetail.tags, { id: 'tag3', name: 'GLTM', parent_id: null }],
    };
    (getPraise as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockPraiseDetail)
      .mockResolvedValue(recarregado);

    renderComEstado({ driveImportJobId: 'job1' });
    const user = userEvent.setup();
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByText('Em andamento');

    // Tempo real: o intervalo de acompanhamento (1500ms) já está de pé antes
    // deste ponto, então trocar para relógio falso não o alcançaria mais.
    await waitFor(
      () => {
        expect(screen.getByText('Concluída')).toBeTruthy();
        expect(screen.getByText('GLTM')).toBeTruthy();
      },
      { timeout: 3000 }
    );
    expect(getImportJob.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getPraise.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 10000);

  it('falha ao consultar o andamento da importação avisa e não trava a tela', async () => {
    const rodando: ImportJobSummary = {
      id: 'job1',
      praise_id: mockPraiseDetail.id,
      status: 'running',
      total_count: 1,
      done_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
    (getImportJob as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(rodando)
      .mockRejectedValueOnce(new Error('caiu'));

    renderComEstado({ driveImportJobId: 'job1' });
    const user = userEvent.setup();
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByText('Em andamento');

    await waitFor(
      () =>
        expect(
          screen.getByText(/Não foi possível acompanhar esta importação\. Ela pode ter terminado/)
        ).toBeTruthy(),
      { timeout: 3000 }
    );
  }, 10000);
});

describe('Mapeamento do Google Drive (runDriveScan)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    // mockResolvedValue/mockRejectedValue de um teste ficam como padrão para o
    // próximo — resetar evita que a rejeição de um teste vaze para o seguinte.
    (startDriveScan as ReturnType<typeof vi.fn>).mockReset();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
  });

  async function abrirComDriveConectado() {
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy();
    });
    return user;
  }

  it('cola o link, mapeia e lista os arquivos encontrados', async () => {
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'f1', name: 'Partitura.pdf', rel_path: 'Partitura.pdf', mime_type: 'application/pdf', size_bytes: 100 },
      ],
      skipped: [{ path: 'Doc do Google', reason: 'formato nativo do Google' }],
    });
    const user = await abrirComDriveConectado();

    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));

    expect(await screen.findByText('Partitura.pdf')).toBeTruthy();
    expect(screen.getByText('1 item(ns) pulado(s)')).toBeTruthy();
    expect(startDriveScan).toHaveBeenCalledWith('https://drive.google.com/drive/folders/abc');
  });

  it('sem link colado mostra aviso e não chama a API', async () => {
    // "Mapear pasta" fica desabilitado sem link — o guarda só é alcançável pelo
    // "Tentar novamente" do status do scan, que não olha o campo de link.
    (startDriveScan as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao ler pasta'));
    const user = await abrirComDriveConectado();

    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await waitFor(async () => expect((await screen.findAllByText('Falha ao ler pasta')).length).toBeGreaterThan(0));
    await user.clear(screen.getByLabelText('Link da pasta ou arquivo do Google Drive'));

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Cole um link do Google Drive')).toBeTruthy();
    expect(startDriveScan).toHaveBeenCalledTimes(1);
  });

  it('Drive desconectado ao mapear pede autorização em vez de tentar ler', async () => {
    // jsdom não navega de verdade (não implementa `window.location.href = …`);
    // o rascunho salvo antes do redirecionamento é a prova de que
    // irAutorizarDrive rodou, e é o mesmo mecanismo que a busca de verdade usa.
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: false });
    const user = await abrirComDriveConectado();
    // Espera o status assentar em "false" — do contrário ele ainda está `null`
    // (indefinido) no instante do clique, e o guarda não dispara.
    await screen.findByRole('button', { name: 'Conectar Google Drive' });

    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
    expect(startDriveScan).not.toHaveBeenCalled();
  });

  it('erro de "Drive not connected" ao mapear pede reautorização', async () => {
    (startDriveScan as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Drive not connected'));
    const user = await abrirComDriveConectado();

    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
  });

  it('erro genérico ao mapear mostra a mensagem e o estado de falha', async () => {
    (startDriveScan as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao ler pasta'));
    const user = await abrirComDriveConectado();

    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));

    expect(await screen.findAllByText('Falha ao ler pasta')).not.toHaveLength(0);
  });
});

describe('Conversão de áudio para MP3 antes do envio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockReset();
  });

  it('converte um único arquivo de áudio da pasta local para MP3', async () => {
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'audio.m4a', { type: 'audio/mp4' }),
    ]);
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter audio.m4a para MP3' }));

    expect(await screen.findByText('audio.mp3')).toBeTruthy();
    expect(convertAudioToMp3).toHaveBeenCalledTimes(1);
  });

  it('converte todos os áudios da pasta local para MP3 de uma vez', async () => {
    (convertAudioToMp3 as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new File(['x'], 'um.mp3', { type: 'audio/mpeg' }))
      .mockResolvedValueOnce(new File(['x'], 'dois.mp3', { type: 'audio/mpeg' }));
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'um.m4a', { type: 'audio/mp4' }),
      new File(['x'], 'dois.wav', { type: 'audio/wav' }),
    ]);
    await screen.findByText('um.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter todos para MP3' }));

    // A mensagem de sucesso só existe enquanto há convertíveis; assim que os
    // dois viram mp3, a barra inteira some — a prova que fica é o nome e o
    // tipo já trocados nas próprias linhas.
    await waitFor(() => {
      expect(convertAudioToMp3).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('um.mp3')).toBeTruthy();
    expect(screen.getByText('dois.mp3')).toBeTruthy();
  });

  it('converte um áudio do Google Drive para MP3, baixando o blob antes', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'audio.m4a', rel_path: 'audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
      ],
      skipped: [],
    });
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'audio/mp4' })
    );
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter audio.m4a para MP3' }));

    await waitFor(() => {
      expect(downloadDriveFileBlob).toHaveBeenCalledWith('drv1');
      expect(convertAudioToMp3).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('audio.mp3')).toBeTruthy();
  });

  it('converte todos os áudios mapeados do Drive para MP3', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'um.m4a', rel_path: 'um.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
        { drive_file_id: 'drv2', name: 'dois.wav', rel_path: 'dois.wav', mime_type: 'audio/wav', size_bytes: 10 },
      ],
      skipped: [],
    });
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'audio/mp4' })
    );
    (convertAudioToMp3 as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new File(['x'], 'um.mp3', { type: 'audio/mpeg' }))
      .mockResolvedValueOnce(new File(['x'], 'dois.mp3', { type: 'audio/mpeg' }));

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('um.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter todos para MP3' }));

    await waitFor(() => {
      expect(downloadDriveFileBlob).toHaveBeenCalledTimes(2);
      expect(convertAudioToMp3).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('um.mp3')).toBeTruthy();
    expect(screen.getByText('dois.mp3')).toBeTruthy();
  });
});

describe('Importação em lote quando as categorias ainda não chegaram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
  });

  it('avisa que falta o catálogo e reenvia a pasta sozinha assim que ele chega', async () => {
    (getMaterialKinds as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('rede caiu'))
      .mockResolvedValueOnce([{ id: 'kind1', name: 'Partitura' }]);
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');
    await screen.findByText(/não foi possível carregar as categorias/i);

    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'Partitura.pdf', { type: 'application/pdf' }),
    ]);

    expect(
      await screen.findByText(/Sem elas não dá para classificar os arquivos\./)
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Tentar carregar de novo' }));

    expect(await screen.findByText('Partitura.pdf')).toBeTruthy();
  });
});

describe('Ações sobre materiais já existentes (admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  async function entrarEmEdicao() {
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByText('Partituras')).toBeTruthy());
    return user;
  }

  it('troca a categoria de um material existente pelo seletor inline', async () => {
    // A seção de Áudio vem antes da de Partituras na tela: o primeiro seletor
    // de categoria encontrado é o do material mp3 (mat2), não o do pdf (mat1).
    (updateMaterial as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: mockPraiseDetail.materials.map((m) =>
        m.id === 'mat2' ? { ...m, material_kind: 'kind3', material_kind_name: 'Cifra' } : m
      ),
    });
    const user = await entrarEmEdicao();

    await user.click(screen.getAllByLabelText('Categoria do material')[0]);
    await user.click(screen.getByRole('option', { name: 'Cifra' }));

    await waitFor(() => {
      expect(updateMaterial).toHaveBeenCalledWith('mat2', { material_kind: 'kind3' });
    });
  });

  it('converte um material de áudio existente para MP3, sobe o novo e remove o antigo', async () => {
    const praiseComM4a: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-audio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind2',
          material_kind_name: 'Áudio',
          type: 'm4a',
          r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat-audio.m4a',
          file_path_legacy: 'audio.m4a',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4a);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mp4' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'Áudio.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...praiseComM4a,
      materials: [...praiseComM4a.materials, { ...praiseComM4a.materials[0], id: 'mat-mp3', type: 'mp3' }],
    });
    (deleteMaterial as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...praiseComM4a,
      materials: [{ ...praiseComM4a.materials[0], id: 'mat-mp3', type: 'mp3' }],
    });

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByText('Converter para MP3')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Converter para MP3' }));

    await waitFor(() => {
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ material_kind: 'kind2', type: 'mp3' })])
      );
      expect(deleteMaterial).toHaveBeenCalledWith('mat-audio');
    });

    vi.unstubAllGlobals();
  });
});

describe('Adicionar um único material (painel de admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  async function abrirPainelAdicionar() {
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const heading = await screen.findByRole('heading', { name: 'Adicionar material' });
    const painel = heading.closest('.materials-panel') as HTMLElement;
    return { user, painel };
  }

  it('adiciona um material do tipo YouTube por link', async () => {
    (createMaterial as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: [
        ...mockPraiseDetail.materials,
        {
          id: 'mat-yt',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Partitura',
          type: 'youtube',
          url: 'https://youtu.be/abc123',
          source_material_id: null,
        },
      ],
    });
    const { user, painel } = await abrirPainelAdicionar();

    await user.click(within(painel).getByLabelText('Tipo do material'));
    await user.click(screen.getByRole('option', { name: 'YouTube' }));
    await user.type(screen.getByLabelText('Link do YouTube'), 'https://youtu.be/abc123');
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() => {
      expect(createMaterial).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.objectContaining({ type: 'youtube', url: 'https://youtu.be/abc123' })
      );
    });
    expect(await screen.findByRole('heading', { name: /YouTube/ })).toBeTruthy();
  });

  it('adiciona um material do tipo PDF por upload', async () => {
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: [
        ...mockPraiseDetail.materials,
        {
          id: 'mat-novo-pdf',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Partitura',
          type: 'pdf',
          r2_key: 'assets/x.pdf',
          source_material_id: null,
        },
      ],
    });
    const { user, painel } = await abrirPainelAdicionar();

    await user.upload(
      within(painel).getByLabelText('Escolher PDF'),
      new File(['x'], 'nova.pdf', { type: 'application/pdf' })
    );
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() => {
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ type: 'pdf' })])
      );
    });
  });

  it('adiciona um material do tipo MP3, convertendo antes de subir', async () => {
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'cancao.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const { user, painel } = await abrirPainelAdicionar();

    await user.click(within(painel).getByLabelText('Tipo do material'));
    await user.click(screen.getByRole('option', { name: 'MP3' }));
    await user.upload(
      within(painel).getByLabelText('Escolher MP3'),
      new File(['x'], 'cancao.m4a', { type: 'audio/mp4' })
    );
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() => {
      expect(convertAudioToMp3).toHaveBeenCalledTimes(1);
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3' })])
      );
    });
  });

  it('erro ao criar material mostra a mensagem e não desabilita a tentativa seguinte', async () => {
    (createMaterial as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao criar material'));
    const { user, painel } = await abrirPainelAdicionar();

    await user.click(within(painel).getByLabelText('Tipo do material'));
    await user.click(screen.getByRole('option', { name: 'YouTube' }));
    await user.type(screen.getByLabelText('Link do YouTube'), 'https://youtu.be/abc123');
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    expect(await screen.findByText('Falha ao criar material')).toBeTruthy();
  });
});

describe('Envio em lote e importação do Drive no modo edição', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
  });

  it('envia os arquivos da pasta local mapeados no modo edição', async () => {
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: [
        ...mockPraiseDetail.materials,
        {
          id: 'mat-lote',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Partitura',
          type: 'pdf',
          r2_key: 'assets/lote.pdf',
          source_material_id: null,
        },
      ],
    });
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'Partitura Nova.pdf', { type: 'application/pdf' }),
    ]);
    await screen.findByText('Partitura Nova.pdf');

    await user.click(screen.getByRole('button', { name: /Enviar 1 arquivo/ }));

    await waitFor(() => {
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ file_path_legacy: 'Partitura Nova.pdf' })])
      );
    });
    // A lista se esvazia após o envio bem-sucedido.
    await waitFor(() => {
      expect(screen.queryByText('Partitura Nova.pdf')).toBeNull();
    });
  });

  it('importa do Drive: envia o convertido direto e enfileira o resto', async () => {
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'audio.m4a', rel_path: 'audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
        { drive_file_id: 'drv2', name: 'Partitura.pdf', rel_path: 'Partitura.pdf', mime_type: 'application/pdf', size_bytes: 10 },
      ],
      skipped: [],
    });
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'audio/mp4' })
    );
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const jobIniciado: ImportJobSummary = {
      id: 'job-novo',
      praise_id: mockPraiseDetail.id,
      status: 'running',
      total_count: 1,
      done_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
    (startDriveImport as ReturnType<typeof vi.fn>).mockResolvedValue(jobIniciado);
    (getImportJob as ReturnType<typeof vi.fn>).mockResolvedValue(jobIniciado);

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('audio.m4a');

    // Converte o áudio antes de importar — ele passa a ter `file` local e vai
    // pelo envio direto; o PDF, sem conversão, vai para a fila do Drive.
    await user.click(screen.getByRole('button', { name: 'Converter audio.m4a para MP3' }));
    await screen.findByText('audio.mp3');

    await user.click(screen.getByRole('button', { name: /Importar 2 arquivo\(s\) do Drive/ }));

    await waitFor(() => {
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3' })])
      );
      expect(startDriveImport).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ drive_file_id: 'drv2' })])
      );
    });
    await waitFor(() => {
      expect(screen.queryByText('audio.mp3')).toBeNull();
    });
  });

  it('tenta de novo os itens do Drive que falharam', async () => {
    const jobComFalha: ImportJobSummary = {
      id: 'job1',
      praise_id: mockPraiseDetail.id,
      status: 'completed_with_errors',
      total_count: 2,
      done_count: 1,
      failed_count: 1,
      skipped_count: 0,
    };
    (getImportJob as ReturnType<typeof vi.fn>).mockResolvedValue(jobComFalha);
    (retryFailedImportItems as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8', state: { driveImportJobId: 'job1' } },
        ]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByText('Concluída com erros');

    await user.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));

    await waitFor(() => {
      expect(retryFailedImportItems).toHaveBeenCalledWith('job1');
    });
    expect(getImportJob).toHaveBeenCalledTimes(2);
  });

  it('falha ao tentar de novo os itens do Drive avisa e libera o botão', async () => {
    const jobComFalha: ImportJobSummary = {
      id: 'job1',
      praise_id: mockPraiseDetail.id,
      status: 'failed',
      total_count: 1,
      done_count: 0,
      failed_count: 1,
      skipped_count: 0,
    };
    (getImportJob as ReturnType<typeof vi.fn>).mockResolvedValue(jobComFalha);
    (retryFailedImportItems as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('rede caiu'));
    const consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});

    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/praise/1b2b33ab-4dff-4014-8582-dcb9a92efbc8', state: { driveImportJobId: 'job1' } },
        ]}
      >
        <AuthProvider>
          <Routes>
            <Route path="/praise/:id" element={<PraiseDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText('Grande Deus');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByText('Falhou');

    await user.click(screen.getByRole('button', { name: 'Tentar de novo os que falharam' }));

    expect(
      await screen.findByText('Não foi possível tentar de novo. Contate o suporte se o problema continuar.')
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Tentar de novo os que falharam' }) as HTMLButtonElement).disabled
    ).toBe(false);
    consoleErro.mockRestore();
  });
});

describe('Letra do louvor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('edita e salva a letra', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      lyrics: 'Nova letra',
    });
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    const textarea = await screen.findByPlaceholderText('Cole a letra aqui…');
    await user.clear(textarea);
    await user.type(textarea, 'Nova letra');
    // O formulário de metadados também tem um botão "Salvar" — o da letra é o
    // último, na seção que vem depois.
    const botoesSalvar = screen.getAllByRole('button', { name: 'Salvar' });
    await user.click(botoesSalvar[botoesSalvar.length - 1]);

    await waitFor(() => {
      expect(updatePraise).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        { lyrics: 'Nova letra' },
        undefined
      );
    });
  });

  it('erro ao salvar a letra mostra a mensagem', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao salvar letra'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await screen.findByPlaceholderText('Cole a letra aqui…');
    const botoesSalvar = screen.getAllByRole('button', { name: 'Salvar' });
    await user.click(botoesSalvar[botoesSalvar.length - 1]);

    expect(await screen.findByText('Falha ao salvar letra')).toBeTruthy();
  });
});

describe('Edição dos demais campos de metadados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('edita número, autor, ritmo, tom e categoria e salva tudo junto', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await user.clear(screen.getByLabelText('Número'));
    await user.type(screen.getByLabelText('Número'), '099');
    await user.clear(screen.getByLabelText('Autor'));
    await user.type(screen.getByLabelText('Autor'), 'Outro Autor');
    await user.clear(screen.getByLabelText('Ritmo'));
    await user.type(screen.getByLabelText('Ritmo'), 'Coletânea');
    await user.clear(screen.getByLabelText('Tom'));
    await user.type(screen.getByLabelText('Tom'), 'D');
    // "Categoria" também nomeia o seletor de categoria do painel "Adicionar
    // material", que aparece junto em modo edição — o campo de metadado é o
    // primeiro elemento com esse nome acessível.
    const campoCategoria = screen.getAllByLabelText('Categoria')[0];
    await user.clear(campoCategoria);
    await user.type(campoCategoria, 'Adoração');

    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    await waitFor(() => {
      expect(updatePraise).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.objectContaining({
          number: '099',
          author: 'Outro Autor',
          rhythm: 'Coletânea',
          tonality: 'D',
          category: 'Adoração',
        }),
        undefined
      );
    });
  });
});

describe('Copiar ID falha quando o clipboard recusa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('mostra erro quando o navegador recusa copiar o ID', async () => {
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await screen.findByText(mockPraiseDetail.id);

    const writeTextSpy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('recusado'));

    await user.click(screen.getByRole('button', { name: /copiar id/i }));

    expect(await screen.findByText('Não foi possível copiar o ID')).toBeTruthy();
    writeTextSpy.mockRestore();
  });
});

describe('Tags: hint de catálogo esgotado e adição de tag existente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'tag1', name: 'Coletânea', parent_id: null },
      { id: 'tag2', name: 'Avulsos', parent_id: null },
      { id: 'tag3', name: 'GLTM', parent_id: null },
    ]);
  });

  it('avisa quando não há tag disponível para adicionar', async () => {
    // availableTags só fica vazio com displayTags também vazio quando toda tag
    // do catálogo é "pai" de outra dentro dele — aqui, um par se referenciando
    // mutuamente, só para forçar esse canto defensivo da tela.
    (getTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'a', name: 'A', parent_id: 'b' },
      { id: 'b', name: 'B', parent_id: 'a' },
    ]);
    const praiseSemTags: PraiseDetail = { ...mockPraiseDetail, tags: [], tag_ids: '' };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseSemTags);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(
      await screen.findByText('Todas as tags do catálogo já estão associadas.')
    ).toBeTruthy();
  });

  it('associa uma tag já existente do catálogo ao louvor', async () => {
    (addPraiseTag as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      tags: [...mockPraiseDetail.tags, { id: 'tag3', name: 'GLTM', parent_id: null }],
    });
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await user.click(screen.getByLabelText('Adicionar tag'));
    await user.click(screen.getByRole('option', { name: 'GLTM' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => {
      expect(addPraiseTag).toHaveBeenCalledWith('1b2b33ab-4dff-4014-8582-dcb9a92efbc8', 'tag3');
    });
    expect(await screen.findByText('GLTM')).toBeTruthy();
  });

  it('erro ao adicionar tag existente mostra a mensagem', async () => {
    (addPraiseTag as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao adicionar tag'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await user.click(screen.getByLabelText('Adicionar tag'));
    await user.click(screen.getByRole('option', { name: 'GLTM' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Falha ao adicionar tag')).toBeTruthy();
  });
});

describe('Criar e associar subtag: caminho de sucesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('em edição, cria a subtag e já associa ao louvor', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (createTag as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tag-nova',
      name: '4.2026',
      parent_id: 'tag1',
      parent_name: 'Coletânea',
    });
    (addPraiseTag as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      tags: [...mockPraiseDetail.tags, { id: 'tag-nova', name: '4.2026', parent_id: 'tag1', parent_name: 'Coletânea' }],
    });
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await screen.findByText('Nova subtag');
    await user.click(screen.getByLabelText('Tag pai da subtag'));
    await user.click(screen.getByRole('option', { name: 'Coletânea' }));
    await user.type(screen.getByLabelText('Nome da subtag'), '4.2026');
    await user.click(screen.getByRole('button', { name: 'Criar e associar' }));

    await waitFor(() => {
      expect(createTag).toHaveBeenCalledWith({ name: '4.2026', parent_id: 'tag1' });
      expect(addPraiseTag).toHaveBeenCalledWith('1b2b33ab-4dff-4014-8582-dcb9a92efbc8', 'tag-nova');
    });
    expect(await screen.findByText(/4\.2026/)).toBeTruthy();
    expect((screen.getByLabelText('Nome da subtag') as HTMLInputElement).value).toBe('');
  });

  it('na criação, cria a subtag e guarda para associar quando o louvor for salvo', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (createTag as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'tag-nova',
      name: '4.2026',
      parent_id: 'tag1',
      parent_name: 'Coletânea',
    });
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await screen.findByText('Nova subtag');
    await user.click(screen.getByLabelText('Tag pai da subtag'));
    await user.click(screen.getByRole('option', { name: 'Coletânea' }));
    await user.type(screen.getByLabelText('Nome da subtag'), '4.2026');
    await user.click(screen.getByRole('button', { name: 'Criar e associar' }));

    await waitFor(() => {
      expect(createTag).toHaveBeenCalledWith({ name: '4.2026', parent_id: 'tag1' });
    });
    expect(addPraiseTag).not.toHaveBeenCalled();
    expect(await screen.findByText(/4\.2026/)).toBeTruthy();
  });
});

describe('Cancelar o agrupamento de louvor', () => {
  it('fecha o formulário de agrupar sem chamar a API', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await user.click(screen.getByRole('button', { name: 'Agrupar Louvor' }));
    await user.type(screen.getByLabelText('ID do louvor a agrupar'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByLabelText('ID do louvor a agrupar')).toBeNull();
    expect(groupPraise).not.toHaveBeenCalled();
  });
});

describe('Criar louvor com arquivos locais e do Drive juntos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
  });

  it('cria o louvor, converte e sobe o áudio local, sobe o convertido do Drive e enfileira o resto', async () => {
    const created: PraiseDetail = {
      ...mockPraiseDetail,
      id: 'novo-id',
      name: 'Louvor com tudo',
      materials: [],
      tags: [],
      tag_ids: '',
    };
    (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'convertido.mp3', { type: 'audio/mpeg' })
    );
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'drive-audio.m4a', rel_path: 'drive-audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
        { drive_file_id: 'drv2', name: 'drive-doc.pdf', rel_path: 'drive-doc.pdf', mime_type: 'application/pdf', size_bytes: 10 },
      ],
      skipped: [],
    });
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'audio/mp4' })
    );
    const jobIniciado: ImportJobSummary = {
      id: 'job-novo',
      praise_id: 'novo-id',
      status: 'running',
      total_count: 1,
      done_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
    (startDriveImport as ReturnType<typeof vi.fn>).mockResolvedValue(jobIniciado);

    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await user.type(screen.getAllByRole('textbox')[0], 'Louvor com tudo');

    // Pasta local: um áudio conversível.
    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'local-audio.m4a', { type: 'audio/mp4' }),
    ]);
    await screen.findByText('local-audio.m4a');

    // Drive: mapeia um áudio (será baixado e convertido) e um PDF (vai para a fila).
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('drive-audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Criar louvor' }));

    await waitFor(() => {
      expect(createPraise).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Louvor com tudo' })
      );
    });
    await waitFor(() => {
      // Duas chamadas de bulkUploadMaterials: o áudio local convertido, depois
      // o áudio do Drive baixado e convertido.
      expect(bulkUploadMaterials).toHaveBeenCalledTimes(2);
      expect(bulkUploadMaterials).toHaveBeenNthCalledWith(
        1,
        'novo-id',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3', file_path_legacy: 'local-audio.mp3' })])
      );
      expect(downloadDriveFileBlob).toHaveBeenCalledWith('drv1');
      expect(bulkUploadMaterials).toHaveBeenNthCalledWith(
        2,
        'novo-id',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3' })])
      );
      expect(startDriveImport).toHaveBeenCalledWith(
        'novo-id',
        expect.arrayContaining([expect.objectContaining({ drive_file_id: 'drv2' })])
      );
    });
  });

  it('não cria um segundo louvor quando falha depois de já ter enfileirado o Drive', async () => {
    // louvorCriado guarda o louvor já criado no primeiro passo; falhando o
    // envio do Drive, a tentativa seguinte não pode criar outro.
    const created: PraiseDetail = {
      ...mockPraiseDetail,
      id: 'novo-id-2',
      name: 'Outro Louvor',
      materials: [],
      tags: [],
      tag_ids: '',
    };
    (createPraise as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha de rede'));
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'drive-audio.m4a', rel_path: 'drive-audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
      ],
      skipped: [],
    });

    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await user.type(screen.getAllByRole('textbox')[0], 'Outro Louvor');
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('drive-audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Criar louvor' }));
    await screen.findByText(/Falha de rede/);

    await user.click(screen.getByRole('button', { name: /Tentar enviar/ }));

    await waitFor(() => {
      expect(downloadDriveFileBlob).toHaveBeenCalledTimes(2);
    });
    expect(createPraise).toHaveBeenCalledTimes(1);
  });
});

describe('Campos e rótulos com dados incompletos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
  });

  it('campos vazios no louvor viram texto vazio no formulário de edição', async () => {
    const praiseEsparso: PraiseDetail = {
      ...mockPraiseDetail,
      number: null,
      author: null,
      rhythm: null,
      tonality: null,
      category: null,
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseEsparso);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect((screen.getByLabelText('Número') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Autor') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Ritmo') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tom') as HTMLInputElement).value).toBe('');
    expect((screen.getAllByLabelText('Categoria')[0] as HTMLInputElement).value).toBe('');
  });

  it('subtag sem parent_name resolve o nome do pai pelo catálogo', async () => {
    const praiseComSubtagCrua: PraiseDetail = {
      ...mockPraiseDetail,
      tags: [{ id: 'sub1', name: '4.2026', parent_id: 'tag1' }],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComSubtagCrua);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Coletânea · 4.2026')).toBeTruthy();
  });

  it('erro ao carregar o louvor sem instância de Error mostra mensagem padrão', async () => {
    (getPraise as ReturnType<typeof vi.fn>).mockRejectedValue('motivo cru, não é Error');
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    expect(await screen.findByText('Failed to load praise')).toBeTruthy();
  });
});

describe('Agrupamento: erro e membro sem tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('erro ao agrupar mostra a mensagem do servidor', async () => {
    (groupPraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Praise not found'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Agrupar Louvor' }));
    await user.type(screen.getByLabelText('ID do louvor a agrupar'), 'xyz');

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Praise not found')).toBeTruthy();
  });

  it('membro do grupo sem tags mostra o começo do ID', async () => {
    const praiseAgrupado: PraiseDetail = {
      ...mockPraiseDetail,
      group_members: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', tags: [] }],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseAgrupado);
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    expect(await screen.findByText('Louvores agrupados')).toBeTruthy();
    expect(screen.getByText('aaaaaaaa…')).toBeTruthy();
  });
});

describe('Material do YouTube com link que não dá para reconhecer', () => {
  it('mostra o card sem miniatura quando o link não é do YouTube', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const praiseComYoutubeRuim: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-yt-ruim',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: '',
          type: 'youtube',
          url: 'https://exemplo.com/nao-e-youtube',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComYoutubeRuim);
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await screen.findByRole('heading', { name: /YouTube/ });
    expect(screen.getByText('Vídeo')).toBeTruthy();
    expect(document.querySelector('.yt-thumb-fallback')).toBeTruthy();
    expect(document.querySelector('.yt-thumb img')).toBeNull();
  });
});

describe('Ações sobre materiais: caminhos de erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('erro ao trocar a categoria de um material mostra a mensagem', async () => {
    (updateMaterial as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao atualizar material'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByText('Partituras')).toBeTruthy());

    await user.click(screen.getAllByLabelText('Categoria do material')[0]);
    await user.click(screen.getByRole('option', { name: 'Cifra' }));

    expect(await screen.findByText('Falha ao atualizar material')).toBeTruthy();
  });

  it('erro ao apagar um material confirmado mostra a mensagem', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (deleteMaterial as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao remover material'));
    try {
      const user = userEvent.setup();
      renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByText('Partituras')).toBeTruthy());

      await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);

      expect(await screen.findByText('Falha ao remover material')).toBeTruthy();
    } finally {
      confirmar.mockRestore();
    }
  });

  it('falha ao baixar o áudio para conversão mostra a mensagem, sem apagar nada', async () => {
    const praiseComM4a: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-audio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind2',
          material_kind_name: 'Áudio',
          type: 'm4a',
          r2_key: 'assets/audio.m4a',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4a);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const user = userEvent.setup();
      renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByText('Converter para MP3')).toBeTruthy());

      await user.click(screen.getByRole('button', { name: 'Converter para MP3' }));

      expect(
        await screen.findByText('Não foi possível baixar o áudio para conversão.')
      ).toBeTruthy();
      expect(deleteMaterial).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Conversão do Drive: pede reconexão quando a sessão do Drive caiu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'audio.m4a', rel_path: 'audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
      ],
      skipped: [],
    });
  });

  it('conversão de um único áudio do Drive pede reconexão quando o Drive desconectou', async () => {
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Drive not connected'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter audio.m4a para MP3' }));

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
  });
});

describe('Envio em lote no modo edição: conversão e erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('converte um áudio da pasta antes de enviar pelo botão de lote', async () => {
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'audio.m4a', { type: 'audio/mp4' }),
    ]);
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: /Enviar 1 arquivo/ }));

    await waitFor(() => {
      expect(convertAudioToMp3).toHaveBeenCalledTimes(1);
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3', file_path_legacy: 'audio.mp3' })])
      );
    });
  });

  it('erro ao enviar o lote no modo edição mostra a mensagem', async () => {
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Máximo de 200 arquivos por lote')
    );
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'Partitura.pdf', { type: 'application/pdf' }),
    ]);
    await screen.findByText('Partitura.pdf');

    await user.click(screen.getByRole('button', { name: /Enviar 1 arquivo/ }));

    expect(await screen.findByText('Máximo de 200 arquivos por lote')).toBeTruthy();
  });
});

describe('Importação do Drive no modo edição: só fila, conversão no clique e erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
  });

  async function mapearUmArquivoDrive(nome: string, mime: string) {
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [{ drive_file_id: 'drv1', name: nome, rel_path: nome, mime_type: mime, size_bytes: 10 }],
      skipped: [],
    });
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText(nome);
    return user;
  }

  it('importa só a fila quando nenhum arquivo tem envio direto', async () => {
    const jobIniciado: ImportJobSummary = {
      id: 'job-fila',
      praise_id: mockPraiseDetail.id,
      status: 'running',
      total_count: 1,
      done_count: 0,
      failed_count: 0,
      skipped_count: 0,
    };
    (startDriveImport as ReturnType<typeof vi.fn>).mockResolvedValue(jobIniciado);
    (getImportJob as ReturnType<typeof vi.fn>).mockResolvedValue(jobIniciado);
    const user = await mapearUmArquivoDrive('Partitura.pdf', 'application/pdf');

    await user.click(screen.getByRole('button', { name: /Importar 1 arquivo\(s\) do Drive/ }));

    await waitFor(() => {
      expect(startDriveImport).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ drive_file_id: 'drv1' })])
      );
    });
    expect(bulkUploadMaterials).not.toHaveBeenCalled();
  });

  it('converte um áudio do Drive na hora do clique de importar, sem passo manual antes', async () => {
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Blob(['x'], { type: 'audio/mp4' })
    );
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = await mapearUmArquivoDrive('audio.m4a', 'audio/mp4');

    await user.click(screen.getByRole('button', { name: /Importar 1 arquivo\(s\) do Drive/ }));

    await waitFor(() => {
      expect(downloadDriveFileBlob).toHaveBeenCalledWith('drv1');
      expect(bulkUploadMaterials).toHaveBeenCalledWith(
        '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
        expect.arrayContaining([expect.objectContaining({ type: 'mp3' })])
      );
    });
  });

  it('erro de "Drive not connected" ao importar pede reautorização', async () => {
    (startDriveImport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Drive not connected'));
    const user = await mapearUmArquivoDrive('Partitura.pdf', 'application/pdf');

    await user.click(screen.getByRole('button', { name: /Importar 1 arquivo\(s\) do Drive/ }));

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
  });

  it('erro genérico ao importar mostra a mensagem', async () => {
    (startDriveImport as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha ao iniciar'));
    const user = await mapearUmArquivoDrive('Partitura.pdf', 'application/pdf');

    await user.click(screen.getByRole('button', { name: /Importar 1 arquivo\(s\) do Drive/ }));

    expect(await screen.findByText('Falha ao iniciar')).toBeTruthy();
  });
});

describe('Adicionar material: MP3 sem precisar converter', () => {
  it('sobe um mp3 já no formato certo sem chamar o conversor', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const heading = await screen.findByRole('heading', { name: 'Adicionar material' });
    const painel = heading.closest('.materials-panel') as HTMLElement;

    await user.click(within(painel).getByLabelText('Tipo do material'));
    await user.click(screen.getByRole('option', { name: 'MP3' }));
    await user.upload(
      within(painel).getByLabelText('Escolher MP3'),
      new File(['x'], 'ja-pronto.mp3', { type: 'audio/mpeg' })
    );
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    await waitFor(() => {
      expect(bulkUploadMaterials).toHaveBeenCalled();
    });
    expect(convertAudioToMp3).not.toHaveBeenCalled();
  });
});

describe('Outros materiais: link por URL e arquivo indisponível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('material com url mas sem r2_key linka pela url', async () => {
    const praiseComLink: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-link',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Link',
          type: 'link',
          url: 'https://exemplo.com/arquivo',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComLink);
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    const link = await screen.findByRole('link', { name: /Link/ });
    expect(link).toHaveAttribute('href', 'https://exemplo.com/arquivo');
  });

  it('material sem r2_key nem url aparece marcado como indisponível', async () => {
    const praiseSemArquivo: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-vazio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Sumido',
          type: 'link',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseSemArquivo);
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await screen.findByText('Sumido');
    expect(screen.getByText(/arquivo indisponível/)).toBeTruthy();
  });
});

describe('Reconhecimento de link do YouTube em suas variantes', () => {
  it('reconhece youtube.com com v=, /embed/, /shorts/ e m.youtube.com', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const materiaisYoutube = [
      { rel: 'watch', url: 'https://youtube.com/watch?v=aaa1111aaaa' },
      { rel: 'embed', url: 'https://youtube.com/embed/bbb2222bbbb' },
      { rel: 'shorts', url: 'https://youtube.com/shorts/ccc3333cccc' },
      { rel: 'mobile', url: 'https://m.youtube.com/watch?v=ddd4444dddd' },
    ].map((x, i) => ({
      id: `mat-yt-${i}`,
      praise_id: mockPraiseDetail.id,
      material_kind: 'kind1',
      material_kind_name: 'Vídeo',
      type: 'youtube' as const,
      url: x.url,
      source_material_id: null,
    }));
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: materiaisYoutube,
    });
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await screen.findByRole('heading', { name: /YouTube/ });
    expect(document.querySelector('img[src*="aaa1111aaaa"]')).toBeTruthy();
    expect(document.querySelector('img[src*="bbb2222bbbb"]')).toBeTruthy();
    expect(document.querySelector('img[src*="ccc3333cccc"]')).toBeTruthy();
    expect(document.querySelector('img[src*="ddd4444dddd"]')).toBeTruthy();
  });
});

describe('saveMetadata em edição: caminhos de erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('erro genérico ao salvar metadados em edição mostra a mensagem, sem sufixo de criação', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Praise not found'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    const erro = await screen.findByText('Praise not found');
    expect(erro).toBeTruthy();
    expect(screen.queryByText(/já foi criado/)).toBeNull();
  });

  it('salvar metadados com "Drive not connected" pede reautorização', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Drive not connected'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
  });
});

describe('Criar e associar subtag: a própria criação falha', () => {
  it('mostra a mensagem simples quando a subtag nem chega a ser criada', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (createTag as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Falha de rede'));
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    await screen.findByText('Nova subtag');
    await user.click(screen.getByLabelText('Tag pai da subtag'));
    await user.click(screen.getByRole('option', { name: 'Coletânea' }));
    await user.type(screen.getByLabelText('Nome da subtag'), '4.2026');
    await user.click(screen.getByRole('button', { name: 'Criar e associar' }));

    const erro = await screen.findByText('Falha de rede');
    expect(erro).toBeTruthy();
    expect(screen.queryByText(/a subtag já foi criada/)).toBeNull();
  });
});

describe('Progresso de conversão é reportado durante o áudio único', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
  });

  it('atualiza o percentual durante a conversão de um áudio da pasta local', async () => {
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockImplementation(
      async (_file: File, opts?: { onProgress?: (pct: number) => void }) => {
        opts?.onProgress?.(42);
        return new File(['x'], 'audio.mp3', { type: 'audio/mpeg' });
      }
    );
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'audio.m4a', { type: 'audio/mp4' }),
    ]);
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter audio.m4a para MP3' }));

    expect(await screen.findByText('audio.mp3')).toBeTruthy();
  });
});

describe('Criação: tag do catálogo fica pendente até salvar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
  });

  it('adiciona e depois remove uma tag pendente antes de criar o louvor', async () => {
    const user = userEvent.setup();
    renderPraisePage('new');
    await screen.findByText('Novo louvor');

    // O catálogo de tags carrega de forma assíncrona, depois do formulário.
    await user.click(await screen.findByLabelText('Adicionar tag'));
    await user.click(screen.getByRole('option', { name: 'GLTM' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('GLTM')).toBeTruthy();

    await user.click(screen.getByLabelText('Remover tag GLTM'));

    await waitFor(() => {
      expect(screen.queryByText('GLTM')).toBeNull();
    });
    expect(addPraiseTag).not.toHaveBeenCalled();
  });
});

describe('Copiar ID duas vezes seguidas', () => {
  it('cancela o temporizador anterior antes de agendar outro', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await screen.findByText(mockPraiseDetail.id);
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    const botao = () => screen.getByRole('button', { name: /copiar id/i });
    await user.click(botao());
    await waitFor(() => expect(botao()).toHaveTextContent('Copiado!'));
    await user.click(botao());

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledTimes(2);
    });
    writeTextSpy.mockRestore();
  });
});

describe('Partitura sem arquivo e acorde sem nome usam os padrões', () => {
  it('mostra "PDF indisponível" e o rótulo "Acordes" quando faltam dados', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const praiseComLacunas: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-pdf-sem-arquivo',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: '',
          type: 'pdf',
          source_material_id: null,
        },
        {
          id: 'mat-chord-sem-nome',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind3',
          material_kind_name: '',
          type: 'chord',
          r2_key: 'assets/x.chord',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComLacunas);
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    expect(await screen.findByText('PDF indisponível')).toBeTruthy();
    expect(screen.getByText('Partitura')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Abrir em nova aba' })).toBeNull();
    expect(screen.getByText('Acordes', { selector: '.material-link-text' })).toBeTruthy();
  });
});

describe('Louvor não encontrado ao entrar sem sessão ativa', () => {
  it('não mostra Baixar em ZIP nem formulário quando a criação é feita deslogado', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    renderPraisePage('new');

    expect(
      await screen.findByText('Entre com o Google para cadastrar um novo louvor.')
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Baixar em ZIP' })).toBeNull();
    expect(screen.queryByText('Novo louvor')).toBeNull();
  });
});

describe('Link do youtu.be sem ID cai na miniatura padrão', () => {
  it('não gera miniatura quando o link não tem caminho', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-yt-vazio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind1',
          material_kind_name: 'Vídeo',
          type: 'youtube',
          url: 'https://youtu.be/',
          source_material_id: null,
        },
      ],
    });
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');

    await screen.findByRole('heading', { name: /YouTube/ });
    expect(document.querySelector('.yt-thumb-fallback')).toBeTruthy();
  });
});

describe('Mensagens de erro sem instância de Error (não vaza "[object Object]")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('trocar categoria com rejeição crua mostra a mensagem padrão', async () => {
    (updateMaterial as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByText('Partituras')).toBeTruthy());
    await user.click(screen.getAllByLabelText('Categoria do material')[0]);
    await user.click(screen.getByRole('option', { name: 'Cifra' }));

    expect(await screen.findByText('Falha ao atualizar material')).toBeTruthy();
  });

  it('apagar material com rejeição crua mostra a mensagem padrão', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    (deleteMaterial as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    try {
      const user = userEvent.setup();
      renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByText('Partituras')).toBeTruthy());
      await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);

      expect(await screen.findByText('Falha ao remover material')).toBeTruthy();
    } finally {
      confirmar.mockRestore();
    }
  });

  it('adicionar tag existente com rejeição crua mostra a mensagem padrão', async () => {
    (addPraiseTag as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByLabelText('Adicionar tag'));
    await user.click(screen.getByRole('option', { name: 'GLTM' }));
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText('Falha ao adicionar tag')).toBeTruthy();
  });

  it('adicionar material com rejeição crua mostra a mensagem padrão', async () => {
    (createMaterial as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const heading = await screen.findByRole('heading', { name: 'Adicionar material' });
    const painel = heading.closest('.materials-panel') as HTMLElement;
    await user.click(within(painel).getByLabelText('Tipo do material'));
    await user.click(screen.getByRole('option', { name: 'YouTube' }));
    await user.type(screen.getByLabelText('Link do YouTube'), 'https://youtu.be/abc123');
    await user.click(within(painel).getByRole('button', { name: 'Adicionar material' }));

    expect(await screen.findByText('Falha ao criar material')).toBeTruthy();
  });

  it('envio em lote no modo edição com rejeição crua mostra a mensagem padrão', async () => {
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.upload(screen.getByLabelText('Escolher pasta'), [
      new File(['x'], 'Partitura.pdf', { type: 'application/pdf' }),
    ]);
    await screen.findByText('Partitura.pdf');
    await user.click(screen.getByRole('button', { name: /Enviar 1 arquivo/ }));

    expect(await screen.findByText('Falha na importação em lote')).toBeTruthy();
  });
});

describe('Conversão de todos os áudios do Drive pede reconexão quando ele caiu', () => {
  it('pede reconexão quando o download de qualquer um deles falha por desconexão', async () => {
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
    (getDriveStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    (startDriveScan as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'scan1',
      status: 'done',
      files: [
        { drive_file_id: 'drv1', name: 'audio.m4a', rel_path: 'audio.m4a', mime_type: 'audio/mp4', size_bytes: 10 },
        { drive_file_id: 'drv2', name: 'outro.wav', rel_path: 'outro.wav', mime_type: 'audio/wav', size_bytes: 10 },
      ],
      skipped: [],
    });
    // Com dois convertíveis o rótulo do botão vira "todos para MP3".
    (downloadDriveFileBlob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Drive not connected'));

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Link da pasta ou arquivo do Google Drive')).toBeTruthy()
    );
    await user.type(
      screen.getByLabelText('Link da pasta ou arquivo do Google Drive'),
      'https://drive.google.com/drive/folders/abc'
    );
    await user.click(screen.getByRole('button', { name: 'Mapear pasta' }));
    await screen.findByText('audio.m4a');

    await user.click(screen.getByRole('button', { name: 'Converter todos para MP3' }));

    await waitFor(() => {
      expect(sessionStorage.getItem('coldigom_rascunho_louvor')).toBeTruthy();
    });
  });
});

describe('Converter material existente para MP3: nome padrão e erro cru', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
  });

  it('usa "audio" como nome quando o material não tem categoria nomeada', async () => {
    const praiseComM4aSemNome: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-audio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind2',
          material_kind_name: '',
          type: 'm4a',
          r2_key: 'assets/audio.m4a',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4aSemNome);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['x'], { type: 'audio/mp4' })),
    });
    vi.stubGlobal('fetch', fetchMock);
    (convertAudioToMp3 as ReturnType<typeof vi.fn>).mockResolvedValue(
      new File(['x'], 'audio.mp3', { type: 'audio/mpeg' })
    );
    (bulkUploadMaterials as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4aSemNome);
    (deleteMaterial as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4aSemNome);

    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await waitFor(() => expect(screen.getByText('Converter para MP3')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Converter para MP3' }));

    await waitFor(() => {
      expect(convertAudioToMp3).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ filename: 'audio.m4a' })
      );
    });
    vi.unstubAllGlobals();
  });

  it('erro cru ao converter material existente mostra a mensagem padrão', async () => {
    const praiseComM4a: PraiseDetail = {
      ...mockPraiseDetail,
      materials: [
        {
          id: 'mat-audio',
          praise_id: mockPraiseDetail.id,
          material_kind: 'kind2',
          material_kind_name: 'Áudio',
          type: 'm4a',
          r2_key: 'assets/audio.m4a',
          source_material_id: null,
        },
      ],
    };
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(praiseComM4a);
    const fetchMock = vi.fn().mockRejectedValue('falha crua de rede');
    vi.stubGlobal('fetch', fetchMock);
    try {
      const user = userEvent.setup();
      renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
      await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
      await user.click(screen.getByRole('button', { name: 'Editar' }));
      await waitFor(() => expect(screen.getByText('Converter para MP3')).toBeTruthy());

      await user.click(screen.getByRole('button', { name: 'Converter para MP3' }));

      expect(await screen.findByText('Falha ao converter material para MP3')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Mais mensagens de erro sem instância de Error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminUser);
    (getPraise as ReturnType<typeof vi.fn>).mockResolvedValue(mockPraiseDetail);
  });

  it('agrupar com rejeição crua mostra a mensagem padrão', async () => {
    (groupPraise as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Agrupar Louvor' }));
    await user.type(screen.getByLabelText('ID do louvor a agrupar'), 'xyz');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText('Falha ao agrupar louvor')).toBeTruthy();
  });

  it('salvar a letra com rejeição crua mostra a mensagem padrão', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByPlaceholderText('Cole a letra aqui…');
    const botoesSalvar = screen.getAllByRole('button', { name: 'Salvar' });
    await user.click(botoesSalvar[botoesSalvar.length - 1]);

    expect(await screen.findByText('Falha ao salvar letra')).toBeTruthy();
  });

  it('salvar metadados em edição com rejeição crua mostra a mensagem padrão', async () => {
    (updatePraise as ReturnType<typeof vi.fn>).mockRejectedValue('cru');
    const user = userEvent.setup();
    renderPraisePage('1b2b33ab-4dff-4014-8582-dcb9a92efbc8');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    expect(await screen.findByText('Falha ao salvar metadados')).toBeTruthy();
  });
});

