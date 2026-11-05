import type { App } from '../env';
import { buildPlpcgManifest } from '../plpcgManifest';
import {
  normalizarShortId,
  parseCrosswalkBody,
  resolvePlpcgCrosswalk,
  resolvePlpcgShortId,
} from '../plpcgResolve';

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

  // GET /api/plpcg/resolve/:shortId — o ?s= dos links antigos; ?redirect=1 manda direto para o PDF
  app.get('/api/plpcg/resolve/:shortId', async (c) => {
    const shortId = normalizarShortId(c.req.param('shortId'));
    if (!shortId) {
      return c.json({ error: 'short_id inválido: hex minúsculo, ex. 0453' }, 400);
    }
    try {
      const r = await resolvePlpcgShortId(c.env.DB, shortId, new URL(c.req.url).origin);
      if (!r) {
        return c.json({ error: 'short_id sem material no coldigom' }, 404);
      }
      c.header('Cache-Control', 'public, max-age=300');
      if (c.req.query('redirect') === '1') {
        return c.redirect(r.url, 302);
      }
      return c.json(r);
    } catch (error) {
      console.error('Error resolving PLPCG short_id:', error);
      return c.json({ error: 'Failed to resolve' }, 500);
    }
  });

  // POST /api/plpcg/crosswalk — lote de pdf_id legados → praise, material e URL atuais.
  // Público como o /resolve (o CORS é o middleware de index.ts); POST só porque
  // 500 ids não cabem numa URL. Nada de cache: o normalizador do app pergunta
  // uma vez por id, e a resposta muda com merge/move.
  app.post('/api/plpcg/crosswalk', async (c) => {
    const parsed = parseCrosswalkBody(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    try {
      const items = await resolvePlpcgCrosswalk(c.env.DB, parsed.pdfIds, new URL(c.req.url).origin);
      c.header('Cache-Control', 'no-store');
      return c.json({ items });
    } catch (error) {
      console.error('Error resolving PLPCG crosswalk:', error);
      return c.json({ error: 'Failed to resolve crosswalk' }, 500);
    }
  });
}
