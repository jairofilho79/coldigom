import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthUser } from '../auth';
import { listMaterialKindsForLocale } from '../materialKindLabels';
import type { App } from '../env';
import { requireAuth, requireUploadOrAuth } from '../middleware';

/** Materiais: catalogo de tipos, conteudo, edicao e remocao. */
export function registerMaterialsRoutes(app: App): void {
  app.get('/api/materials/kinds', async (c) => {
    try {
      const data = await listMaterialKindsForLocale(c.env.DB);
      return c.json({ data });
    } catch (error) {
      console.error('Error fetching material kinds:', error);
      return c.json({ error: 'Failed to fetch material kinds' }, 500);
    }
  });

  // GET /api/tags - List all tags

  app.put('/api/materials/:materialId/content', requireUploadOrAuth, async (c) => {
    const materialId = c.req.param('materialId');
    const rawContentType = c.req.header('content-type') || 'text/plain; charset=utf-8';

    let body: string;
    try {
      body = await c.req.text();
    } catch {
      return c.json({ error: 'Invalid body' }, 400);
    }

    try {
      const row = await c.env.DB.prepare(
        `SELECT id, praise_id, type, r2_key FROM praise_materials WHERE id = ?`
      )
        .bind(materialId)
        .first() as { id: string; praise_id: string; type: string; r2_key: string | null } | null;

      if (!row) return c.json({ error: 'Material not found' }, 404);
      if (row.type !== 'chord') return c.json({ error: 'Material is not a chord' }, 400);
      if (!row.r2_key) return c.json({ error: 'Material has no r2_key' }, 400);

      await c.env.ASSETS.put(`storage/${row.r2_key}`, body, {
        httpMetadata: { contentType: rawContentType.trim() || 'text/plain; charset=utf-8' },
      });

      return c.json({
        ok: true,
        material_id: row.id,
        praise_id: row.praise_id,
        r2_key: row.r2_key,
      });
    } catch (error) {
      console.error('Error uploading chord content:', error);
      return c.json({ error: 'Failed to upload content' }, 500);
    }
  });

  // PATCH /api/materials/:materialId - Update a material (admin)
  app.patch('/api/materials/:materialId', requireAuth, async (c) => {
    const materialId = c.req.param('materialId');
    const body = await c.req.json().catch(() => null) as any;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const sets: string[] = [];
    const bindings: (string | number | null)[] = [];

    if ('material_kind' in body) {
      if (body.material_kind !== null && typeof body.material_kind !== 'string') {
        return c.json({ error: "Field 'material_kind' must be a string" }, 400);
      }
      sets.push(`material_kind = ?`);
      bindings.push(body.material_kind);
    }

    if ('type' in body) {
      if (body.type !== null && typeof body.type !== 'string') {
        return c.json({ error: "Field 'type' must be a string" }, 400);
      }
      sets.push(`type = ?`);
      bindings.push(body.type);
    }

    if ('url' in body) {
      if (body.url !== null && typeof body.url !== 'string') {
        return c.json({ error: "Field 'url' must be a string" }, 400);
      }
      const trimmed = typeof body.url === 'string' ? body.url.trim() : null;
      sets.push(`url = ?`);
      bindings.push(trimmed && trimmed.length > 0 ? trimmed : null);
      // If url is set, ensure r2_key is NULL (logical material)
      if (trimmed && trimmed.length > 0) {
        sets.push(`r2_key = NULL`);
      }
    }

    if ('is_reviewed' in body) {
      if (typeof body.is_reviewed !== 'boolean') {
        return c.json({ error: "Field 'is_reviewed' must be a boolean" }, 400);
      }
      // quem marcou e quando andam junto com a marca: sem isso, "revisado" não
      // diz de quem foi o olho que passou ali
      sets.push(`is_reviewed = ?`);
      bindings.push(body.is_reviewed ? 1 : 0);
      sets.push(`reviewed_at = ?`);
      bindings.push(body.is_reviewed ? new Date().toISOString() : null);
      sets.push(`reviewed_by = ?`);
      const actor = (c.get('user') as AuthUser | undefined) ?? undefined;
      bindings.push(body.is_reviewed ? (actor?.email ?? actor?.name ?? actor?.sub ?? null) : null);
    }

    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

    try {
      const row = await c.env.DB.prepare(`SELECT praise_id FROM praise_materials WHERE id = ?`).bind(materialId).first() as any;
      if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

      // Enforce: if type is youtube, url must be a valid youtube url
      const newType = typeof body.type === 'string' ? body.type : null;
      const newUrl = 'url' in body ? (typeof body.url === 'string' ? body.url.trim() : null) : null;
      if (newType === 'youtube') {
        const effectiveUrl = newUrl ?? undefined;
        if (!effectiveUrl || effectiveUrl.length === 0) return c.json({ error: "Field 'url' is required for type youtube" }, 400);
        try {
          const parsed = new URL(effectiveUrl);
          const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
          const ok = host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
          if (!ok) return c.json({ error: 'Invalid YouTube URL' }, 400);
        } catch {
          return c.json({ error: 'Invalid YouTube URL' }, 400);
        }
      }

      await c.env.DB.prepare(`UPDATE praise_materials SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...bindings, materialId)
        .run();

      const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error updating material:', error);
      return c.json({ error: 'Failed to update material' }, 500);
    }
  });

  // DELETE /api/materials/:materialId - Delete a material (admin)
  app.delete('/api/materials/:materialId', requireAuth, async (c) => {
    const materialId = c.req.param('materialId');
    try {
      const row = await c.env.DB.prepare(`SELECT praise_id, r2_key FROM praise_materials WHERE id = ?`)
        .bind(materialId)
        .first() as any;
      if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

      await c.env.DB.prepare(`DELETE FROM praise_materials WHERE id = ?`).bind(materialId).run();

      if (row.r2_key) {
        try {
          await c.env.ASSETS.delete(`storage/${row.r2_key}`);
        } catch (e) {
          // Best-effort cleanup
          console.warn('Failed to delete R2 object:', e);
        }
      }

      const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error deleting material:', error);
      return c.json({ error: 'Failed to delete material' }, 500);
    }
  });

  // GET /assets/* - Serve files from R2
}
