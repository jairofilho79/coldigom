import type { Env } from '../env';
import type { CanonicalPlan } from './planner';

type ExecutionResult = {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

async function sha256Key(text: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolveParamValue(
  val: unknown,
  taskResults: Map<string, Record<string, unknown>>
): unknown {
  if (typeof val === 'string' && val.startsWith('task:')) {
    // Ex: "task:task_1.result.id"
    const match = val.match(/^task:([^.]+)\.result\.(.+)$/);
    if (match) {
      const [, sourceTaskId, field] = match;
      const res = taskResults.get(sourceTaskId);
      if (res && field in res) {
        return res[field];
      }
    }
  } else if (val && typeof val === 'object' && !Array.isArray(val)) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      resolved[k] = resolveParamValue(v, taskResults);
    }
    return resolved;
  }
  return val;
}

export async function executePlan(
  env: Env,
  planId: string,
  userSub: string
): Promise<{ ok: boolean; executedCount: number; errors: string[] }> {
  const db = env.DB;
  const assets = env.ASSETS;

  const planRow = await db
    .prepare(`SELECT * FROM collaboration_plans WHERE id = ?`)
    .bind(planId)
    .first<{
      id: string;
      contribution_id: string;
      plan_json: string;
      status: string;
    }>();

  if (!planRow) {
    throw new Error('Plano não encontrado');
  }

  const plan = JSON.parse(planRow.plan_json) as CanonicalPlan;
  const tasks = plan.tasks || [];
  const taskResults = new Map<string, Record<string, unknown>>();
  const errors: string[] = [];
  let executedCount = 0;

  for (const task of tasks) {
    // Resolve referências de parâmetros
    const resolvedParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(task.params || {})) {
      resolvedParams[k] = resolveParamValue(v, taskResults);
    }

    const idempotencyKey = await sha256Key(
      `${planId}:${task.id}:${JSON.stringify(resolvedParams)}`
    );

    // Confere se já foi executada
    const existing = await db
      .prepare(`SELECT * FROM collaboration_task_executions WHERE idempotency_key = ?`)
      .bind(idempotencyKey)
      .first<{ status: string; result_data: string | null }>();

    if (existing && existing.status === 'completed') {
      try {
        if (existing.result_data) {
          taskResults.set(task.id, JSON.parse(existing.result_data));
        }
      } catch { /* vazio */ }
      executedCount++;
      continue;
    }

    const execId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO collaboration_task_executions (
          id, plan_id, task_id, operation, status, idempotency_key, resolved_params
        ) VALUES (?, ?, ?, ?, 'running', ?, ?)`
      )
      .bind(
        execId,
        planId,
        task.id,
        task.operation,
        idempotencyKey,
        JSON.stringify(resolvedParams)
      )
      .run();

    let res: ExecutionResult = { ok: false, error: 'Operação desconhecida' };

    try {
      switch (task.operation) {
        case 'edit_praise_metadata': {
          const praiseId = String(resolvedParams.praise_id);
          const fields = (resolvedParams.fields as Record<string, unknown>) || {};
          const allowed = ['name', 'number', 'author', 'rhythm', 'tonality', 'lyrics'];

          const sets: string[] = [];
          const bindings: (string | number)[] = [];

          for (const [k, v] of Object.entries(fields)) {
            if (allowed.includes(k) && typeof v === 'string') {
              sets.push(`${k} = ?`);
              bindings.push(v);
            }
          }

          if (sets.length > 0) {
            sets.push(`updated_at = datetime('now')`);
            bindings.push(praiseId);
            await db
              .prepare(`UPDATE praises SET ${sets.join(', ')} WHERE id = ?`)
              .bind(...bindings)
              .run();
            res = { ok: true, data: { praise_id: praiseId } };
          } else {
            res = { ok: true, data: { message: 'Nenhum campo para atualizar' } };
          }
          break;
        }

        case 'update_chord_content': {
          const materialId = String(resolvedParams.material_id);
          const newContent = String(resolvedParams.new_content);

          const mat = await db
            .prepare(`SELECT * FROM praise_materials WHERE id = ? AND type = 'chord'`)
            .bind(materialId)
            .first<{ praise_id: string; r2_key: string | null }>();

          if (!mat) {
            res = { ok: false, error: `Material chord ${materialId} não encontrado` };
          } else {
            const r2Key = mat.r2_key || `assets/praises/${mat.praise_id}/${materialId}.chord`;
            if (assets) {
              await assets.put(r2Key, newContent, {
                httpMetadata: { contentType: 'text/plain; charset=utf-8' },
              });
            }
            await db
              .prepare(`UPDATE praise_materials SET is_reviewed = 0, r2_key = ? WHERE id = ?`)
              .bind(r2Key, materialId)
              .run();
            res = { ok: true, data: { material_id: materialId, r2_key: r2Key } };
          }
          break;
        }

        case 'attach_tag': {
          const praiseId = String(resolvedParams.praise_id);
          const tagId = String(resolvedParams.tag_id);

          await db
            .prepare(`INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)`)
            .bind(praiseId, tagId)
            .run();

          res = { ok: true, data: { praise_id: praiseId, tag_id: tagId } };
          break;
        }

        case 'create_praise': {
          const newId = crypto.randomUUID();
          const name = String(resolvedParams.name || 'Sem título');
          const number = resolvedParams.number ? String(resolvedParams.number) : null;
          const author = resolvedParams.author ? String(resolvedParams.author) : null;
          const tonality = resolvedParams.tonality ? String(resolvedParams.tonality) : null;
          const rhythm = resolvedParams.rhythm ? String(resolvedParams.rhythm) : null;
          const lyrics = resolvedParams.lyrics ? String(resolvedParams.lyrics) : null;

          await db
            .prepare(
              `INSERT INTO praises (id, name, number, author, tonality, rhythm, lyrics)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(newId, name, number, author, tonality, rhythm, lyrics)
            .run();

          res = { ok: true, data: { id: newId } };
          break;
        }

        default:
          res = { ok: false, error: `Operação de domínio não suportada: ${task.operation}` };
      }
    } catch (e) {
      res = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    if (res.ok) {
      if (res.data) taskResults.set(task.id, res.data);
      await db
        .prepare(
          `UPDATE collaboration_task_executions
           SET status = 'completed', result_data = ?
           WHERE id = ?`
        )
        .bind(JSON.stringify(res.data || {}), execId)
        .run();
      executedCount++;
    } else {
      errors.push(`Task ${task.id} (${task.operation}): ${res.error}`);
      await db
        .prepare(
          `UPDATE collaboration_task_executions
           SET status = 'failed', error_message = ?
           WHERE id = ?`
        )
        .bind(res.error || 'Erro desconhecido', execId)
        .run();
      break; // Interrompe a sequência ao encontrar erro
    }
  }

  const success = errors.length === 0;

  if (success) {
    await db
      .prepare(
        `UPDATE collaboration_plans
         SET status = 'applied', decided_at = datetime('now'), decided_by = ?
         WHERE id = ?`
      )
      .bind(userSub, planId)
      .run();

    await db
      .prepare(
        `UPDATE contributions
         SET status = 'aplicada', decided_at = datetime('now'), decided_by = ?
         WHERE id = ?`
      )
      .bind(userSub, planRow.contribution_id)
      .run();
  }

  return { ok: success, executedCount, errors };
}
