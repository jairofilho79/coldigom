import { decryptSecret, encryptSecret } from './driveCrypto';

export async function upsertDriveRefreshToken(params: {
  db: D1Database;
  userSub: string;
  jwtSecret: string;
  refreshToken: string;
}): Promise<void> {
  const enc = await encryptSecret(params.jwtSecret, params.refreshToken);
  const now = Math.floor(Date.now() / 1000);
  await params.db
    .prepare(
      `INSERT INTO google_drive_credentials (user_sub, refresh_token_enc, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_sub) DO UPDATE SET refresh_token_enc = excluded.refresh_token_enc, updated_at = excluded.updated_at`
    )
    .bind(params.userSub, enc, now)
    .run();
}

export async function getDriveRefreshToken(params: {
  db: D1Database;
  userSub: string;
  jwtSecret: string;
}): Promise<string | null> {
  const row = await params.db
    .prepare(`SELECT refresh_token_enc FROM google_drive_credentials WHERE user_sub = ?`)
    .bind(params.userSub)
    .first<{ refresh_token_enc: string }>();
  if (!row?.refresh_token_enc) return null;
  return decryptSecret(params.jwtSecret, row.refresh_token_enc);
}

export async function hasDriveCredentials(db: D1Database, userSub: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM google_drive_credentials WHERE user_sub = ?`)
    .bind(userSub)
    .first<{ ok: number }>();
  return Boolean(row);
}

export async function deleteDriveCredentials(db: D1Database, userSub: string): Promise<void> {
  await db.prepare(`DELETE FROM google_drive_credentials WHERE user_sub = ?`).bind(userSub).run();
}

/** Stale/revoked refresh after secret rotation → clear row so UI reconnects. */
export function isInvalidDriveGrant(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid_grant/i.test(msg);
}
