import type { App } from '../env';

/** Raiz e checagens de saude. */
export function registerHealthRoutes(app: App): void {
  app.get('/', (c) => c.json({ name: 'coldigom-api', version: '1.0.0' }));

  // Health check endpoint
  app.get('/health', (c) => c.json({ status: 'ok' }));

  /** D1 connectivity probe — surfaces binding/schema errors in production. */
  app.get('/health/db', async (c) => {
    if (!c.env.DB) {
      return c.json({ status: 'error', message: 'D1 binding DB is missing' }, 500);
    }
    try {
      const praises = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM praises').first<{ n: number }>();
      const tags = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tags').first<{ n: number }>();
      const kinds = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM material_kinds').first<{ n: number }>();
      const authTokens = await c.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM auth_refresh_tokens'
      ).first<{ n: number }>();
      return c.json({
        status: 'ok',
        praises: praises?.n ?? 0,
        tags: tags?.n ?? 0,
        material_kinds: kinds?.n ?? 0,
        auth_refresh_tokens: authTokens?.n ?? 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('health/db failed:', message);
      return c.json({ status: 'error', message }, 500);
    }
  });
}
