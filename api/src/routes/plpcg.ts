import type { App } from '../env';
import { buildPlpcgManifest } from '../plpcgManifest';

/**
 * Destino da migração PLPCG (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md §8.2):
 * o que o plpcg.com servia, agora gerado do coldigom. Públicas, como
 * /api/plpcg/praises — o coldigui e o plpcjf leem sem sessão.
 */
export function registerPlpcgRoutes(app: App): void {
  // GET /api/plpcg/manifest — o louvores-manifest.json, uma entrada por linha do crosswalk (ETag/304)
  app.get('/api/plpcg/manifest', async (c) => {
    try {
      const r = await buildPlpcgManifest(
        c.env.DB,
        { origin: new URL(c.req.url).origin },
        c.req.header('If-None-Match'),
      );
      if (r.status === 304) {
        return new Response(null, { status: 304, headers: r.headers });
      }
      return new Response(r.body, {
        status: 200,
        headers: { ...r.headers, 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch (error) {
      console.error('Error building PLPCG manifest:', error);
      return c.json({ error: 'Failed to build manifest' }, 500);
    }
  });

  // GET /api/plpcg/manifest/checksum — o hex do ETag em texto; 204 se o cliente já o tem.
  // É o contrato do /api/catalog/checksum do Worker plpcg-catalog: o coldigui troca de fonte mudando só a URL base.
  app.get('/api/plpcg/manifest/checksum', async (c) => {
    try {
      const r = await buildPlpcgManifest(
        c.env.DB,
        { origin: new URL(c.req.url).origin },
        c.req.header('If-None-Match'),
      );
      if (r.status === 304) {
        return new Response(null, { status: 204, headers: r.headers });
      }
      return new Response(r.checksum, {
        status: 200,
        headers: { ...r.headers, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (error) {
      console.error('Error building PLPCG manifest checksum:', error);
      return c.json({ error: 'Failed to build manifest' }, 500);
    }
  });
}
