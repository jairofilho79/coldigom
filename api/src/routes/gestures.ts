import type { App } from '../env';
import {
  DICTIONARY_SCHEMA,
  COLUNAS,
  casaEtag,
  lerLinha,
  lerVersao,
  linhaParaEntrada,
  usosDoGesto,
  type LinhaDoDicionario,
} from '../gestures/dicionario';

const CACHE = 'public, max-age=300';

/** Dicionário de gestos CIAs: leitura pública, escrita autenticada. */
export function registerGesturesRoutes(app: App): void {
  // GET /api/gestures/dictionary — o dicionário inteiro. A versão é o ETag: o
  // cliente guarda e manda If-None-Match; 304 custa uma leitura de uma linha.
  app.get('/api/gestures/dictionary', async (c) => {
    try {
      const version = await lerVersao(c.env.DB);
      const etag = `"v${version}"`;
      if (casaEtag(c.req.header('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE } });
      }
      const linhas = await c.env.DB
        .prepare(`SELECT ${COLUNAS} FROM gesture_dictionary ORDER BY name, id`)
        .all<LinhaDoDicionario>();
      const corpo = {
        schema: DICTIONARY_SCHEMA,
        version,
        generatedAt: new Date().toISOString(),
        gestures: (linhas.results ?? []).map(linhaParaEntrada),
      };
      return c.json(corpo, 200, { ETag: etag, 'Cache-Control': CACHE });
    } catch (error) {
      console.error('Error reading gesture dictionary:', error);
      return c.json({ error: 'Failed to read gesture dictionary' }, 500);
    }
  });

  // GET /api/gestures/dictionary/:id — entrada + onde é usada.
  app.get('/api/gestures/dictionary/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const linha = await lerLinha(c.env.DB, id);
      if (!linha) return c.json({ error: 'Gesture not found' }, 404);
      const usages = await usosDoGesto(c.env.DB, id);
      return c.json({ data: { ...linhaParaEntrada(linha), usages } });
    } catch (error) {
      console.error('Error reading gesture:', error);
      return c.json({ error: 'Failed to read gesture' }, 500);
    }
  });

  // GET /api/gestures/usage[?gestureId=] — com id, os usos daquele gesto; sem id,
  // a contagem por gesto, para a lista do dicionário não fazer N requisições.
  app.get('/api/gestures/usage', async (c) => {
    const gestureId = c.req.query('gestureId')?.trim();
    try {
      if (gestureId) return c.json({ data: await usosDoGesto(c.env.DB, gestureId) });
      const r = await c.env.DB
        .prepare(`SELECT gesture_id, COUNT(DISTINCT material_id) AS materials FROM gesture_usage GROUP BY gesture_id`)
        .all<{ gesture_id: string; materials: number }>();
      return c.json({ data: r.results ?? [] });
    } catch (error) {
      console.error('Error reading gesture usage:', error);
      return c.json({ error: 'Failed to read gesture usage' }, 500);
    }
  });
}
