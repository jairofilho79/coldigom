/**
 * Repositório de `contributions` / `contribution_files` (migração 020, spec §3).
 * Nenhuma query aqui decide regra de negócio — quem decide status/cota é a rota
 * (Task 7) e o consumer da fila (Task 8); este módulo só lê e escreve linhas.
 */
import type { ContributionPayload } from './schema';

export type ContributionRow = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  kind: string;
  subkind: string | null;
  target_source: string | null;
  target_praise_id: string | null;
  target_material_id: string | null;
  title: string;
  body: string;
  fields: string | null;
  links: string | null;
  device: string | null;
  app_route: string | null;
  app_version: string | null;
  status: string;
  scan_status: string;
  scan_report: string | null;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
};

export type ContributionFileRow = {
  id: string;
  contribution_id: string;
  original_name: string;
  declared_type: string;
  detected_type: string | null;
  size: number;
  sha256: string;
  r2_key: string;
  scan_status: string;
  scan_detail: string | null;
  created_at: string;
};

export const CONTRIBUTION_COLS = `id, user_id, user_email, user_name, kind, subkind, target_source, target_praise_id, target_material_id, title, body, fields, links, device, app_route, app_version, status, scan_status, scan_report, decided_at, decided_by, decision_note, created_at, updated_at`;

export function insertContributionStmt(
  db: D1Database,
  r: { id: string; userId: string; userEmail: string; userName: string | null; payload: ContributionPayload; status: 'recebida' | 'pendente'; scanStatus: 'pendente' | 'sem_arquivo' }
): D1PreparedStatement {
  const p = r.payload;
  // safe_browsing começa 'pending' aqui; a Task 8 é quem grava 'clean'/'unsafe'
  // depois de consultar o Safe Browsing.
  const links = p.links.map((url) => ({ url, host: new URL(url).hostname, safe_browsing: 'pending' }));
  return db
    .prepare(
      `INSERT INTO contributions (id, user_id, user_email, user_name, kind, subkind, target_source, target_praise_id, target_material_id, title, body, fields, links, device, app_route, app_version, status, scan_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      r.id,
      r.userId,
      r.userEmail,
      r.userName,
      p.kind,
      p.subkind,
      p.target?.source ?? null,
      p.target?.praiseId ?? null,
      p.target?.materialId ?? null,
      p.title,
      p.body,
      JSON.stringify(p.fields),
      JSON.stringify(links),
      p.device ? JSON.stringify(p.device) : null,
      p.appRoute,
      p.appVersion,
      r.status,
      r.scanStatus
    );
}

export function insertFileStmt(
  db: D1Database,
  f: { id: string; contributionId: string; originalName: string; declaredType: string; size: number; sha256: string; r2Key: string }
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO contribution_files (id, contribution_id, original_name, declared_type, size, sha256, r2_key) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(f.id, f.contributionId, f.originalName, f.declaredType, f.size, f.sha256, f.r2Key);
}

export async function getContribution(db: D1Database, id: string): Promise<ContributionRow | null> {
  return (await db.prepare(`SELECT ${CONTRIBUTION_COLS} FROM contributions WHERE id = ?`).bind(id).first<ContributionRow>()) ?? null;
}

export async function getContributionForUser(db: D1Database, id: string, userId: string): Promise<ContributionRow | null> {
  return (await db.prepare(`SELECT ${CONTRIBUTION_COLS} FROM contributions WHERE id = ? AND user_id = ?`).bind(id, userId).first<ContributionRow>()) ?? null;
}

export async function listFiles(db: D1Database, contributionId: string): Promise<ContributionFileRow[]> {
  const { results } = await db.prepare(`SELECT * FROM contribution_files WHERE contribution_id = ? ORDER BY created_at, id`).bind(contributionId).all<ContributionFileRow>();
  return results ?? [];
}

export function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(s: string): { createdAt: string; id: string } | null {
  try {
    const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const at = raw.lastIndexOf('|');
    if (at <= 0) return null;
    return { createdAt: raw.slice(0, at), id: raw.slice(at + 1) };
  } catch {
    return null;
  }
}

/** Paginação por (created_at, id) desc — estável mesmo com dois envios no mesmo segundo. */
export async function listMine(db: D1Database, userId: string, cursor: string | null, limit: number): Promise<{ rows: ContributionRow[]; nextCursor: string | null }> {
  const c = cursor ? decodeCursor(cursor) : null;
  const where = c ? `user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))` : `user_id = ?`;
  const bindings = c ? [userId, c.createdAt, c.createdAt, c.id, limit + 1] : [userId, limit + 1];
  const { results } = await db.prepare(`SELECT ${CONTRIBUTION_COLS} FROM contributions WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...bindings).all<ContributionRow>();
  const rows = results ?? [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null };
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** O que o próprio usuário vê. Nunca `device` cru, `scan_report`, `scan_detail` nem `r2_key`. */
export function toUserJson(row: ContributionRow, files: ContributionFileRow[]) {
  return {
    id: row.id,
    kind: row.kind,
    subkind: row.subkind,
    title: row.title,
    body: row.body,
    target: row.target_source ? { source: row.target_source, praiseId: row.target_praise_id, materialId: row.target_material_id } : null,
    fields: parseJson<Record<string, unknown>>(row.fields, {}),
    links: parseJson<{ url: string }[]>(row.links, []).map((l) => l.url),
    status: row.status,
    decision_note: row.decision_note,
    created_at: row.created_at,
    updated_at: row.updated_at,
    files: files.map((f) => ({ id: f.id, original_name: f.original_name, size: f.size, scan_status: f.scan_status })),
  };
}
