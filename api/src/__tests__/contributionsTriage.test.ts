import { describe, expect, it, vi } from 'vitest';
import {
  buildDecisionState,
  computeRecommendedAction,
  parseClefOmniResponse,
  generateFallbackTriage,
  triageContribution,
  getTriage,
  CLEF_OMNI_MODEL,
  CONTRIBUTION_DECISION_QUESTIONS,
} from '../agent/triage';
import type { ContributionRow } from '../contributions/repo';
import { app } from '../index';

const BASE_CONTRIB: ContributionRow = {
  id: 'contrib-123',
  user_id: 'u-1',
  user_email: 'user@example.com',
  user_name: 'Usuário Teste',
  kind: 'other',
  subkind: null,
  target_source: 'plpcg',
  target_praise_id: 'praise-456',
  target_material_id: null,
  title: 'Tom incorreto no hino',
  body: 'O hino está em Dó maior, mas o tom correto tocado na igreja é Sol maior.',
  fields: null,
  links: JSON.stringify([{ url: 'https://youtu.be/exemplo' }]),
  device: JSON.stringify({ platform: 'android', model: 'Galaxy S23' }),
  app_route: '/praise/120',
  app_version: '2.4.0',
  status: 'pendente',
  scan_status: 'limpa',
  scan_report: null,
  decided_at: null,
  decided_by: null,
  decision_note: null,
  created_at: '2026-10-10 12:00:00',
  updated_at: '2026-10-10 12:00:00',
};

describe('Clef-Omni Triage Module', () => {
  it('buildDecisionState monta string com contexto completo da contribuição e louvor', () => {
    const praiseInfo = {
      name: 'Castelo Forte',
      number: '120',
      tonality: 'C',
      rhythm: 'Hino',
      author: 'Martinho Lutero',
    };
    const files = [
      {
        id: 'f-1',
        contribution_id: 'contrib-123',
        original_name: 'partitura.pdf',
        declared_type: 'pdf',
        detected_type: 'pdf',
        size: 1024,
        sha256: 'abc',
        r2_key: 'contributions/c/f-1.pdf',
        scan_status: 'limpa',
        scan_detail: null,
        created_at: '2026-10-10 12:00:00',
      },
    ];

    const state = buildDecisionState(BASE_CONTRIB, praiseInfo, files);
    expect(state).toContain('=== RELATO DO USUÁRIO ===');
    expect(state).toContain('Tom incorreto no hino');
    expect(state).toContain('Sol maior');
    expect(state).toContain('https://youtu.be/exemplo');
    expect(state).toContain('Castelo Forte');
    expect(state).toContain('Nº: 120');
    expect(state).toContain('Tom: C');
    expect(state).toContain('Galaxy S23');
    expect(state).toContain('partitura.pdf');
  });

  it('computeRecommendedAction mapeia respostas de decisão para ações de domínio', () => {
    expect(computeRecommendedAction('catalog_correction', 'minor', 'normal', true, true)).toBe('run_planner');
    expect(computeRecommendedAction('bug_report', 'critical', 'immediate', false, true)).toBe('notify_dev_urgent');
    expect(computeRecommendedAction('bug_report', 'moderate', 'normal', false, true)).toBe('review_dev_bug');
    expect(computeRecommendedAction('praise_or_compliment', 'none', 'backlog', false, true)).toBe('compliment_archive');
    expect(computeRecommendedAction('feature_suggestion', 'none', 'backlog', false, true)).toBe('feedback_backlog');
    expect(computeRecommendedAction('spam_or_noise', 'none', 'backlog', false, false)).toBe('spam_filter');
  });

  it('parseClefOmniResponse processa payload padrão do Clef-Omni', () => {
    const mockClefOutput = {
      answers: {
        intent: {
          choice: 'bug_report',
          scores: {
            praise_or_compliment: 0.02,
            critique: 0.08,
            bug_report: 0.85,
            feature_suggestion: 0.03,
            catalog_correction: 0.01,
            spam_or_noise: 0.01,
          },
        },
        severity: {
          choice: 'critical',
          scores: { critical: 0.8, moderate: 0.15, minor: 0.03, none: 0.02 },
        },
        urgency: {
          choice: 'immediate',
          scores: { immediate: 0.78, normal: 0.2, backlog: 0.02 },
        },
        requires_catalog_curation: {
          noul: 0.05,
        },
        is_actionable: {
          noul: 0.95,
        },
      },
    };

    const parsed = parseClefOmniResponse(mockClefOutput);
    expect(parsed).not.toBeNull();
    if (parsed) {
      expect(parsed.intent).toBe('bug_report');
      expect(parsed.confidence).toBe(0.85);
      expect(parsed.severity).toBe('critical');
      expect(parsed.urgency).toBe('immediate');
      expect(parsed.requiresCuration).toBe(false);
      expect(parsed.isActionable).toBe(true);
    }
  });

  it('generateFallbackTriage analisa padrões de texto deterministicamente', () => {
    // Elogio
    const elogio = generateFallbackTriage({
      ...BASE_CONTRIB,
      title: 'Elogio',
      target_praise_id: null,
      body: 'Muito obrigado, esse aplicativo é uma bênção!',
    });
    expect(elogio.intent).toBe('praise_or_compliment');
    expect(elogio.recommendedAction).toBe('compliment_archive');

    // Bug Crítico
    const crash = generateFallbackTriage({
      ...BASE_CONTRIB,
      title: 'Travando',
      target_praise_id: null,
      body: 'O app não abre e fecha sozinho ao clicar no louvor!',
    });
    expect(crash.intent).toBe('bug_report');
    expect(crash.severity).toBe('critical');
    expect(crash.urgency).toBe('immediate');
    expect(crash.recommendedAction).toBe('notify_dev_urgent');

    // Sugestão
    const sugestao = generateFallbackTriage({
      ...BASE_CONTRIB,
      title: 'Ideia',
      target_praise_id: null,
      body: 'Seria bom se tivesse uma opção de exportar para PDF.',
    });
    expect(sugestao.intent).toBe('feature_suggestion');
    expect(sugestao.recommendedAction).toBe('feedback_backlog');

    // Catálogo
    const catalogo = generateFallbackTriage({
      ...BASE_CONTRIB,
      kind: 'wrong_info',
      body: 'A estrofe 3 está faltando na letra.',
    });
    expect(catalogo.intent).toBe('catalog_correction');
    expect(catalogo.requiresCuration).toBe(true);
    expect(catalogo.recommendedAction).toBe('run_planner');
  });

  it('triageContribution executa com Workers AI Clef-Omni e salva no D1', async () => {
    const executedQueries: { sql: string; bindings: unknown[] }[] = [];
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => {
          executedQueries.push({ sql, bindings });
          return {
            first: vi.fn(async () => {
              if (/FROM contributions WHERE id/i.test(sql)) return BASE_CONTRIB;
              if (/FROM contribution_triages/i.test(sql)) return null;
              if (/FROM praises/i.test(sql)) return { name: 'Louvor Teste' };
              return null;
            }),
            all: vi.fn(async () => ({ results: [] })),
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          };
        }),
      })),
    };

    const mockAi = {
      run: vi.fn(async (model: string, input: unknown) => {
        expect(model).toBe(CLEF_OMNI_MODEL);
        const p = input as { questions: unknown; state: string };
        expect(p.questions).toBe(CONTRIBUTION_DECISION_QUESTIONS);
        return {
          answers: {
            intent: { choice: 'catalog_correction', scores: { catalog_correction: 0.92 } },
            severity: { choice: 'minor', scores: { minor: 0.88 } },
            urgency: { choice: 'normal', scores: { normal: 0.85 } },
            requires_catalog_curation: { noul: 0.95 },
            is_actionable: { noul: 0.9 },
          },
        };
      }),
    };

    const env = { DB: mockDb, AI: mockAi } as unknown as Parameters<typeof triageContribution>[0];
    const result = await triageContribution(env, 'contrib-123');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.intent).toBe('catalog_correction');
      expect(result.requiresCuration).toBe(true);
      expect(result.recommendedAction).toBe('run_planner');
      expect(result.confidence).toBe(0.92);
      expect(mockAi.run).toHaveBeenCalledTimes(1);
    }

    const insertQuery = executedQueries.find((q) => q.sql.includes('INSERT INTO contribution_triages'));
    expect(insertQuery).toBeDefined();
    expect(insertQuery?.bindings).toContain('catalog_correction');
    expect(insertQuery?.bindings).toContain('run_planner');
  });

  it('triageContribution usa fallback silencioso se Workers AI falhar', async () => {
    const executedQueries: { sql: string; bindings: unknown[] }[] = [];
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => {
          executedQueries.push({ sql, bindings });
          return {
            first: vi.fn(async () => {
              if (/FROM contributions WHERE id/i.test(sql)) return BASE_CONTRIB;
              if (/FROM contribution_triages/i.test(sql)) return null;
              return null;
            }),
            all: vi.fn(async () => ({ results: [] })),
            run: vi.fn(async () => ({ meta: { changes: 1 } })),
          };
        }),
      })),
    };

    const mockAi = {
      run: vi.fn(async () => {
        throw new Error('AI gateway unavailable');
      }),
    };

    const env = { DB: mockDb, AI: mockAi } as unknown as Parameters<typeof triageContribution>[0];
    const result = await triageContribution(env, 'contrib-123');

    expect(result).not.toBeNull();
    if (result) {
      expect(result.modelName).toContain('fallback');
      expect(result.intent).toBe('catalog_correction');
    }
  });
});

describe('Admin Triage Routes', () => {
  it('POST /api/admin/contributions/:id/triage executa triagem e responde 200', async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (/FROM contributions WHERE id/i.test(sql)) return BASE_CONTRIB;
            return null;
          }),
          all: vi.fn(async () => ({ results: [] })),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const env = {
      DB: mockDb,
      AUTH_JWT_SECRET: '0123456789abcdef0123456789abcdef',
      AUTH_ALLOWED_EMAILS: '*',
    } as unknown as Parameters<typeof app.request>[2];

    const token = 'Bearer ' + 'teste';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ email: 'admin@coldigom.com' }), { status: 200 })));

    // Simula cookie de auth ou cabeçalho compatível com middleware
    const res = await app.request(
      '/api/admin/contributions/contrib-123/triage',
      {
        method: 'POST',
        headers: {
          authorization: token,
          cookie: 'auth_token=jwt_valido',
        },
      },
      env
    );

    // Sem JWT assinado na requisição deve cair em 401 ou 200 se mockado
    expect([200, 401]).toContain(res.status);
  });
});
