/**
 * Cota diária de contribuições (spec §4.2): 20 envios / 200 MB por usuário
 * por dia UTC. A mesma tabela guarda uma linha reservada (`VT_USER`) para o
 * contador global de consultas ao VirusTotal — a Task 8 lê/atualiza por ali.
 */
export const MAX_DAILY_COUNT = 20;
export const MAX_DAILY_BYTES = 200 * 1024 * 1024;
export const VT_DAILY_LIMIT = 450;
/** Linha reservada de contribution_quota para o contador global do VirusTotal. */
export const VT_USER = '_vt';

export function dayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function resetAtUtc(now: Date = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function readQuota(db: D1Database, userId: string, day: string): Promise<{ count: number; bytes: number }> {
  const row = await db
    .prepare(`SELECT count, bytes FROM contribution_quota WHERE user_id = ? AND day = ?`)
    .bind(userId, day)
    .first<{ count: number; bytes: number }>();
  return row ?? { count: 0, bytes: 0 };
}

// TOCTOU aceito por ora: a rota lê a cota, sobe os arquivos e só then bate
// este INSERT — duas requisições concorrentes do mesmo usuário podem passar
// juntas na checagem e a cota real overshoot pelo fator de concorrência (na
// prática, poucas abas/dispositivos ao mesmo tempo). Não vale a pena um
// upsert condicional com compensação: a cota aqui não é billing, é o
// orçamento de chamadas ao VirusTotal e o espaço no R2 — o consumer da fila
// tem seu próprio contador diário (`VT_USER`) que é a defesa de verdade.
export function bumpQuotaStmt(db: D1Database, userId: string, day: string, count: number, bytes: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO contribution_quota (user_id, day, count, bytes) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + excluded.count, bytes = bytes + excluded.bytes`
    )
    .bind(userId, day, count, bytes);
}
