import { downloadDriveFile, getDriveAccessToken } from './driveApi';
import { deleteDriveCredentials, getDriveRefreshToken, isInvalidDriveGrant } from './driveCredentials';

export type DriveImportQueueMessage =
  | { type: 'scan'; scanId: string }
  | { type: 'import_item'; jobId: string; itemId: string };

export type DriveImportEnv = {
  DB: D1Database;
  ASSETS: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  DRIVE_IMPORT?: Queue<DriveImportQueueMessage>;
};

const MAX_ATTEMPTS = 5;

/**
 * Falhas do Drive que reenviar não conserta.
 *
 * 413 é o nosso próprio teto de tamanho (`downloadDriveFile`): o arquivo não vai
 * encolher entre uma tentativa e outra, e cada retentativa rebaixava os 100 MB
 * de novo — cinco vezes, mostrando "Na fila" o tempo todo. 400 é pedido
 * malformado, e o pedido é sempre o mesmo. 401/403/404 já estavam: credencial,
 * permissão e arquivo ausente não mudam por insistência. Fora daqui — 429 e
 * 5xx, que são do lado do Google e passam — o item volta para a fila.
 */
const FALHA_PERMANENTE = /failed \((400|401|403|404|413)\)/i;

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function accessTokenForUser(env: DriveImportEnv, userSub: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.AUTH_JWT_SECRET) {
    throw new Error('Drive auth not configured');
  }
  const refresh = await getDriveRefreshToken({
    db: env.DB,
    userSub,
    jwtSecret: env.AUTH_JWT_SECRET,
  });
  if (!refresh) throw new Error('Drive not connected');
  try {
    return await getDriveAccessToken({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: refresh,
    });
  } catch (err) {
    if (isInvalidDriveGrant(err)) {
      await deleteDriveCredentials(env.DB, userSub);
      throw new Error('Drive not connected');
    }
    throw err;
  }
}

export async function processImportItem(
  env: DriveImportEnv,
  jobId: string,
  itemId: string
): Promise<void> {
  const item = await env.DB.prepare(
    `SELECT i.id, i.job_id, i.drive_file_id, i.material_kind, i.type, i.file_path_legacy, i.status, i.attempts,
            j.praise_id, j.user_sub
     FROM import_job_items i
     JOIN import_jobs j ON j.id = i.job_id
     WHERE i.id = ? AND i.job_id = ?`
  )
    .bind(itemId, jobId)
    .first<{
      id: string;
      job_id: string;
      drive_file_id: string;
      material_kind: string;
      type: string;
      file_path_legacy: string | null;
      status: string;
      attempts: number;
      praise_id: string;
      user_sub: string;
    }>();

  if (!item) return;
  if (item.status === 'done') return;

  const attempts = item.attempts + 1;
  await env.DB.prepare(
    `UPDATE import_job_items SET status = 'running', attempts = ?, updated_at = ? WHERE id = ?`
  )
    .bind(attempts, nowSec(), itemId)
    .run();
  await env.DB.prepare(`UPDATE import_jobs SET status = 'running', updated_at = ? WHERE id = ?`)
    .bind(nowSec(), jobId)
    .run();

  try {
    const token = await accessTokenForUser(env, item.user_sub);
    const downloaded = await downloadDriveFile(token, item.drive_file_id);

    const materialId = crypto.randomUUID();
    const r2_key = `assets/praises/${item.praise_id}/${materialId}.${item.type}`;
    const storageKey = `storage/${r2_key}`;

    await env.ASSETS.put(storageKey, new Uint8Array(downloaded.bytes), {
      httpMetadata: { contentType: downloaded.contentType },
    });

    await env.DB.prepare(
      `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        materialId,
        item.praise_id,
        item.material_kind,
        item.type,
        r2_key,
        item.file_path_legacy || item.drive_file_id,
        null,
        null,
        null
      )
      .run();

    await env.DB.prepare(
      `UPDATE import_job_items SET status = 'done', material_id = ?, error = NULL, updated_at = ? WHERE id = ?`
    )
      .bind(materialId, nowSec(), itemId)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = FALHA_PERMANENTE.test(message) || attempts >= MAX_ATTEMPTS;
    await env.DB.prepare(
      `UPDATE import_job_items SET status = ?, error = ?, updated_at = ? WHERE id = ?`
    )
      .bind(permanent ? 'failed' : 'pending', message.slice(0, 2000), nowSec(), itemId)
      .run();

    if (!permanent) {
      // Re-throw so Queue retries the message
      throw err;
    }
  }

  await refreshJobCounts(env.DB, jobId);
}

async function refreshJobCounts(db: D1Database, jobId: string): Promise<void> {
  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) AS open_count,
         COUNT(*) AS total_count
       FROM import_job_items WHERE job_id = ?`
    )
    .bind(jobId)
    .first<{ done_count: number; failed_count: number; open_count: number; total_count: number }>();

  if (!counts) return;
  const open = Number(counts.open_count) || 0;
  const failed = Number(counts.failed_count) || 0;
  const done = Number(counts.done_count) || 0;
  let status = 'running';
  if (open === 0) {
    status = failed > 0 ? 'completed_with_errors' : 'done';
  }
  await db
    .prepare(
      `UPDATE import_jobs SET done_count = ?, failed_count = ?, total_count = ?, status = ?, updated_at = ? WHERE id = ?`
    )
    .bind(done, failed, Number(counts.total_count) || 0, status, nowSec(), jobId)
    .run();
}

export async function enqueueDriveMessages(
  env: DriveImportEnv,
  messages: DriveImportQueueMessage[]
): Promise<void> {
  if (!env.DRIVE_IMPORT) {
    // ponytail: local/tests without queue — process inline
    for (const msg of messages) {
      if (msg.type === 'import_item') {
        await processImportItem(env, msg.jobId, msg.itemId);
      }
    }
    return;
  }
  // Batch send (Cloudflare allows up to 100 messages per send)
  const CHUNK = 100;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const slice = messages.slice(i, i + CHUNK);
    await env.DRIVE_IMPORT.sendBatch(slice.map((body) => ({ body })));
  }
}

export async function handleDriveImportQueueBatch(
  batch: MessageBatch<DriveImportQueueMessage>,
  env: DriveImportEnv
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const body = msg.body;
      if (body.type === 'import_item') {
        await processImportItem(env, body.jobId, body.itemId);
      }
      msg.ack();
    } catch (err) {
      console.error('drive import queue message failed', err);
      msg.retry();
    }
  }
}
