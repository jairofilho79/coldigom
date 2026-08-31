import type { App } from '../env';

/** Entrega de arquivos do R2. */
export function registerAssetsRoutes(app: App): void {
  app.get('/assets/*', async (c) => {
    const r2Key = c.req.path.replace(/^\/assets\//, 'storage/assets/');
    const rangeHeader = c.req.header('range') ?? c.req.header('Range');
  
    const metadata = await c.env.ASSETS.head(r2Key);
    if (!metadata) {
      return c.json({ error: 'File not found' }, 404);
    }
    const totalSize = metadata.size;
    let object: R2ObjectBody | null = null;
    let status = 200;
  
    if (rangeHeader && totalSize > 0) {
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        c.header('Accept-Ranges', 'bytes');
        c.header('Content-Range', `bytes */${totalSize}`);
        return c.body(null, 416);
      }

      const [, startRaw, endRaw] = match;
      let start = startRaw === '' ? 0 : Number.parseInt(startRaw, 10);
      let end = endRaw === '' ? totalSize - 1 : Number.parseInt(endRaw, 10);

      if (startRaw === '' && endRaw !== '') {
        const suffixLength = Number.parseInt(endRaw, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
          c.header('Accept-Ranges', 'bytes');
          c.header('Content-Range', `bytes */${totalSize}`);
          return c.body(null, 416);
        }
        start = Math.max(totalSize - suffixLength, 0);
        end = totalSize - 1;
      }

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        start >= totalSize
      ) {
        c.header('Accept-Ranges', 'bytes');
        c.header('Content-Range', `bytes */${totalSize}`);
        return c.body(null, 416);
      }

      end = Math.min(end, totalSize - 1);
      const length = end - start + 1;
      object = await c.env.ASSETS.get(r2Key, { range: { offset: start, length } });
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }
      status = 206;
      c.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      c.header('Content-Length', String(length));
    } else {
      object = await c.env.ASSETS.get(r2Key);
      if (!object) {
        return c.json({ error: 'File not found' }, 404);
      }
      if (totalSize > 0) {
        c.header('Content-Length', String(totalSize));
      }
    }
  
    const ext = r2Key.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      mp3: 'audio/mpeg',
      mid: 'audio/midi',
      midi: 'audio/midi',
      // charset explícito: as cifras têm acentos ("Comigo Habita, Ó Deus") e sem
      // isto o navegador adivinha a codificação ao abrir o arquivo direto.
      chord: 'text/plain; charset=utf-8',
    };
  
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';
  
    c.header('Content-Type', contentType);
    c.header('Accept-Ranges', 'bytes');
    // Os assets são públicos e consumidos de outra origem em dev (VITE_API_URL
    // aponta pro Worker) e por outros clientes; sem CORP o navegador recusa
    // embutir o áudio/PDF em qualquer página que use COEP.
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    c.header('Content-Disposition', `inline; filename="${r2Key.split('/').pop()}"`);
  
    c.status(status as 200 | 206);
    return c.body(object.body);
  });

  // Root endpoint
}
