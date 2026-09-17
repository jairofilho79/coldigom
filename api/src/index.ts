import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { resolveUserFromRequest, type AuthUser } from './auth';
import type { AppUser } from './appUser';
import { handleContribScanBatch, requeueStaleContributions } from './contributions/scan';
import {
  handleDriveImportQueueBatch,
  type DriveImportQueueMessage,
} from './driveImport';
import type { ContribScanMessage, Env } from './env';
import { corsAllowOrigin } from './origins';
import { registerAssetsRoutes } from './routes/assets';
import { registerAuthRoutes } from './routes/auth';
import { registerContributionsRoutes } from './routes/contributions';
import { registerDriveRoutes } from './routes/drive';
import { registerGesturesRoutes } from './routes/gestures';
import { registerHealthRoutes } from './routes/health';
import { registerMaterialsRoutes } from './routes/materials';
import { registerPraisesRoutes } from './routes/praises';
import { registerTagsRoutes } from './routes/tags';
import { registerValidationRoutes } from './routes/validation';

// Variables inclui appUser (Task 2, contribuições) para bater com o tipo `App`
// de env.ts — os módulos de rota tipam seu parâmetro como `App`.
const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser; appUser: AppUser } }>();

// CORS: with credentials, never use '*'. If WEB_ORIGIN is set, only listed origins are allowed.
app.use('/*', async (c, next) => {
  const origin = c.req.header('origin');
  return cors({
    origin: corsAllowOrigin(origin, c.env.WEB_ORIGIN),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    // If-Match / If-None-Match: gravação condicional do editor de gestos e o 304
    // do dicionário. Sem eles no preflight, o navegador nem manda o PUT.
    allowHeaders: ['Content-Type', 'Authorization', 'If-Match', 'If-None-Match'],
    // O assets.ts e o PUT /content já emitiam ETag; sem expor, o JavaScript de
    // outra origem lia null e não tinha o token para mandar de volta.
    exposeHeaders: ['ETag'],
  })(c, next);
});

let authConfigWarningLogged = false;

// Soft-auth: attaches user to context when present; never blocks public routes.
app.use('/*', async (c, next) => {
  if (
    !authConfigWarningLogged &&
    c.env.GOOGLE_CLIENT_ID &&
    !c.env.WEB_ORIGIN
  ) {
    authConfigWarningLogged = true;
    console.warn(
      JSON.stringify({
        msg: 'auth.config.warning',
        detail: 'GOOGLE_CLIENT_ID is set but WEB_ORIGIN is missing; cross-site cookies will use SameSite=Lax and SPA sessions may not persist.',
      })
    );
  }

  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!jwtSecret) return next();
  try {
    // Sem log de sucesso: o sub do Google é identificador pessoal e ia para o
    // log em toda requisição, anônima inclusive. Só a falha interessa.
    const user = await resolveUserFromRequest({ request: c.req.raw, jwtSecret });
    if (user) c.set('user', user);
  } catch {
    console.log(JSON.stringify({ msg: 'auth.soft.invalid', method: c.req.method, path: c.req.path }));
  }
  return next();
});

registerAuthRoutes(app);
registerPraisesRoutes(app);
registerMaterialsRoutes(app);
registerGesturesRoutes(app);
registerTagsRoutes(app);
registerValidationRoutes(app);
registerDriveRoutes(app);
registerContributionsRoutes(app);
registerAssetsRoutes(app);
registerHealthRoutes(app);

export { app };

const worker = {
  fetch: app.fetch.bind(app),
  // Duas filas passam pelo mesmo binding de nome de método (`queue`) — o
  // Worker despacha por `batch.queue`, o nome cadastrado no wrangler.toml.
  async queue(batch: MessageBatch<DriveImportQueueMessage | ContribScanMessage>, env: Env) {
    if (batch.queue === 'contrib-scan') return handleContribScanBatch(batch as MessageBatch<ContribScanMessage>, env);
    await handleDriveImportQueueBatch(batch as MessageBatch<DriveImportQueueMessage>, env);
  },
  // Cron de resgate (spec §5): contribuições `recebida` presas por mensagem
  // perdida na fila voltam a ser enfileiradas; depois de 24h, bloqueadas.
  async scheduled(_event: ScheduledEvent, env: Env) {
    const r = await requeueStaleContributions(env);
    console.log(JSON.stringify({ msg: 'contributions.cron', ...r }));
  },
};

export default worker;
