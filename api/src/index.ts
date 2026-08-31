import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { resolveUserFromRequest, type AuthUser } from './auth';
import {
  handleDriveImportQueueBatch,
  type DriveImportQueueMessage,
} from './driveImport';
import type { Env } from './env';
import { corsAllowOrigin } from './origins';
import { registerAssetsRoutes } from './routes/assets';
import { registerAuthRoutes } from './routes/auth';
import { registerDriveRoutes } from './routes/drive';
import { registerHealthRoutes } from './routes/health';
import { registerMaterialsRoutes } from './routes/materials';
import { registerPraisesRoutes } from './routes/praises';
import { registerTagsRoutes } from './routes/tags';

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// CORS: with credentials, never use '*'. If WEB_ORIGIN is set, only listed origins are allowed.
app.use('/*', async (c, next) => {
  const origin = c.req.header('origin');
  return cors({
    origin: corsAllowOrigin(origin, c.env.WEB_ORIGIN),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
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
registerTagsRoutes(app);
registerDriveRoutes(app);
registerAssetsRoutes(app);
registerHealthRoutes(app);

export { app };

const worker = {
  fetch: app.fetch.bind(app),
  async queue(batch: MessageBatch<DriveImportQueueMessage>, env: Env) {
    await handleDriveImportQueueBatch(batch, env);
  },
};

export default worker;
