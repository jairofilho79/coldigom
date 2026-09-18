import type { Hono } from 'hono';

import type { AuthUser } from './auth';
import type { AppUser } from './appUser';
import type { DriveImportQueueMessage } from './driveImport';

/**
 * Mensagem da fila de varredura de contribuições (anexos enviados por
 * usuários da app). O consumer é a Task 8, mas o tipo mora aqui porque
 * `env.ts` já declara o binding `CONTRIB_SCAN: Queue<ContribScanMessage>`
 * — a Task 8 importa este tipo em vez de duplicá-lo em `contributions/scan.ts`.
 */
export type ContribScanMessage = { contributionId: string; phase: 'submit' | 'poll'; attempt: number };

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
  /** Base do plpcg-catalog (introspecção de `sess_…`). */
  PLPCG_AUTH_URL?: string;
  VIRUSTOTAL_API_KEY?: string;
  SAFE_BROWSING_API_KEY?: string;
  CONTRIB_SCAN?: Queue<ContribScanMessage>;
};

/** O app tipado, para os módulos de rota receberem sem repetir a assinatura. */
export type App = Hono<{ Bindings: Env; Variables: { user: AuthUser; appUser: AppUser } }>;
