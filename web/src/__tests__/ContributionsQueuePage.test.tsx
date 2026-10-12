import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ContributionsQueuePage } from '../pages/ContributionsQueuePage';
import type { AdminContribution, CollaborationPlan } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
    listAdminContributions: vi.fn(),
    getAdminContribution: vi.fn(),
    generateAdminContributionPlan: vi.fn(),
    approveAdminContributionPlan: vi.fn(),
    patchAdminContribution: vi.fn(),
    fetchAdminContributionFile: vi.fn(),
  };
});

import {
  getMe,
  listAdminContributions,
  getAdminContribution,
  generateAdminContributionPlan,
  approveAdminContributionPlan,
  patchAdminContribution,
  fetchAdminContributionFile,
} from '../services/api';

const MOCK_PLAN: CollaborationPlan = {
  id: 'plan-1',
  contribution_id: 'contrib-1',
  version: 1,
  model_name: '@cf/zai-org/glm-5.3-flash',
  summary: 'Alterar tom do louvor de Dm para Em',
  todos: ['Atualizar tonality para Em', 'Verificar métrica da letra'],
  plan_json: {
    summary: 'Alterar tom do louvor de Dm para Em',
    todos: ['Atualizar tonality para Em', 'Verificar métrica da letra'],
    tasks: [
      {
        id: 'task_1',
        operation: 'edit_praise_metadata',
        params: {
          praise_id: 'praise-100',
          fields: { tonality: 'Em' },
        },
      },
    ],
  },
  plan_hash: 'hash1234567890abcdef',
  status: 'pending_approval',
  created_at: '2026-10-03 12:00:00',
};

const MOCK_CONTRIB: AdminContribution = {
  id: 'contrib-1',
  user_id: 'user-1',
  user_email: 'irmao@test.com',
  user_name: 'Irmão João',
  kind: 'wrong_info',
  subkind: 'metadata',
  target_source: 'coldigom',
  target_praise_id: 'praise-100',
  target_material_id: null,
  title: 'Tom está incorreto na coletânea',
  body: 'O hino 123 é tocado em Mi Menor (Em) e não Ré Menor.',
  fields: { field: 'tonality', current: 'Dm', proposed: 'Em' },
  links: ['https://youtube.com/watch?v=123'],
  device: { platform: 'android' },
  app_route: '/praise/praise-100',
  app_version: '1.2.0',
  status: 'pendente',
  scan_status: 'limpa',
  scan_report: null,
  decided_at: null,
  decided_by: null,
  decision_note: null,
  created_at: '2026-10-03 10:00:00',
  updated_at: '2026-10-03 10:00:00',
  files: [
    {
      id: 'file-1',
      contribution_id: 'contrib-1',
      original_name: 'partitura_em.pdf',
      declared_type: 'pdf',
      detected_type: 'application/pdf',
      size: 204800,
      sha256: 'abc',
      r2_key: 'contributions/contrib-1/file-1.pdf',
      scan_status: 'limpa',
      scan_detail: null,
      created_at: '2026-10-03 10:00:00',
    },
  ],
  plan: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ContributionsQueuePage />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(listAdminContributions).mockReset();
  vi.mocked(getAdminContribution).mockReset();
  vi.mocked(generateAdminContributionPlan).mockReset();
  vi.mocked(approveAdminContributionPlan).mockReset();
  vi.mocked(patchAdminContribution).mockReset();
  vi.mocked(fetchAdminContributionFile).mockReset();
});

describe('ContributionsQueuePage', () => {
  it('sem sessão autenticada, exibe tela de login obrigatório', async () => {
    vi.mocked(getMe).mockResolvedValueOnce(null);
    renderPage();

    expect(
      await screen.findByText(
        'Entre como administrador para revisar as colaborações e interagir com o Assistente IA.'
      )
    ).toBeInTheDocument();
    expect(listAdminContributions).not.toHaveBeenCalled();
  });

  it('com sessão, lista as colaborações pendentes e seus metadados', async () => {
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();

    expect(await screen.findByText('Tom está incorreto na coletânea')).toBeInTheDocument();
    expect(screen.getByText('PENDENTE')).toBeInTheDocument();
    expect(screen.getByText('Irmão João')).toBeInTheDocument();
    expect(
      screen.getByText('O hino 123 é tocado em Mi Menor (Em) e não Ré Menor.')
    ).toBeInTheDocument();
    expect(screen.getByText('✦ Gerar Plano com IA')).toBeInTheDocument();
  });

  it('gera plano de tarefas com IA ao clicar no botão', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(generateAdminContributionPlan).mockResolvedValue({
      ok: true,
      planId: 'plan-1',
      plan: MOCK_PLAN,
    });

    renderPage();

    const generateBtn = await screen.findByRole('button', { name: /Gerar Plano com IA/i });
    await user.click(generateBtn);

    expect(generateAdminContributionPlan).toHaveBeenCalledWith('contrib-1');
    expect(await screen.findByText('Alterar tom do louvor de Dm para Em')).toBeInTheDocument();
    expect(screen.getByText('Atualizar tonality para Em')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Aprovar e Executar no Cloudflare/i })
    ).toBeInTheDocument();
  });

  it('aprova e executa o plano canônico gerado pela IA no Cloudflare', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    const contribWithPlan = { ...MOCK_CONTRIB, plan: MOCK_PLAN };
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [contribWithPlan],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(approveAdminContributionPlan).mockResolvedValue({
      ok: true,
      message: 'Plano aprovado e executado com sucesso',
      executed_tasks: 1,
    });

    renderPage();

    const approveBtn = await screen.findByRole('button', {
      name: /Aprovar e Executar no Cloudflare/i,
    });
    await user.click(approveBtn);

    await waitFor(() => {
      expect(approveAdminContributionPlan).toHaveBeenCalledWith('contrib-1', {
        planId: 'plan-1',
        planHash: 'hash1234567890abcdef',
        decisionNote: undefined,
      });
    });

    expect(
      await screen.findByText(/Plano aprovado e executado com sucesso!/i)
    ).toBeInTheDocument();
  });

  it('permite rejeitar a contribuição', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(patchAdminContribution).mockResolvedValue({ ok: true });

    renderPage();

    const rejectBtn = await screen.findByRole('button', { name: /Rejeitar/i });
    await user.click(rejectBtn);

    await waitFor(() => {
      expect(patchAdminContribution).toHaveBeenCalledWith('contrib-1', 'recusada', undefined);
    });
    expect(await screen.findByText(/Contribuição marcada como recusada/i)).toBeInTheDocument();
  });

  it('permite concluir a contribuição diretamente (feita manualmente)', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(patchAdminContribution).mockResolvedValue({ ok: true });

    renderPage();

    const completeBtn = await screen.findByRole('button', { name: /^✓ Concluir$/i });
    await user.click(completeBtn);

    await waitFor(() => {
      expect(patchAdminContribution).toHaveBeenCalledWith('contrib-1', 'aplicada', undefined);
    });
    expect(await screen.findByText(/Contribuição marcada como concluída/i)).toBeInTheDocument();
  });

  it('permite concluir a contribuição com nota do curador', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(patchAdminContribution).mockResolvedValue({ ok: true });

    renderPage();

    const noteInput = await screen.findByPlaceholderText(/ex.: Aprovado conforme indicação do colaborador/i);
    await user.type(noteInput, 'Alterado manualmente no louvor');

    const completeBtn = screen.getByRole('button', { name: /^✓ Concluir$/i });
    await user.click(completeBtn);

    await waitFor(() => {
      expect(patchAdminContribution).toHaveBeenCalledWith(
        'contrib-1',
        'aplicada',
        'Alterado manualmente no louvor'
      );
    });
    expect(await screen.findByText(/Contribuição marcada como concluída/i)).toBeInTheDocument();
  });

  it('permite concluir manualmente mesmo quando já existe plano de IA', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    const contribWithPlan = { ...MOCK_CONTRIB, plan: MOCK_PLAN };
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [contribWithPlan],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(patchAdminContribution).mockResolvedValue({ ok: true });

    renderPage();

    const completeManualBtn = await screen.findByRole('button', { name: /Concluir \(Manual\)/i });
    await user.click(completeManualBtn);

    await waitFor(() => {
      expect(patchAdminContribution).toHaveBeenCalledWith('contrib-1', 'aplicada', undefined);
    });
    expect(await screen.findByText(/Contribuição marcada como concluída/i)).toBeInTheDocument();
  });

  it('exibe alerta de erro quando a conclusão falha', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(patchAdminContribution).mockRejectedValue(new Error('Erro no servidor ao concluir'));

    renderPage();

    const completeBtn = await screen.findByRole('button', { name: /^✓ Concluir$/i });
    await user.click(completeBtn);

    expect(await screen.findByText('Erro no servidor ao concluir')).toBeInTheDocument();
  });

  it('permite visualizar anexos limpos em modal seguro', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const fakeBlob = new Blob(['pdf-data'], { type: 'application/pdf' });
    vi.mocked(fetchAdminContributionFile).mockResolvedValue({
      blob: fakeBlob,
      contentType: 'application/pdf',
      filename: 'partitura_em.pdf',
    });

    // Mock URL.createObjectURL and revokeObjectURL in JSDOM
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-blob');
    global.URL.revokeObjectURL = vi.fn();

    renderPage();

    const viewBtn = await screen.findByRole('button', { name: 'Visualizar' });
    await user.click(viewBtn);

    expect(fetchAdminContributionFile).toHaveBeenCalledWith('contrib-1', 'file-1');
    const modalHead = await screen.findByRole('dialog');
    expect(modalHead).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Fechar' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('permite filtrar por abas de status', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderPage();

    const tabAnalise = await screen.findByRole('tab', { name: 'Em Análise' });
    await user.click(tabAnalise);

    expect(listAdminContributions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'em_analise', page: 1 })
    );
  });

  it('permite filtrar por tipo de contribuição e selecionar nota de decisão', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [{ ...MOCK_CONTRIB, plan: MOCK_PLAN }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(approveAdminContributionPlan).mockResolvedValue({
      ok: true,
      message: 'Aprovado',
      executed_tasks: 1,
    });

    renderPage();

    const select = await screen.findByLabelText(/Tipo:/i);
    await user.selectOptions(select, 'wrong_info');

    expect(listAdminContributions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'wrong_info', page: 1 })
    );

    const noteInput = screen.getByPlaceholderText(/Aprovado conforme/i);
    await user.type(noteInput, 'Alteração testada no ensaio');

    const approveBtn = screen.getByRole('button', { name: /Aprovar e Executar no Cloudflare/i });
    await user.click(approveBtn);

    expect(approveAdminContributionPlan).toHaveBeenCalledWith('contrib-1', {
      planId: 'plan-1',
      planHash: 'hash1234567890abcdef',
      decisionNote: 'Alteração testada no ensaio',
    });
  });

  it('exibe alerta de erro quando a chamada da IA falha', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(generateAdminContributionPlan).mockRejectedValue(new Error('Cloudflare Workers AI timeout'));

    renderPage();

    const generateBtn = await screen.findByRole('button', { name: /Gerar Plano com IA/i });
    await user.click(generateBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cloudflare Workers AI timeout');
  });

  it('permite alternar expansão do cartão via teclado', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();

    const cardHead = await screen.findByRole('button', { name: /Tom está incorreto/i });
    expect(screen.getByText('Descrição do Colaborador:')).toBeInTheDocument();

    // Pressiona Enter para recolher
    cardHead.focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Descrição do Colaborador:')).not.toBeInTheDocument();

    // Pressiona Space para reabrir
    await user.keyboard(' ');
    expect(screen.getByText('Descrição do Colaborador:')).toBeInTheDocument();
  });

  it('permite filtrar pela aba de status Recebidas', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [{ ...MOCK_CONTRIB, status: 'recebida' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderPage();

    const tabRecebidas = await screen.findByRole('tab', { name: 'Recebidas' });
    await user.click(tabRecebidas);

    expect(listAdminContributions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'recebida', page: 1 })
    );
    expect(await screen.findByText('RECEBIDA')).toBeInTheDocument();
  });

  it('abre o modal de edição exibindo o crédito preservado do colaborador original', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getAdminContribution).mockResolvedValue({
      ...MOCK_CONTRIB,
      target_praise_data: { tonality: 'Dm', rhythm: 'Balada', author: 'Autor Teste', title: 'Hino 123' },
    });

    renderPage();

    const editBtn = await screen.findByRole('button', { name: /✎ Editar e Aplicar/i });
    await user.click(editBtn);

    expect(getAdminContribution).toHaveBeenCalledWith('contrib-1');
    const modal = await screen.findByRole('dialog');
    expect(modal).toBeInTheDocument();
    expect(within(modal).getByText(/Crédito mantido para:/i)).toBeInTheDocument();
    expect(within(modal).getByText('Irmão João')).toBeInTheDocument();
    expect(within(modal).getByText(/irmao@test\.com/i)).toBeInTheDocument();
  });

  it('permite editar metadados/letra e aplicar mantendo o crédito do colaborador', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getAdminContribution).mockResolvedValue({
      ...MOCK_CONTRIB,
      target_praise_data: { tonality: 'Dm', rhythm: 'Balada', author: 'Autor Teste', title: 'Hino 123' },
    });
    vi.mocked(approveAdminContributionPlan).mockResolvedValue({
      ok: true,
      message: 'Plano aprovado e executado com sucesso',
      executed_tasks: 1,
    });

    renderPage();

    const editBtn = await screen.findByRole('button', { name: /✎ Editar e Aplicar/i });
    await user.click(editBtn);

    const modal = await screen.findByRole('dialog');
    const tonalityInput = within(modal).getByLabelText(/Tom/i);
    await user.clear(tonalityInput);
    await user.type(tonalityInput, 'F#m');

    const noteInput = within(modal).getByLabelText(/Nota do Curador/i);
    await user.type(noteInput, 'Ajustado para F#m no ensaio');

    const submitBtn = within(modal).getByRole('button', { name: /Salvar e Aplicar \(com crédito\)/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(approveAdminContributionPlan).toHaveBeenCalledWith('contrib-1', expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({
            operation: 'edit_praise_metadata',
            params: expect.objectContaining({
              fields: expect.objectContaining({ tonality: 'F#m' }),
            }),
          }),
        ]),
        decisionNote: 'Ajustado para F#m no ensaio',
      }));
    });

    expect(
      await screen.findByText(/Contribuição editada e aplicada com sucesso! Crédito preservado para Irmão João/i)
    ).toBeInTheDocument();
  });

  it('permite fechar o modal de edição sem salvar', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getAdminContribution).mockResolvedValue(MOCK_CONTRIB);

    renderPage();

    const editBtn = await screen.findByRole('button', { name: /✎ Editar e Aplicar/i });
    await user.click(editBtn);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    await user.click(cancelBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(approveAdminContributionPlan).not.toHaveBeenCalled();
  });

  it('permite alternar abas de Letra e Cifra no modal de edição', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getAdminContribution).mockResolvedValue({
      ...MOCK_CONTRIB,
      target_praise_data: { tonality: 'Dm', rhythm: 'Balada', author: 'Autor Teste', title: 'Hino 123', lyrics: 'Letra antiga' },
      target_chord_content: '[Dm]Cifra antiga',
    });
    vi.mocked(approveAdminContributionPlan).mockResolvedValue({
      ok: true,
      message: 'Plano aprovado e executado com sucesso',
      executed_tasks: 2,
    });

    renderPage();

    const editBtn = await screen.findByRole('button', { name: /✎ Editar e Aplicar/i });
    await user.click(editBtn);

    const modal = await screen.findByRole('dialog');

    // Aba Letra
    const tabLyrics = within(modal).getByRole('button', { name: 'Letra' });
    await user.click(tabLyrics);

    const lyricsInput = within(modal).getByLabelText(/Texto da Letra:/i);
    await user.clear(lyricsInput);
    await user.type(lyricsInput, 'Nova letra corrigida');

    // Aba Cifra
    const tabChord = within(modal).getByRole('button', { name: 'Cifra / ChordPro' });
    await user.click(tabChord);

    const chordInput = within(modal).getByLabelText(/Texto da Cifra/i);
    await user.clear(chordInput);
    await user.type(chordInput, '[Em]Nova cifra');

    // Retorna para Metadados e altera ritmo e autor
    const tabMeta = within(modal).getByRole('button', { name: 'Metadados' });
    await user.click(tabMeta);

    const rhythmInput = within(modal).getByLabelText(/Ritmo/i);
    await user.type(rhythmInput, ' Canção');

    const authorInput = within(modal).getByLabelText(/Autor/i);
    await user.type(authorInput, ' Novo');

    const titleInput = within(modal).getByLabelText(/Título do Louvor/i);
    await user.type(titleInput, ' Novo');

    const submitBtn = within(modal).getByRole('button', { name: /Salvar e Aplicar \(com crédito\)/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(approveAdminContributionPlan).toHaveBeenCalledWith('contrib-1', expect.objectContaining({
        tasks: expect.arrayContaining([
          expect.objectContaining({ operation: 'update_praise_lyrics' }),
          expect.objectContaining({ operation: 'update_chord_content' }),
          expect.objectContaining({ operation: 'edit_praise_metadata' }),
        ]),
      }));
    });
  });

  it('exibe erro dentro do modal caso salvar falhe', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'admin-1', email: 'admin@coldigom.com' });
    vi.mocked(listAdminContributions).mockResolvedValue({
      data: [MOCK_CONTRIB],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(getAdminContribution).mockResolvedValue(MOCK_CONTRIB);
    vi.mocked(approveAdminContributionPlan).mockRejectedValue(new Error('Falha ao gravar no D1'));

    renderPage();

    const editBtn = await screen.findByRole('button', { name: /✎ Editar e Aplicar/i });
    await user.click(editBtn);

    const modal = await screen.findByRole('dialog');
    const tonalityInput = within(modal).getByLabelText(/Tom/i);
    await user.type(tonalityInput, 'G');

    const submitBtn = within(modal).getByRole('button', { name: /Salvar e Aplicar \(com crédito\)/i });
    await user.click(submitBtn);

    expect(await within(modal).findByText('Falha ao gravar no D1')).toBeInTheDocument();
  });
});

