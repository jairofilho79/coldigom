import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FindingEvidence } from '../FindingEvidence';
import type { ValidationFinding } from '../../types';

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return { ...actual, getPraise: vi.fn() };
});
import { getPraise } from '../../services/api';

const BASE: ValidationFinding = {
  id: 'f1', run_id: 'r1', detector: 'youtube_merge', target_type: 'praise', target_id: 'p-fonte',
  praise_id: 'p-fonte', action: 'merge_praise', field: 'keeper:p-k1', current_value: null,
  proposed_value: 'p-k1', confidence: 'media', status: 'pendente', decided_at: null, decided_by: null,
  decision_note: null, created_at: 'x',
  evidence: { letra: true, nome: false, candidatos: 2, url: 'https://www.youtube.com/watch?v=abc' },
};

beforeEach(() => vi.mocked(getPraise).mockReset());

describe('FindingEvidence', () => {
  it('genérico: um par por chave, url vira link', async () => {
    vi.mocked(getPraise).mockResolvedValue({ id: 'x', name: 'x', number: '', author: '', rhythm: '', tonality: '', category: '', lyrics: '', group_id: null, tag_ids: null, tag_names: null, materials: [] } as never);
    render(<FindingEvidence finding={{ ...BASE, action: 'set_praise_field', proposed_value: null }} />);
    expect(screen.getByText('letra')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://www.youtube.com/watch?v=abc' })).toHaveAttribute('target', '_blank');
    expect(getPraise).not.toHaveBeenCalled();
  });

  it('merge_praise: busca fonte e keeper e mostra os dois lado a lado', async () => {
    vi.mocked(getPraise).mockImplementation(async (id: string) => ({
      id, name: id === 'p-fonte' ? 'Medo tens' : 'Medo tens que o tentador', number: id === 'p-k1' ? '306' : '',
      author: '', rhythm: '', tonality: '', category: '', lyrics: `letra de ${id}`, group_id: null, tag_ids: null,
      tag_names: id === 'p-k1' ? 'Coletânea' : 'Avulsos', materials: [],
    }) as never);
    render(<FindingEvidence finding={BASE} />);
    expect(await screen.findByText('Medo tens que o tentador')).toBeInTheDocument();
    expect(screen.getByText('Medo tens')).toBeInTheDocument();
    expect(screen.getByText('letra de p-fonte')).toBeInTheDocument();
    expect(screen.getByText('letra de p-k1')).toBeInTheDocument();
    expect(getPraise).toHaveBeenCalledTimes(2);
  });

  it('evidência que veio como string crua é mostrada como está', () => {
    render(<FindingEvidence finding={{ ...BASE, action: 'set_praise_field', proposed_value: null, evidence: '{quebrado' }} />);
    expect(screen.getByText('{quebrado')).toBeInTheDocument();
  });

  it('url que não é http(s) não vira link', () => {
    render(<FindingEvidence finding={{ ...BASE, action: 'set_praise_field', proposed_value: null, evidence: { url: 'javascript:alert(1)' } }} />);
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
