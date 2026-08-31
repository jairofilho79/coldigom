import type { AuthUser } from '../auth';
import { enqueueDriveMessages } from '../driveImport';
import { getDriveAccessToken, listDriveTree } from '../driveApi';
import { getDriveRefreshToken, hasDriveCredentials } from '../driveCredentials';
import { parseDriveUrl } from '../driveParse';
import type { App } from '../env';
import { isSafeMaterialType } from '../uploadLimits';
import { nowSec, requireAuth } from '../middleware';

/** Google Drive e jobs de importacao.
 *
 * Inclui POST /api/praises/:id/materials/drive-import: o caminho e de louvor,
 * mas toda a dependencia e de Drive, e o setor que cuida disto e o mesmo. */
export function registerDriveRoutes(app: App): void {
  app.get('/api/drive/status', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const connected = await hasDriveCredentials(c.env.DB, user.sub);
    return c.json({ connected });
  });

  app.post('/api/drive/scans', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const jwtSecret = c.env.AUTH_JWT_SECRET;
    const clientId = c.env.GOOGLE_CLIENT_ID;
    if (!jwtSecret || !clientId) return c.json({ error: 'Auth not configured' }, 500);

    const body = await c.req.json().catch(() => null) as { url?: string } | null;
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!url) return c.json({ error: 'Missing url' }, 400);

    let root;
    try {
      root = parseDriveUrl(url);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid Drive URL' }, 400);
    }

    const refresh = await getDriveRefreshToken({ db: c.env.DB, userSub: user.sub, jwtSecret });
    if (!refresh) return c.json({ error: 'Drive not connected', code: 'drive_not_connected' }, 403);

    const scanId = crypto.randomUUID();
    const ts = nowSec();
    await c.env.DB.prepare(
      `INSERT INTO drive_scans (id, user_sub, source_url, root_id, root_kind, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`
    )
      .bind(scanId, user.sub, url, root.id, root.kind, ts, ts)
      .run();

    try {
      const accessToken = await getDriveAccessToken({
        clientId,
        clientSecret: c.env.GOOGLE_CLIENT_SECRET,
        refreshToken: refresh,
      });
      const { files, skipped } = await listDriveTree(accessToken, root.id, root.kind);

      // Batch insert scan files
      const CHUNK = 40;
      for (let i = 0; i < files.length; i += CHUNK) {
        const slice = files.slice(i, i + CHUNK);
        const stmts = slice.map((f) =>
          c.env.DB.prepare(
            `INSERT INTO drive_scan_files (id, scan_id, drive_file_id, name, rel_path, mime_type, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            scanId,
            f.id,
            f.name,
            f.relPath,
            f.mimeType,
            f.sizeBytes
          )
        );
        if (stmts.length) await c.env.DB.batch(stmts);
      }

      await c.env.DB.prepare(
        `UPDATE drive_scans SET status = 'done', skipped_json = ?, updated_at = ? WHERE id = ?`
      )
        .bind(JSON.stringify(skipped), nowSec(), scanId)
        .run();

      return c.json({
        data: {
          id: scanId,
          status: 'done',
          files: files.map((f) => ({
            drive_file_id: f.id,
            name: f.name,
            rel_path: f.relPath,
            mime_type: f.mimeType,
            size_bytes: f.sizeBytes,
          })),
          skipped,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await c.env.DB.prepare(
        `UPDATE drive_scans SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
      )
        .bind(message.slice(0, 2000), nowSec(), scanId)
        .run();
      console.error('drive scan failed', message);
      return c.json({ error: message || 'Drive scan failed' }, 502);
    }
  });

  app.get('/api/drive/scans/:id', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const scanId = c.req.param('id');
    const scan = await c.env.DB.prepare(
      `SELECT id, status, error, skipped_json FROM drive_scans WHERE id = ? AND user_sub = ?`
    )
      .bind(scanId, user.sub)
      .first<{ id: string; status: string; error: string | null; skipped_json: string | null }>();
    if (!scan) return c.json({ error: 'Scan not found' }, 404);

    const filesRes = await c.env.DB.prepare(
      `SELECT drive_file_id, name, rel_path, mime_type, size_bytes FROM drive_scan_files WHERE scan_id = ? ORDER BY rel_path`
    )
      .bind(scanId)
      .all<{
        drive_file_id: string;
        name: string;
        rel_path: string;
        mime_type: string | null;
        size_bytes: number | null;
      }>();

    let skipped: unknown[] = [];
    if (scan.skipped_json) {
      try {
        skipped = JSON.parse(scan.skipped_json);
      } catch {
        skipped = [];
      }
    }

    return c.json({
      data: {
        id: scan.id,
        status: scan.status,
        error: scan.error,
        files: filesRes.results || [],
        skipped,
      },
    });
  });

  app.post('/api/praises/:id/materials/drive-import', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const praiseId = c.req.param('id');
    const body = await c.req.json().catch(() => null) as {
      items?: Array<{
        drive_file_id: string;
        material_kind: string;
        type: string;
        file_path_legacy?: string;
      }>;
    } | null;

    const items = body?.items;
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ error: 'Missing items' }, 400);
    }

    const praise = await c.env.DB.prepare(`SELECT id FROM praises WHERE id = ?`)
      .bind(praiseId)
      .first<{ id: string }>();
    if (!praise) return c.json({ error: 'Praise not found' }, 404);

    const connected = await hasDriveCredentials(c.env.DB, user.sub);
    if (!connected) return c.json({ error: 'Drive not connected', code: 'drive_not_connected' }, 403);

    for (const item of items) {
      // O type vira a extensão da chave do R2, igual ao upload direto.
      if (!item?.drive_file_id || !item.material_kind || !isSafeMaterialType(item.type)) {
        return c.json({ error: 'Invalid item' }, 400);
      }
    }

    const jobId = crypto.randomUUID();
    const ts = nowSec();
    await c.env.DB.prepare(
      `INSERT INTO import_jobs (id, praise_id, user_sub, status, total_count, done_count, failed_count, skipped_count, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, 0, 0, 0, ?, ?)`
    )
      .bind(jobId, praiseId, user.sub, items.length, ts, ts)
      .run();

    const itemIds: string[] = [];
    const CHUNK = 40;
    for (let i = 0; i < items.length; i += CHUNK) {
      const slice = items.slice(i, i + CHUNK);
      const stmts = slice.map((item) => {
        const itemId = crypto.randomUUID();
        itemIds.push(itemId);
        return c.env.DB.prepare(
          `INSERT INTO import_job_items (id, job_id, drive_file_id, material_kind, type, file_path_legacy, status, attempts, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`
        ).bind(
          itemId,
          jobId,
          item.drive_file_id,
          item.material_kind,
          item.type,
          item.file_path_legacy || null,
          ts
        );
      });
      await c.env.DB.batch(stmts);
    }

    await enqueueDriveMessages(
      c.env,
      itemIds.map((itemId) => ({ type: 'import_item' as const, jobId, itemId }))
    );

    const job = await c.env.DB.prepare(
      `SELECT id, praise_id, status, total_count, done_count, failed_count, skipped_count FROM import_jobs WHERE id = ?`
    )
      .bind(jobId)
      .first();

    return c.json({ data: job }, 202);
  });

  app.get('/api/import-jobs/:id', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const jobId = c.req.param('id');
    const job = await c.env.DB.prepare(
      `SELECT id, praise_id, status, total_count, done_count, failed_count, skipped_count, created_at, updated_at
       FROM import_jobs WHERE id = ? AND user_sub = ?`
    )
      .bind(jobId, user.sub)
      .first();
    if (!job) return c.json({ error: 'Job not found' }, 404);

    const items = await c.env.DB.prepare(
      `SELECT id, drive_file_id, material_kind, type, file_path_legacy, status, attempts, error, material_id
       FROM import_job_items WHERE job_id = ? ORDER BY file_path_legacy`
    )
      .bind(jobId)
      .all();

    return c.json({ data: { ...job, items: items.results || [] } });
  });

  app.post('/api/import-jobs/:id/retry-failed', requireAuth, async (c) => {
    const user = c.get('user') as AuthUser;
    const jobId = c.req.param('id');
    const job = await c.env.DB.prepare(
      `SELECT id FROM import_jobs WHERE id = ? AND user_sub = ?`
    )
      .bind(jobId, user.sub)
      .first<{ id: string }>();
    if (!job) return c.json({ error: 'Job not found' }, 404);

    const failed = await c.env.DB.prepare(
      `SELECT id FROM import_job_items WHERE job_id = ? AND status = 'failed'`
    )
      .bind(jobId)
      .all<{ id: string }>();

    const ids = (failed.results || []).map((r) => r.id);
    if (ids.length === 0) return c.json({ data: { retried: 0 } });

    const ts = nowSec();
    await c.env.DB.prepare(
      `UPDATE import_job_items SET status = 'pending', error = NULL, updated_at = ? WHERE job_id = ? AND status = 'failed'`
    )
      .bind(ts, jobId)
      .run();
    await c.env.DB.prepare(
      `UPDATE import_jobs SET status = 'pending', failed_count = 0, updated_at = ? WHERE id = ?`
    )
      .bind(ts, jobId)
      .run();

    await enqueueDriveMessages(
      c.env,
      ids.map((itemId) => ({ type: 'import_item' as const, jobId, itemId }))
    );

    return c.json({ data: { retried: ids.length } });
  });

  // PUT /api/materials/:materialId/content — replace chord body in R2 (review-app upload)
}
