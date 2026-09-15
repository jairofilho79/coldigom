import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ValidationQueuePage } from '../pages/ValidationQueuePage';
import { agruparPorAlvo } from '../lib/validacao/agruparPorAlvo';
import type { ValidationFinding } from '../types';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    getMe: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue(false),
    listValidationFindings: vi.fn(),
    decideValidationFinding: vi.fn(),
    bulkDecideValidationFindings: vi.fn(),
    getPraise: vi.fn(),
  };
});

import {
  getMe, listValidationFindings, decideValidationFinding, bulkDecideValidationFindings,
} from '../services/api';

function achado(extra: Partial<ValidationFinding>): ValidationFinding {
  return {
    id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
    praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-k1', current_value: null,
    proposed_value: 'p-k1', confidence: 'media', evidence: { letra: true }, status: 'pendente',
    decided_at: null, decided_by: null, decision_note: null, created_at: '2026-09-03 20:00:00',
    target_name: 'Medo tens', proposed_name: 'Medo tens que o tentador', ...extra,
  };
}

const DOIS_CANDIDATOS = [
  achado({ id: 'f1', proposed_value: 'p-k1', proposed_name: 'Medo tens que o tentador', field: 'keeper:p-k1' }),
  achado({ id: 'f2', proposed_value: 'p-k2', proposed_name: 'Medo tens (coro)', field: 'keeper:p-k2' }),
];

function renderPage() {
  return render(<MemoryRouter><AuthProvider><ValidationQueuePage /></AuthProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(listValidationFindings).mockReset();
  vi.mocked(decideValidationFinding).mockReset();
  vi.mocked(bulkDecideValidationFindings).mockReset();
});

describe('agruparPorAlvo', () => {
  it('junta os candidatos concorrentes do mesmo louvor e mantém a ordem', () => {
    const outro = achado({ id: 'f9', praise_id: 'p-outro', target_id: 'p-outro', target_name: 'Algemas' });
    const grupos = agruparPorAlvo([DOIS_CANDIDATOS[0], outro, DOIS_CANDIDATOS[1]]);
    expect(grupos.map((g) => [g.titulo, g.itens.map((i) => i.id)])).toEqual([
      ['Medo tens', ['f1', 'f2']],
      ['Algemas', ['f9']],
    ]);
  });
});

describe('ValidationQueuePage', () => {
  it('sem sessão, pede login e não chama a API', async () => {
    vi.mocked(getMe).mockResolvedValueOnce(null);
    renderPage();
    expect(await screen.findByText('Entre para revisar os achados do acervo.')).toBeInTheDocument();
    expect(listValidationFindings).not.toHaveBeenCalled();
  });

  it('com sessão, lista agrupada por louvor com a contagem de candidatos', async () => {
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    renderPage();
    expect(await screen.findByText('Medo tens')).toBeInTheDocument();
    expect(screen.getByText('2 candidatos')).toBeInTheDocument();
    expect(screen.getByText('Medo tens que o tentador')).toBeInTheDocument();
    expect(screen.getByText('Medo tens (coro)')).toBeInTheDocument();
    expect(listValidationFindings).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pendente', page: 1 }), expect.anything()
    );
  });

  it('aprovar um candidato rejeita os irmãos pendentes e recarrega', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    vi.mocked(decideValidationFinding).mockResolvedValue({ ...DOIS_CANDIDATOS[0], status: 'aprovado' });
    vi.mocked(bulkDecideValidationFindings).mockResolvedValue({ atualizados: 1 });
    renderPage();
    const linha = (await screen.findByText('Medo tens que o tentador')).closest('tr')!;
    await user.type(screen.getByLabelText('Nota da decisão'), 'a letra bate');
    await user.click(within(linha).getByRole('button', { name: 'Aprovar e rejeitar os outros 1' }));
    await waitFor(() => expect(decideValidationFinding).toHaveBeenCalledWith('f1', { status: 'aprovado', decision_note: 'a letra bate' }));
    expect(bulkDecideValidationFindings).toHaveBeenCalledWith({ ids: ['f2'], status: 'rejeitado', decision_note: 'concorrente do aprovado f1' });
    await waitFor(() => expect(listValidationFindings).toHaveBeenCalledTimes(2));
  });

  it('falha parcial em "aprovar e rejeitar os outros" mostra o erro e recarrega mesmo assim', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    vi.mocked(decideValidationFinding).mockResolvedValue({ ...DOIS_CANDIDATOS[0], status: 'aprovado' });
    vi.mocked(bulkDecideValidationFindings).mockRejectedValue(new Error('falhou o lote'));
    renderPage();
    const linha = (await screen.findByText('Medo tens que o tentador')).closest('tr')!;
    await user.click(within(linha).getByRole('button', { name: 'Aprovar e rejeitar os outros 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou o lote');
    expect(screen.getByText('Medo tens que o tentador')).toBeInTheDocument();
    await waitFor(() => expect(listValidationFindings).toHaveBeenCalledTimes(2));
  });

  it('lote: selecionar dois e rejeitar chama o bulk', async () => {
    const user = userEvent.setup();
    vi.mocked(getMe).mockResolvedValueOnce({ sub: 'u1', email: 'admin@test.com' });
    vi.mocked(listValidationFindings).mockResolvedValue({
      data: DOIS_CANDIDATOS, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    vi.mocked(bulkDecideValidationFindings).mockResolvedValue({ atualizados: 2 });
    renderPage();
    await screen.findByText('Medo tens');
    await user.click(screen.getByLabelText('Selecionar f1'));
    await user.click(screen.getByLabelText('Selecionar f2'));
    await user.click(screen.getByRole('button', { name: 'Rejeitar 2' }));
    await waitFor(() => expect(bulkDecideValidationFindings).toHaveBeenCalledWith({ ids: ['f1', 'f2'], status: 'rejeitado' }));
  });
});
