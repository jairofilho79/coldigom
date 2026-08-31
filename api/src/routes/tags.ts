import type { App } from '../env';
import { requireAuth } from '../middleware';
import type { TagRow } from '../praiseQuery';

/** Tags e subtags. */
export function registerTagsRoutes(app: App): void {
  app.get('/api/tags', async (c) => {
    try {
      const result = await c.env.DB.prepare(
        `SELECT id, name, parent_id FROM tags ORDER BY name ASC`
      ).all();
      return c.json({
        data: ((result.results as TagRow[]) ?? []).map((t) => ({
          id: t.id,
          name: t.name,
          parent_id: t.parent_id ?? null,
        })),
      });
    } catch (error) {
      console.error('Error fetching tags:', error);
      return c.json({ error: 'Failed to fetch tags' }, 500);
    }
  });

  // POST /api/tags - Create root tag or subtag (admin)
  app.post('/api/tags', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const name = body.name;
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: "Field 'name' is required" }, 400);
    }
    // As tags viajam num GROUP_CONCAT separado por vírgula e o cliente faz
    // split(','): uma tag "Natal, Advento" aparecia como duas. Barrar na
    // entrada evita criar dado que a exibição não consegue representar.
    if (name.includes(',')) {
      return c.json({ error: "O nome da tag não pode conter vírgula" }, 400);
    }

    let parentId: string | null = null;
    if ('parent_id' in body && body.parent_id != null && body.parent_id !== '') {
      if (typeof body.parent_id !== 'string') {
        return c.json({ error: "Field 'parent_id' must be a string" }, 400);
      }
      parentId = body.parent_id.trim();
    }

    try {
      if (parentId) {
        const parent = await c.env.DB.prepare(
          'SELECT id, parent_id FROM tags WHERE id = ?'
        ).bind(parentId).first<{ id: string; parent_id: string | null }>();
        if (!parent) return c.json({ error: 'Parent tag not found' }, 400);
        if (parent.parent_id) {
          return c.json({ error: 'Subtags cannot have subtags (one level only)' }, 400);
        }
      }

      const id = crypto.randomUUID();
      await c.env.DB.prepare(
        'INSERT INTO tags (id, name, parent_id) VALUES (?, ?, ?)'
      ).bind(id, name.trim(), parentId).run();

      const parentName = parentId
        ? ((await c.env.DB.prepare('SELECT name FROM tags WHERE id = ?').bind(parentId).first()) as { name: string } | null)?.name
        : null;

      return c.json({
        data: {
          id,
          name: name.trim(),
          parent_id: parentId,
          parent_name: parentName ?? null,
        },
      }, 201);
    } catch (error) {
      console.error('Error creating tag:', error);
      return c.json({ error: 'Failed to create tag' }, 500);
    }
  });

  // POST /api/praises - Create a praise (admin)
}
