import { describe, expect, it } from 'vitest';
import { app } from '../index';

/**
 * Inventário da tabela de rotas, na ordem exata de registro.
 *
 * Existe para uma coisa só: proteger a quebra do index.ts em módulos. Mover
 * 2.300 linhas entre arquivos pode derrubar uma rota, trocar seu método ou
 * perder um middleware sem que nenhum outro teste perceba — metade do index.ts
 * não tinha cobertura quando este arquivo foi escrito.
 *
 * A ORDEM importa e é por isso que a lista é sequencial, não um conjunto:
 * /api/praises/filters precisa vir antes de /api/praises/:id, senão o parâmetro
 * engole o caminho literal. O mesmo vale para /api/materials/kinds.
 *
 * As entradas `ALL /*` são os middlewares de CORS e soft-auth; rotas com
 * requireAuth aparecem duas vezes, uma por handler encadeado.
 *
 * Se este teste falhar depois de uma mudança deliberada de rota, atualize a
 * lista no mesmo commit que mudou a rota — nunca separado.
 */
const ROTAS_ESPERADAS = [
  'ALL /*',
  'ALL /*',
  'GET /auth/status',
  'GET /auth/login',
  'GET /auth/drive/connect',
  'GET /auth/callback',
  'POST /auth/exchange-code',
  'POST /auth/logout',
  'POST /auth/refresh',
  'GET /auth/me',
  'GET /api/praises',
  'GET /api/plpcg/praises',
  'GET /api/plpcg/catalog',
  'GET /api/praises/filters',
  'GET /api/praises/:id/download.zip',
  'GET /api/praises/:id',
  'POST /api/praises',
  'POST /api/praises',
  'PATCH /api/praises/:id',
  'PATCH /api/praises/:id',
  'POST /api/praises/:id/group',
  'POST /api/praises/:id/group',
  'POST /api/praises/:id/tags',
  'POST /api/praises/:id/tags',
  'POST /api/praises/:keeperId/merge',
  'POST /api/praises/:keeperId/merge',
  'DELETE /api/praises/:id/tags/:tagId',
  'DELETE /api/praises/:id/tags/:tagId',
  'POST /api/praises/:id/materials',
  'POST /api/praises/:id/materials',
  'POST /api/praises/:id/materials/bulk-upload',
  'POST /api/praises/:id/materials/bulk-upload',
  'GET /api/materials/kinds',
  'PUT /api/materials/:materialId/content',
  'PUT /api/materials/:materialId/content',
  'PATCH /api/materials/:materialId',
  'PATCH /api/materials/:materialId',
  'DELETE /api/materials/:materialId',
  'DELETE /api/materials/:materialId',
  'GET /api/gestures/dictionary',
  'GET /api/gestures/dictionary/:id',
  'GET /api/gestures/usage',
  'POST /api/gestures/dictionary',
  'POST /api/gestures/dictionary',
  'PATCH /api/gestures/dictionary/:id',
  'PATCH /api/gestures/dictionary/:id',
  'POST /api/gestures/dictionary/:id/image',
  'POST /api/gestures/dictionary/:id/image',
  'POST /api/gestures/dictionary/:id/gif',
  'POST /api/gestures/dictionary/:id/gif',
  'POST /api/gestures/dictionary/:id/replace-with',
  'POST /api/gestures/dictionary/:id/replace-with',
  'GET /api/tags',
  'POST /api/tags',
  'POST /api/tags',
  'GET /api/validation/findings',
  'GET /api/validation/findings',
  'POST /api/validation/findings/bulk',
  'POST /api/validation/findings/bulk',
  'PATCH /api/validation/findings/:id',
  'PATCH /api/validation/findings/:id',
  'GET /api/drive/status',
  'GET /api/drive/status',
  'GET /api/drive/files/:fileId/download',
  'GET /api/drive/files/:fileId/download',
  'POST /api/drive/scans',
  'POST /api/drive/scans',
  'GET /api/drive/scans/:id',
  'GET /api/drive/scans/:id',
  'POST /api/praises/:id/materials/drive-import',
  'POST /api/praises/:id/materials/drive-import',
  'GET /api/import-jobs/:id',
  'GET /api/import-jobs/:id',
  'POST /api/import-jobs/:id/retry-failed',
  'POST /api/import-jobs/:id/retry-failed',
  'POST /api/contributions',
  'POST /api/contributions',
  'GET /api/contributions/mine',
  'GET /api/contributions/mine',
  'GET /api/contributions/:id',
  'GET /api/contributions/:id',
  'GET /assets/*',
  'GET /',
  'GET /health',
  'GET /health/db',
];

describe('inventário de rotas', () => {
  it('registra as mesmas rotas, na mesma ordem', () => {
    const atual = app.routes.map((r) => `${r.method} ${r.path}`);
    expect(atual).toEqual(ROTAS_ESPERADAS);
  });

  it('mantém os caminhos literais antes dos parametrizados', () => {
    const caminhos = app.routes.map((r) => r.path);
    expect(caminhos.indexOf('/api/praises/filters')).toBeLessThan(
      caminhos.indexOf('/api/praises/:id')
    );
    expect(caminhos.indexOf('/api/materials/kinds')).toBeLessThan(
      caminhos.indexOf('/api/materials/:materialId')
    );
  });
});
