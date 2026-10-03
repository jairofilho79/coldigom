import type { App } from '../env';
import { requireAuth } from '../middleware';
import { CONTENT_TYPES, type DeclaredType } from '../contributions/sniff';
import { CONTRIBUTION_COLS, getContribution, listFiles, listFilesForContributions, type ContributionRow } from '../contributions/repo';
import { KINDS } from '../contributions/schema';

const STATUSES = ['recebida', 'bloqueada', 'pendente', 'em_analise', 'aceita', 'recusada', 'aplicada'] as const;
const DECIDIVEIS = ['em_analise', 'aceita', 'recusada', 'aplicada'] as const;
const PAGE = 50;

function parseJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Visão do admin: tudo, com os JSONs abertos e plano da IA quando houver. */
function toAdminJson(row: ContributionRow, files: unknown[], plan: unknown = null) {
  return {
    ...row,
    fields: parseJson(row.fields),
    links: parseJson(row.links),
    device: parseJson(row.device),
    scan_report: parseJson(row.scan_report),
    files,
    plan,
  };
}

/**
 * RFC 6266 + RFC 5987: `filename=` é o fallback ASCII (todo byte fora do
 * imprimível vira `_`, e aspas somem — é o que vai para quem ignora `filename*`)
 * e `filename*=UTF-8''...` é o nome de verdade, percent-encoded, para quem lê.
 */
function contentDisposition(originalName: string): string {
  const ascii = originalName.replace(/"/g, '').replace(/[^\x20-\x7e]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
}

export function registerContributionsAdminRoutes(app: App) {
  app.get('/api/admin/contributions', requireAuth, async (c) => {
    const status = c.req.query('status');
    const kind = c.req.query('kind');
    const praise = c.req.query('praise');
    if (status && !(STATUSES as readonly string[]).includes(status)) return c.json({ error: 'invalid_status' }, 400);
    if (kind && !(KINDS as readonly string[]).includes(kind)) return c.json({ error: 'invalid_kind' }, 400);
    const pageRaw = c.req.query('page');
    let page = 1;
    if (pageRaw !== undefined) {
      const n = Number(pageRaw);
      // `Number('1e400')` é `Infinity` (finito falha) e `1.5` passa em
      // `Number.isFinite` mas não é uma página de verdade — as duas formas
      // viravam `LIMIT`/`OFFSET` sem sentido antes desta checagem.
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return c.json({ error: 'invalid_page' }, 400);
      page = n;
    }
    const where: string[] = [];
    const bindings: unknown[] = [];
    if (status) {
      where.push('status = ?');
      bindings.push(status);
    }
    if (kind) {
      where.push('kind = ?');
      bindings.push(kind);
    }
    if (praise) {
      where.push('target_praise_id = ?');
      bindings.push(praise);
    }
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total =
      (await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM contributions ${sqlWhere}`).bind(...bindings).first<{ total: number }>())?.total ?? 0;
    const { results } = await c.env.DB.prepare(
      `SELECT ${CONTRIBUTION_COLS} FROM contributions ${sqlWhere} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, PAGE, (page - 1) * PAGE)
      .all<ContributionRow>();
    const rows = results ?? [];
    // Uma consulta só para os arquivos de todas as linhas da página — nada de
    // `listFiles` em loop (N+1: 50 linhas viravam 50 SELECTs).
    const filesByContribution = await listFilesForContributions(
      c.env.DB,
      rows.map((row) => row.id)
    );
    const data = rows.map((row) => toAdminJson(row, filesByContribution.get(row.id) ?? []));
    return c.json({ data, pagination: { page, limit: PAGE, total, totalPages: Math.max(1, Math.ceil(total / PAGE)) } });
  });

  app.get('/api/admin/contributions/:id', requireAuth, async (c) => {
    const row = await getContribution(c.env.DB, c.req.param('id') as string);
    if (!row) return c.json({ error: 'not_found' }, 404);
    const files = await listFiles(c.env.DB, row.id);

    const planRow = await c.env.DB
      .prepare(`SELECT * FROM collaboration_plans WHERE contribution_id = ? ORDER BY version DESC LIMIT 1`)
      .bind(row.id)
      .first<{ todos: string; plan_json: string; [k: string]: unknown }>();

    let plan: Record<string, unknown> | null = null;
    if (planRow) {
      plan = {
        ...planRow,
        todos: parseJson(planRow.todos),
        plan_json: parseJson(planRow.plan_json),
      };
    }

    return c.json({ data: toAdminJson(row, files, plan) });
  });

  // POST /api/admin/contributions/:id/plan - Gera plano de TODOs com IA
  app.post('/api/admin/contributions/:id/plan', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const row = await getContribution(c.env.DB, id);
    if (!row) return c.json({ error: 'not_found' }, 404);

    const { planContribution } = await import('../agent/planner');
    const planId = await planContribution(c.env, id);

    const planRow = await c.env.DB
      .prepare(`SELECT * FROM collaboration_plans WHERE id = ?`)
      .bind(planId)
      .first<{ todos: string; plan_json: string; [k: string]: unknown }>();

    let plan: Record<string, unknown> | null = null;
    if (planRow) {
      plan = {
        ...planRow,
        todos: parseJson(planRow.todos),
        plan_json: parseJson(planRow.plan_json),
      };
    }

    return c.json({ ok: true, planId, plan });
  });

  // POST /api/admin/contributions/:id/approve - Aprova plano e executa deterministicamente no Cloudflare
  app.post('/api/admin/contributions/:id/approve', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const user = c.get('user');
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

    const planId = (body.plan_id as string) || undefined;
    const planHash = (body.plan_hash as string) || undefined;
    const decisionNote = typeof body.decision_note === 'string' ? body.decision_note.trim() : undefined;

    let planStmt = `SELECT * FROM collaboration_plans WHERE contribution_id = ?`;
    const bindings: string[] = [id];
    if (planId) {
      planStmt += ` AND id = ?`;
      bindings.push(planId);
    } else {
      planStmt += ` ORDER BY version DESC LIMIT 1`;
    }

    const plan = await c.env.DB.prepare(planStmt).bind(...bindings).first<{ id: string; plan_hash: string }>();
    if (!plan) return c.json({ error: 'plan_not_found', message: 'Nenhum plano encontrado para aprovar' }, 404);

    if (planHash && plan.plan_hash !== planHash) {
      return c.json({ error: 'stale_plan', message: 'O plano foi modificado e precisa de nova aprovação' }, 409);
    }

    if (decisionNote) {
      await c.env.DB
        .prepare(`UPDATE contributions SET decision_note = ? WHERE id = ?`)
        .bind(decisionNote, id)
        .run();
    }

    const { executePlan } = await import('../agent/executor');
    const result = await executePlan(c.env, plan.id, user.email || 'admin');

    if (!result.ok) {
      return c.json({ error: 'execution_failed', errors: result.errors }, 500);
    }

    return c.json({
      ok: true,
      message: 'Plano aprovado e executado com sucesso',
      executed_tasks: result.executedCount,
    });
  });

  app.get('/api/admin/contributions/:id/files/:fileId', requireAuth, async (c) => {
    const row = await getContribution(c.env.DB, c.req.param('id') as string);
    if (!row) return c.json({ error: 'not_found' }, 404);
    const file = (await listFiles(c.env.DB, row.id)).find((f) => f.id === c.req.param('fileId'));
    if (!file) return c.json({ error: 'not_found' }, 404);
    // Só o que passou pelo scan sai daqui; quarentena nunca é servida.
    if (file.scan_status !== 'limpa' || file.r2_key.startsWith('quarantine/')) return c.json({ error: 'file_not_clean' }, 409);
    const obj = await c.env.ASSETS.get(file.r2_key);
    if (!obj) return c.json({ error: 'not_found' }, 404);
    const type = (file.detected_type ?? file.declared_type) as DeclaredType;
    return new Response(obj.body as ReadableStream, {
      status: 200,
      headers: {
        'content-type': CONTENT_TYPES[type] ?? 'application/octet-stream',
        'content-disposition': contentDisposition(file.original_name),
        'x-content-type-options': 'nosniff',
        'content-security-policy': 'sandbox',
        'cache-control': 'private, no-store',
      },
    });
  });

  app.patch('/api/admin/contributions/:id', requireAuth, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status;
    if (typeof status !== 'string' || !(DECIDIVEIS as readonly string[]).includes(status)) {
      return c.json({ error: `Field 'status' must be one of: ${DECIDIVEIS.join(', ')}` }, 400);
    }
    // "Opcional" é "não mexe": só grava decision_note quando a chave veio no
    // corpo. `null`/'' explícitos zeram a nota; omitir a chave preserva a atual.
    const hasNote = Object.prototype.hasOwnProperty.call(body, 'decision_note');
    let note: string | null = null;
    if (hasNote) {
      if (body.decision_note !== null && typeof body.decision_note !== 'string') {
        return c.json({ error: "Field 'decision_note' must be a string" }, 400);
      }
      note = typeof body.decision_note === 'string' ? body.decision_note.trim() || null : null;
    }
    const user = c.get('user');
    const setClauses = ['status = ?'];
    const bindings: unknown[] = [status];
    if (hasNote) {
      setClauses.push('decision_note = ?');
      bindings.push(note);
    }
    setClauses.push('decided_by = ?', "decided_at = datetime('now')", "updated_at = datetime('now')");
    bindings.push(user.email, c.req.param('id'));
    // recebida/bloqueada são do scan: o admin não decide sobre o que ainda não foi verificado.
    const r = await c.env.DB.prepare(
      `UPDATE contributions SET ${setClauses.join(', ')}
       WHERE id = ? AND status IN ('pendente', 'em_analise', 'aceita', 'recusada', 'aplicada')`
    )
      .bind(...bindings)
      .run();
    if (!r.meta.changes) return c.json({ error: 'not_found_or_not_decidable' }, 404);
    const row = await getContribution(c.env.DB, c.req.param('id') as string);
    return c.json({ data: row ? toAdminJson(row, await listFiles(c.env.DB, row.id)) : null });
  });
}
