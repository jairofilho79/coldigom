import type { Hono } from 'hono';

import type { AuthUser } from './auth';
import type { DriveImportQueueMessage } from './driveImport';

/** Bindings e variáveis do Worker. */
export type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  AUTH_BASE_URL?: string;
  WEB_ORIGIN?: string;
  AUTH_COOKIE_SAMESITE?: 'Lax' | 'Strict' | 'None';
  DRIVE_IMPORT?: Queue<DriveImportQueueMessage>;
  COLDIGOM_UPLOAD_TOKEN?: string;
  AUTH_ALLOWED_EMAILS?: string;
};

/** O app tipado, para os módulos de rota receberem sem repetir a assinatura. */
export type App = Hono<{ Bindings: Env; Variables: { user: AuthUser } }>;
