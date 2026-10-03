import type { Env } from '../env';
import { CURATOR_SYSTEM_PROMPT } from './curatorPrompt';
import { getPraiseDetail, getChordContent, KNOWLEDGE_PACKAGE } from './mcpTools';
import type { ContributionRow } from '../contributions/repo';

export type PlanTask = {
  id: string;
  operation: string;
  params: Record<string, unknown>;
  depends_on?: string[];
  conditions?: Record<string, unknown>;
};

export type CanonicalPlan = {
  summary: string;
  todos: string[];
  tasks: PlanTask[];
};

async function sha256String(str: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseModelJson(rawText: string): CanonicalPlan | null {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned) as CanonicalPlan;
    if (parsed && typeof parsed.summary === 'string' && Array.isArray(parsed.todos)) {
      return {
        summary: parsed.summary,
        todos: parsed.todos.map(String),
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      };
    }
  } catch (err) {
    console.error('Falha ao parsear JSON do modelo:', err, rawText);
  }
  return null;
}

/**
 * Fallback determinístico para testes locais ou quando o binding Workers AI não estiver acessível.
 */
function generateFallbackPlan(contrib: ContributionRow): CanonicalPlan {
  let fieldsObj: Record<string, unknown> = {};
  try {
    if (contrib.fields) fieldsObj = JSON.parse(contrib.fields);
  } catch { /* vazio */ }

  if ((contrib.subkind === 'metadata' || contrib.subkind === 'wrong_metadata') && fieldsObj.field && fieldsObj.proposed && contrib.target_praise_id) {
    const fieldName = String(fieldsObj.field);
    const proposedVal = fieldsObj.proposed;
    return {
      summary: `Correção de metadados: alterar ${fieldName}`,
      todos: [`Atualizar campo ${fieldName} para "${proposedVal}"`],
      tasks: [
        {
          id: 'task_1',
          operation: 'edit_praise_metadata',
          params: {
            praise_id: contrib.target_praise_id,
            fields: { [fieldName]: proposedVal },
          },
        },
      ],
    };
  }

  return {
    summary: `Análise da contribuição: ${contrib.title}`,
    todos: [
      `Verificar relato: ${contrib.title}`,
      `Descrição: ${contrib.body.slice(0, 100)}...`,
    ],
    tasks: [],
  };
}

export async function planContribution(env: Env, contributionId: string): Promise<string | null> {
  const db = env.DB;
  const assets = env.ASSETS;

  const contrib = await db
    .prepare(`SELECT * FROM contributions WHERE id = ?`)
    .bind(contributionId)
    .first<ContributionRow>();

  if (!contrib) {
    console.warn(`Contribuição ${contributionId} não encontrada para planejamento`);
    return null;
  }

  // Atualiza status para em análise / planejando
  await db
    .prepare(`UPDATE contributions SET status = 'em_analise', updated_at = datetime('now') WHERE id = ?`)
    .bind(contributionId)
    .run();

  // Coleta dados via MCP tools de leitura
  let targetPraiseContext: Record<string, unknown> | null = null;
  let targetChordContent: string | null = null;

  if (contrib.target_praise_id) {
    targetPraiseContext = await getPraiseDetail(db, contrib.target_praise_id);
    if (contrib.target_material_id) {
      targetChordContent = await getChordContent(assets, db, contrib.target_material_id);
    }
  }

  const promptUserContext = {
    contribution: {
      id: contrib.id,
      kind: contrib.kind,
      subkind: contrib.subkind,
      title: contrib.title,
      body: contrib.body,
      fields: contrib.fields ? JSON.parse(contrib.fields) : null,
      links: contrib.links ? JSON.parse(contrib.links) : null,
      target_praise_id: contrib.target_praise_id,
      target_material_id: contrib.target_material_id,
    },
    target_praise_state: targetPraiseContext,
    target_chord_content: targetChordContent,
    catalog_rules: KNOWLEDGE_PACKAGE,
  };

  let plan: CanonicalPlan | null = null;
  const modelName = '@cf/zai-org/glm-5.3-flash';

  if (env.AI && typeof env.AI.run === 'function') {
    try {
      const aiResponse = await env.AI.run(modelName, {
        messages: [
          { role: 'system', content: CURATOR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Analise esta contribuição do Coldigui e retorne o plano canônico:\n\n${JSON.stringify(promptUserContext, null, 2)}`,
          },
        ],
        temperature: 0.1,
      });

      const responseText = typeof aiResponse === 'string'
        ? aiResponse
        : ((aiResponse as { response?: string })?.response || JSON.stringify(aiResponse));

      plan = parseModelJson(responseText);
    } catch (err) {
      console.error('Erro ao chamar Workers AI GLM-5.3-flash:', err);
    }
  }

  if (!plan) {
    plan = generateFallbackPlan(contrib);
  }

  const planId = crypto.randomUUID();
  const canonicalJson = JSON.stringify(plan);
  const planHash = await sha256String(canonicalJson);

  // Grava o plano no D1
  await db
    .prepare(
      `INSERT INTO collaboration_plans (
        id, contribution_id, version, model_name, summary, todos,
        plan_json, plan_hash, status
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'pending_approval')`
    )
    .bind(
      planId,
      contributionId,
      modelName,
      plan.summary,
      JSON.stringify(plan.todos),
      canonicalJson,
      planHash
    )
    .run();

  // Atualiza contribuição para pendente (aguardando aprovação humana)
  await db
    .prepare(`UPDATE contributions SET status = 'pendente', updated_at = datetime('now') WHERE id = ?`)
    .bind(contributionId)
    .run();

  return planId;
}
