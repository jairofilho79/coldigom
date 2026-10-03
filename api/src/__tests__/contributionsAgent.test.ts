import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { planContribution } from '../agent/planner';
import { executePlan } from '../agent/executor';

const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef';
const TEST_WEB_ORIGIN = 'https://web.example';

async function sessaoValida() {
  const { SignJWT } = await import('jose');
  return new SignJWT({ email: 'admin@test.com', jti: 'j-agent' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('sub-admin')
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

const envAuth = {
  AUTH_JWT_SECRET: TEST_JWT_SECRET,
  AUTH_ALLOWED_EMAILS: '*',
  WEB_ORIGIN: TEST_WEB_ORIGIN,
};

describe('AI Agent Planner & Executor', () => {
  it('planContribution gera plano de fallback determinístico quando AI não está disponível', async () => {
    const contributionRow = {
      id: 'contrib-123',
      user_id: 'u1',
      user_email: 'user@test.com',
      user_name: 'Colaborador',
      kind: 'wrong_info',
      subkind: 'metadata',
      target_source: 'coldigom',
      target_praise_id: 'praise-456',
      target_material_id: null,
      title: 'Tom incorreto',
      body: 'O tom correto deste hino é Sol Maior (G)',
      fields: JSON.stringify({ field: 'tonality', current: 'D', proposed: 'G' }),
      links: '[]',
      device: null,
      app_route: '/',
      app_version: '1.0',
      status: 'pendente',
      scan_status: 'sem_arquivo',
      scan_report: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
      created_at: '2026-10-01 10:00:00',
      updated_at: '2026-10-01 10:00:00',
    };

    const insertedPlans: Record<string, unknown>[] = [];
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('SELECT * FROM contributions')) {
              return contributionRow;
            }
            return null;
          }),
          run: vi.fn(async () => {
            if (sql.includes('INSERT INTO collaboration_plans')) {
              insertedPlans.push({ sql, bindings });
            }
            return { meta: { changes: 1 } };
          }),
        })),
      })),
    };

    const env = { DB: mockDb } as unknown as Parameters<typeof planContribution>[0];
    const planId = await planContribution(env, 'contrib-123');

    expect(planId).toBeDefined();
    expect(insertedPlans.length).toBe(1);
    const planBindings = insertedPlans[0].bindings;
    // Bindings: planId, contributionId, modelName, summary, todos, canonicalJson, planHash
    expect(planBindings[1]).toBe('contrib-123');
    expect(planBindings[2]).toBe('@cf/zai-org/glm-5.3-flash');
    expect(planBindings[3]).toContain('tonality');
    const todos = JSON.parse(planBindings[4] as string);
    expect(todos[0]).toContain('tonality');
  });

  it('executePlan aplica tarefas do plano e registra idempotência no D1', async () => {
    const canonicalPlan = {
      summary: 'Alterar tom para G',
      todos: ['Atualizar tonality para G'],
      tasks: [
        {
          id: 'task_edit',
          operation: 'edit_praise_metadata',
          params: {
            praise_id: 'praise-456',
            fields: { tonality: 'G' },
          },
        },
      ],
    };

    const planRow = {
      id: 'plan-1',
      contribution_id: 'contrib-123',
      plan_json: JSON.stringify(canonicalPlan),
      status: 'pending_approval',
    };

    const executedQueries: { sql: string; bindings: unknown[] }[] = [];
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM collaboration_plans')) return planRow;
            if (sql.includes('FROM collaboration_task_executions')) return null;
            return null;
          }),
          run: vi.fn(async () => {
            executedQueries.push({ sql, bindings });
            return { meta: { changes: 1 } };
          }),
        })),
      })),
    };

    const env = { DB: mockDb, ASSETS: null } as unknown as Parameters<typeof executePlan>[0];
    const result = await executePlan(env, 'plan-1', 'admin@coldigom.com');

    expect(result.ok).toBe(true);
    expect(result.executedCount).toBe(1);
    expect(result.errors).toHaveLength(0);

    const updatePraise = executedQueries.find((q) => q.sql.includes('UPDATE praises SET'));
    expect(updatePraise).toBeDefined();
    expect(updatePraise?.bindings).toContain('G');
    expect(updatePraise?.bindings).toContain('praise-456');

    const updateContrib = executedQueries.find((q) => q.sql.includes('UPDATE contributions'));
    expect(updateContrib).toBeDefined();
    expect(updateContrib?.bindings).toContain('admin@coldigom.com');
  });

  it('executePlan resolve dependências dinâmicas entre tarefas encadeadas', async () => {
    const canonicalPlan = {
      summary: 'Criar louvor e vincular tag',
      todos: ['Criar louvor Teste', 'Vincular tag Louvor'],
      tasks: [
        {
          id: 'create_step',
          operation: 'create_praise',
          params: {
            name: 'Hino Teste',
            tonality: 'C',
          },
        },
        {
          id: 'tag_step',
          operation: 'attach_tag',
          depends_on: ['create_step'],
          params: {
            praise_id: 'task:create_step.result.id',
            tag_id: 'tag-adoracao',
          },
        },
      ],
    };

    const planRow = {
      id: 'plan-dynamic',
      contribution_id: 'contrib-new',
      plan_json: JSON.stringify(canonicalPlan),
      status: 'pending_approval',
    };

    const praiseInserts: unknown[][] = [];
    const tagInserts: unknown[][] = [];

    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM collaboration_plans')) return planRow;
            return null;
          }),
          run: vi.fn(async () => {
            if (sql.includes('INSERT INTO praises')) praiseInserts.push(bindings);
            if (sql.includes('INSERT OR IGNORE INTO praise_tags')) tagInserts.push(bindings);
            return { meta: { changes: 1 } };
          }),
        })),
      })),
    };

    const env = { DB: mockDb } as unknown as Parameters<typeof executePlan>[0];
    const result = await executePlan(env, 'plan-dynamic', 'admin@coldigom.com');

    expect(result.ok).toBe(true);
    expect(result.executedCount).toBe(2);
    expect(praiseInserts.length).toBe(1);
    const createdPraiseId = praiseInserts[0][0];
    expect(tagInserts.length).toBe(1);
    // Dynamic reference resolved successfully
    expect(tagInserts[0][0]).toBe(createdPraiseId);
    expect(tagInserts[0][1]).toBe('tag-adoracao');
  });
});

describe('Rotas Admin: /api/admin/contributions/:id/plan & approve', () => {
  it('POST /plan gera plano e retorna estrutura formatada', async () => {
    const contributionRow = {
      id: 'c1',
      user_id: 'u1',
      user_email: 'a@b.c',
      user_name: 'Ana',
      kind: 'wrong_info',
      subkind: 'metadata',
      target_source: 'coldigom',
      target_praise_id: 'p1',
      target_material_id: null,
      title: 'Tom errado',
      body: 'É Em',
      fields: JSON.stringify({ field: 'tonality', current: 'Dm', proposed: 'Em' }),
      links: '[]',
      device: null,
      app_route: '/',
      app_version: '1.0',
      status: 'pendente',
      scan_status: 'sem_arquivo',
      scan_report: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
      created_at: '2026-09-17 10:00:00',
      updated_at: '2026-09-17 10:00:00',
    };

    let savedPlanRow: Record<string, unknown> | null = null;

    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('SELECT') && sql.includes('FROM contributions')) return contributionRow;
            if (sql.includes('SELECT * FROM collaboration_plans WHERE id = ?')) return savedPlanRow;
            return null;
          }),
          run: vi.fn(async () => {
            if (sql.includes('INSERT INTO collaboration_plans')) {
              savedPlanRow = {
                id: bindings[0],
                contribution_id: bindings[1],
                model_name: bindings[2],
                summary: bindings[3],
                todos: bindings[4],
                plan_json: bindings[5],
                plan_hash: bindings[6],
                status: 'pending_approval',
              };
            }
            return { meta: { changes: 1 } };
          }),
        })),
      })),
    };

    const cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
    const res = await app.request(
      '/api/admin/contributions/c1/plan',
      {
        method: 'POST',
        headers: {
          cookie,
          origin: TEST_WEB_ORIGIN,
        },
      },
      { ...envAuth, DB: mockDb } as never
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; planId: string; plan: { summary: string; todos: string[] } };
    expect(json.ok).toBe(true);
    expect(json.planId).toBeDefined();
    expect(json.plan.summary).toContain('tonality');
  });

  it('POST /approve rejeita com 409 se o hash do plano estiver desatualizado (stale_plan)', async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (sql.includes('collaboration_plans')) {
              return { id: 'plan-1', plan_hash: 'hash-correto' };
            }
            return null;
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
    const res = await app.request(
      '/api/admin/contributions/c1/approve',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: TEST_WEB_ORIGIN,
        },
        body: JSON.stringify({
          plan_id: 'plan-1',
          plan_hash: 'hash-velho-ou-adulterado',
        }),
      },
      { ...envAuth, DB: mockDb } as never
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('stale_plan');
  });
});

describe('MCP Tools & Workers AI Flow', () => {
  it('getPraiseDetail recupera louvor, materiais e tags', async () => {
    const { getPraiseDetail } = await import('../agent/mcpTools');
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('SELECT * FROM praises') && bindings[0] === 'p1') {
              return { id: 'p1', name: 'Louvor 1' };
            }
            return null;
          }),
          all: vi.fn(async () => {
            if (sql.includes('praise_materials')) return { results: [{ id: 'm1', type: 'chord' }] };
            if (sql.includes('praise_tags')) return { results: [{ id: 't1', name: 'Comunhão' }] };
            return { results: [] };
          }),
        })),
      })),
    };

    const res = await getPraiseDetail(mockDb as unknown as D1Database, 'p1');
    expect(res).toBeDefined();
    expect(res?.id).toBe('p1');
    expect((res?.materials as unknown[]).length).toBe(1);
    expect((res?.tags as unknown[]).length).toBe(1);

    const missing = await getPraiseDetail(mockDb as unknown as D1Database, 'p_inexistente');
    expect(missing).toBeNull();
  });

  it('getChordContent lê conteúdo do R2', async () => {
    const { getChordContent } = await import('../agent/mcpTools');
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => ({ r2_key: 'praises/p1/m1.chord' })),
        })),
      })),
    };
    const mockAssets = {
      get: vi.fn(async (key: string) => ({
        text: async () => `[C]Louvai ao [G]Senhor (${key})`,
      })),
    };

    const content = await getChordContent(mockAssets as unknown as R2Bucket, mockDb as unknown as D1Database, 'm1');
    expect(content).toContain('[C]Louvai');

    const noAssets = await getChordContent(undefined, mockDb as unknown as D1Database, 'm1');
    expect(noAssets).toBeNull();
  });

  it('searchPraises busca louvores com FTS e fallback LIKE', async () => {
    const { searchPraises } = await import('../agent/mcpTools');
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            if (sql.includes('MATCH')) return { results: [{ id: 'p1', name: 'Castelo Forte' }] };
            return { results: [] };
          }),
        })),
      })),
    };

    const res = await searchPraises(mockDb as unknown as D1Database, 'Castelo');
    expect(res.length).toBe(1);
    expect(res[0].name).toBe('Castelo Forte');

    const empty = await searchPraises(mockDb as unknown as D1Database, '   ');
    expect(empty).toEqual([]);
  });

  it('planContribution executa com Workers AI e processa JSON embutido em markdown', async () => {
    const contributionRow = {
      id: 'c-ai',
      user_id: 'u1',
      user_email: 'u@test.com',
      user_name: 'Tester',
      kind: 'wrong_info',
      subkind: 'metadata',
      target_source: 'coldigom',
      target_praise_id: 'p1',
      target_material_id: null,
      title: 'Tom incorreto',
      body: 'Mudar tom para A',
      fields: '{"field":"tonality","proposed":"A"}',
      links: '[]',
      device: null,
      app_route: '/',
      app_version: '1.0',
      status: 'pendente',
      scan_status: 'sem_arquivo',
      scan_report: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
    };

    const mockAi = {
      run: vi.fn(async () => ({
        response: '```json\n{"summary": "Ajustar tom para Lá Maior", "todos": ["Mudar tonality para A"], "tasks": [{"id": "t1", "operation": "edit_praise_metadata", "params": {"praise_id": "p1", "fields": {"tonality": "A"}}}]}\n```',
      })),
    };

    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM contributions')) return contributionRow;
            return null;
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const env = { DB: mockDb, AI: mockAi } as unknown as Parameters<typeof planContribution>[0];
    const planId = await planContribution(env, 'c-ai');

    expect(planId).toBeDefined();
    expect(mockAi.run).toHaveBeenCalledWith('@cf/zai-org/glm-5.3-flash', expect.any(Object));
  });

  it('executePlan suporta update_chord_content', async () => {
    const planRow = {
      id: 'p-chord',
      contribution_id: 'c-chord',
      plan_json: JSON.stringify({
        summary: 'Atualizar cifra',
        todos: ['Atualizar acorde da estrofe 1'],
        tasks: [
          {
            id: 'task_ch',
            operation: 'update_chord_content',
            params: {
              material_id: 'mat-1',
              new_content: '[G]Senhor meu [D]Deus',
            },
          },
        ],
      }),
      status: 'pending_approval',
    };

    const mockAssets = {
      put: vi.fn(async () => {}),
    };

    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM collaboration_plans')) return planRow;
            if (sql.includes('FROM praise_materials')) return { praise_id: 'p1', r2_key: 'chords/p1/mat-1.chord' };
            return null;
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const env = { DB: mockDb, ASSETS: mockAssets } as unknown as Parameters<typeof executePlan>[0];
    const result = await executePlan(env, 'p-chord', 'admin@coldigom.com');

    expect(result.ok).toBe(true);
    expect(mockAssets.put).toHaveBeenCalledWith('chords/p1/mat-1.chord', '[G]Senhor meu [D]Deus', expect.any(Object));
  });

  it('searchPraises cai em fallback LIKE quando MATCH falha', async () => {
    const { searchPraises } = await import('../agent/mcpTools');
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => {
            if (sql.includes('MATCH')) throw new Error('FTS table not ready');
            if (sql.includes('LIKE')) return { results: [{ id: 'p2', name: 'Castelo Forte via LIKE' }] };
            return { results: [] };
          }),
        })),
      })),
    };

    const res = await searchPraises(mockDb as unknown as D1Database, 'Castelo');
    expect(res.length).toBe(1);
    expect(res[0].name).toBe('Castelo Forte via LIKE');
  });

  it('planContribution captura falha da IA e usa fallback silenciosamente', async () => {
    const contributionRow = {
      id: 'c-err',
      user_id: 'u1',
      user_email: 'u@test.com',
      user_name: 'Tester',
      kind: 'wrong_info',
      subkind: 'metadata',
      target_source: 'coldigom',
      target_praise_id: 'p1',
      target_material_id: null,
      title: 'Tom',
      body: 'Mudar tom',
      fields: '{"field":"tonality","proposed":"C"}',
      links: null,
      device: null,
      app_route: '/',
      app_version: '1.0',
      status: 'pendente',
      scan_status: 'sem_arquivo',
      scan_report: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
    };

    const mockAi = {
      run: vi.fn(async () => {
        throw new Error('Workers AI overloaded');
      }),
    };

    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM contributions')) return contributionRow;
            return null;
          }),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const env = { DB: mockDb, AI: mockAi } as unknown as Parameters<typeof planContribution>[0];
    const planId = await planContribution(env, 'c-err');
    expect(planId).toBeDefined();
  });

  it('planContribution retorna null se a contribuição não existir', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
        })),
      })),
    };
    const env = { DB: mockDb } as unknown as Parameters<typeof planContribution>[0];
    const res = await planContribution(env, 'inexistente');
    expect(res).toBeNull();
  });

  it('executePlan lida com erro de operação desconhecida e interrompe sequência', async () => {
    const planRow = {
      id: 'p-unk',
      contribution_id: 'c-unk',
      plan_json: JSON.stringify({
        summary: 'Operação inválida',
        todos: ['Fazer algo desconhecido'],
        tasks: [
          {
            id: 'task_bad',
            operation: 'operacao_inexistente_do_alem',
            params: {},
          },
        ],
      }),
      status: 'pending_approval',
    };

    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => planRow),
          run: vi.fn(async () => ({ meta: { changes: 1 } })),
        })),
      })),
    };

    const env = { DB: mockDb } as unknown as Parameters<typeof executePlan>[0];
    const res = await executePlan(env, 'p-unk', 'admin');
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('Operação de domínio não suportada');
  });

  it('GET /api/admin/contributions/:id retorna plano quando existente e 404 quando não existente', async () => {
    const cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...bindings: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('contributions WHERE id = ?') && bindings[0] === 'c-exists') {
              return {
                id: 'c-exists',
                user_id: 'u1',
                user_email: 'u@test.com',
                kind: 'wrong_info',
                title: 'T',
                body: 'B',
                status: 'pendente',
                fields: null,
                links: null,
                device: null,
                scan_report: null,
              };
            }
            if (sql.includes('collaboration_plans')) {
              return {
                id: 'pl-1',
                summary: 'Sum',
                todos: '["todo 1"]',
                plan_json: '{"summary":"Sum"}',
              };
            }
            return null;
          }),
          all: vi.fn(async () => ({ results: [] })),
        })),
      })),
    };

    const headers = { cookie, origin: TEST_WEB_ORIGIN };
    const res404 = await app.request('/api/admin/contributions/nao-existe', { headers }, { ...envAuth, DB: mockDb } as never);
    expect(res404.status).toBe(404);

    const res200 = await app.request('/api/admin/contributions/c-exists', { headers }, { ...envAuth, DB: mockDb } as never);
    expect(res200.status).toBe(200);
    const body = (await res200.json()) as { data: { plan: { summary: string } } };
    expect(body.data.plan.summary).toBe('Sum');
  });

  it('POST /plan e /approve retornam 404 quando recurso não existe', async () => {
    const cookie = `coldigom_access=${encodeURIComponent(await sessaoValida())}`;
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn(async () => null),
        })),
      })),
    };

    const planRes = await app.request(
      '/api/admin/contributions/nao-existe/plan',
      { method: 'POST', headers: { cookie, origin: TEST_WEB_ORIGIN } },
      { ...envAuth, DB: mockDb } as never
    );
    expect(planRes.status).toBe(404);

    const approveRes = await app.request(
      '/api/admin/contributions/nao-existe/approve',
      { method: 'POST', headers: { cookie, origin: TEST_WEB_ORIGIN } },
      { ...envAuth, DB: mockDb } as never
    );
    expect(approveRes.status).toBe(404);
  });
});

