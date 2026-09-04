import type { App } from '../env';
import type { AppContext } from '../middleware';
import { requireAuth } from '../middleware';
import { parseListNumbers } from '../queryParams';

/**
 * Fila de revisão da validação do acervo (spec §6).
 *
 * Esta rota grava SÓ em validation_findings. Quem escreve no acervo é o
 * scripts/validate-acervo/core/apply.py, depois de queue.py puxar os
 * 'aprovado' daqui — por isso 'aplicado' é recusado na API: é o script que
 * marca, quando a escrita de fato aconteceu.
 */
export const FAIXAS = ['alta', 'media', 'baixa', 'discussao'] as const;
export const STATUS = ['pendente', 'discussao', 'aprovado', 'rejeitado', 'aplicado'] as const;
export type Faixa = (typeof FAIXAS)[number];
export type Status = (typeof STATUS)[number];

export type FindingRow = {
  id: string;
  run_id: string;
  detector: string;
  target_type: string;
  target_id: string;
  praise_id: string | null;
  action: string;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  confidence: Faixa;
  evidence: unknown;
  status: Status;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  target_name: string | null;
  proposed_name: string | null;
};

const SELECT = `SELECT vf.*, pt.name AS target_name, pp.name AS proposed_name
  FROM validation_findings vf
  LEFT JOIN praises pt ON vf.target_type = 'praise' AND pt.id = vf.target_id
  LEFT JOIN praises pp ON vf.action IN ('merge_praise', 'set_group_id') AND pp.id = vf.proposed_value`;

/** A evidência é JSON por detector; se estiver quebrada, a string crua vale mais que um 500. */
function desserializar(linha: Record<string, unknown>): FindingRow {
  let evidence: unknown = linha.evidence;
  if (typeof evidence === 'string') {
    try { evidence = JSON.parse(evidence); } catch { /* fica a string */ }
  }
  return { ...(linha as Omit<FindingRow, 'evidence'>), evidence };
}

export async function lerFinding(db: D1Database, id: string): Promise<FindingRow | null> {
  const linha = await db.prepare(`${SELECT} WHERE vf.id = ?`).bind(id).first<Record<string, unknown>>();
  return linha ? desserializar(linha) : null;
}

const DECIDIVEIS = ['pendente', 'discussao', 'aprovado', 'rejeitado'] as const;
type Decisao = { status: (typeof DECIDIVEIS)[number]; decision_note: string | null };

/** Lê e valida { status, decision_note } de um corpo JSON; devolve a mensagem de erro ou a decisão. */
function lerDecisao(body: Record<string, unknown>): { ok: true; decisao: Decisao } | { ok: false; error: string } {
  const status = body.status;
  if (status === 'aplicado') {
    return { ok: false, error: "O status 'aplicado' é gravado pelo apply, não pela tela" };
  }
  if (typeof status !== 'string' || !(DECIDIVEIS as readonly string[]).includes(status)) {
    return { ok: false, error: `Field 'status' must be one of: ${DECIDIVEIS.join(', ')}` };
  }
  let decision_note: string | null = null;
  if ('decision_note' in body && body.decision_note != null) {
    if (typeof body.decision_note !== 'string') return { ok: false, error: "Field 'decision_note' must be a string" };
    decision_note = body.decision_note.trim() || null;
  }
  return { ok: true, decisao: { status: status as Decisao['status'], decision_note } };
}

const UPDATE = `UPDATE validation_findings
  SET status = ?, decision_note = ?, decided_by = ?, decided_at = datetime('now')
  WHERE id = ? AND status <> 'aplicado'`;

export function registerValidationRoutes(app: App): void {
  // GET /api/validation/findings — a fila, filtrável, paginada (admin)
  app.get('/api/validation/findings', requireAuth, async (c) => {
    const numeros = parseListNumbers({ page: c.req.query('page'), limit: c.req.query('limit') });
    if (!numeros.ok) return c.json({ error: numeros.error }, 400);
    const { page, limit, offset } = numeros;

    const where: string[] = [];
    const bindings: (string | number)[] = [];
    const igual = (coluna: string, valor: string | undefined) => {
      if (valor) { where.push(`vf.${coluna} = ?`); bindings.push(valor); }
    };
    const confidence = c.req.query('confidence');
    if (confidence && !(FAIXAS as readonly string[]).includes(confidence)) {
      return c.json({ error: `Parâmetro 'confidence' deve ser um de: ${FAIXAS.join(', ')}` }, 400);
    }
    const status = c.req.query('status');
    if (status && !(STATUS as readonly string[]).includes(status)) {
      return c.json({ error: `Parâmetro 'status' deve ser um de: ${STATUS.join(', ')}` }, 400);
    }
    igual('detector', c.req.query('detector'));
    igual('confidence', confidence);
    igual('status', status);
    igual('praise_id', c.req.query('praise_id'));
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    try {
      const lista = await c.env.DB.prepare(`${SELECT}${clause} ORDER BY vf.praise_id, vf.id LIMIT ? OFFSET ?`)
        .bind(...bindings, limit, offset)
        .all<Record<string, unknown>>();
      const contagem = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM validation_findings vf${clause}`)
        .bind(...bindings)
        .first<{ total: number }>();
      const total = contagem?.total ?? 0;
      return c.json({
        data: (lista.results ?? []).map(desserializar),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Error listing validation findings:', error);
      return c.json({ error: 'Failed to list validation findings' }, 500);
    }
  });

  // POST /api/validation/findings/bulk — a mesma decisão para vários achados (admin)
  app.post('/api/validation/findings/bulk', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || !ids.every((i) => typeof i === 'string' && i)) {
      return c.json({ error: "Field 'ids' must be a list of 1 to 100 ids" }, 400);
    }
    const lida = lerDecisao(body);
    if (!lida.ok) return c.json({ error: lida.error }, 400);
    const quem = ator(c);
    try {
      // Um batch: ou o lote inteiro decide, ou nada — meio lote decidido é o
      // pior estado para quem está olhando 7 candidatos do mesmo louvor.
      const resultados = await c.env.DB.batch(
        (ids as string[]).map((id) => c.env.DB.prepare(UPDATE).bind(lida.decisao.status, lida.decisao.decision_note, quem, id))
      );
      const atualizados = resultados.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
      return c.json({ data: { atualizados } });
    } catch (error) {
      console.error('Error bulk-deciding validation findings:', error);
      return c.json({ error: 'Failed to decide validation findings' }, 500);
    }
  });

  // PATCH /api/validation/findings/:id — decidir um achado (admin)
  app.patch('/api/validation/findings/:id', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const lida = lerDecisao(body);
    if (!lida.ok) return c.json({ error: lida.error }, 400);
    try {
      const escrita = await c.env.DB.prepare(UPDATE)
        .bind(lida.decisao.status, lida.decisao.decision_note, ator(c), id)
        .run();
      const linha = await lerFinding(c.env.DB, id);
      if (!linha) return c.json({ error: 'Finding not found' }, 404);
      if ((escrita.meta?.changes ?? 0) === 0) {
        // Existe mas o UPDATE não pegou: só o WHERE status <> 'aplicado' explica.
        return c.json({ error: 'Este achado já foi aplicado no acervo; não há mais o que decidir' }, 409);
      }
      return c.json({ data: linha });
    } catch (error) {
      console.error('Error deciding validation finding:', error);
      return c.json({ error: 'Failed to decide validation finding' }, 500);
    }
  });
}

/** Quem decidiu: o mesmo critério de reviewed_by em materials.ts. */
export function ator(c: AppContext): string | null {
  const u = c.get('user');
  return u?.email ?? u?.name ?? u?.sub ?? null;
}
