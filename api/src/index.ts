import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  handleOAuthCallback,
  buildGoogleAuthorizeRedirect,
  getCookie,
  resolveUserFromCookies,
  buildLogoutCookies,
  rotateRefreshSession,
  clearAllAuthCookieHeaders,
  getRefreshCookieName,
  type AuthUser,
} from './auth';
import { labelFor, listMaterialKindsForLocale, loadMaterialKindLabels } from './materialKindLabels';
import { buildPraiseZipStream, PraiseZipTooLargeError } from './praiseZip';
import { hasDriveCredentials, upsertDriveRefreshToken, getDriveRefreshToken } from './driveCredentials';
import { parseDriveUrl } from './driveParse';
import { getDriveAccessToken, listDriveTree } from './driveApi';
import {
  enqueueDriveMessages,
  handleDriveImportQueueBatch,
  type DriveImportQueueMessage,
} from './driveImport';
import { listPlpcgPraises, parsePlpcgListQuery, type PlpcgListDeps } from './plpcgPraises';

type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_JWT_SECRET?: string;
  AUTH_BASE_URL?: string;
  WEB_ORIGIN?: string;
  AUTH_COOKIE_SAMESITE?: 'Lax' | 'Strict' | 'None';
  DRIVE_IMPORT?: Queue<DriveImportQueueMessage>;
};

interface PraiseResult {
  id: string;
  name: string;
  number: string;
  author: string;
  rhythm: string;
  tonality: string;
  category: string;
  lyrics: string;
  group_id: string | null;
  tag_ids: string | null;
}

type TagRow = {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name?: string | null;
};

const TAG_LABEL_SQL = `CASE WHEN tp.name IS NOT NULL THEN tp.name || ' · ' || t.name ELSE t.name END`;

async function resolveTagFilterGroups(
  db: D1Database,
  tagIds: string[]
): Promise<string[][]> {
  const groups: string[][] = [];
  for (const id of tagIds) {
    const children = await db.prepare('SELECT id FROM tags WHERE parent_id = ?').bind(id).all();
    const childIds = ((children.results as { id: string }[]) ?? []).map((r) => r.id);
    groups.push(childIds.length > 0 ? childIds : [id]);
  }
  return groups;
}

async function tagHasChildren(db: D1Database, tagId: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM tags WHERE parent_id = ? LIMIT 1').bind(tagId).first();
  return Boolean(row);
}

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// CORS: with credentials, never use '*'. If WEB_ORIGIN is set, only that origin is allowed.
app.use('/*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowOrigin = c.env.WEB_ORIGIN
    ? origin === c.env.WEB_ORIGIN
      ? c.env.WEB_ORIGIN
      : ''
    : origin || '*';
  return cors({
    origin: allowOrigin,
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
    const user = await resolveUserFromCookies({ request: c.req.raw, jwtSecret });
    if (user) {
      c.set('user', user);
      console.log(JSON.stringify({ msg: 'auth.soft.ok', method: c.req.method, path: c.req.path, sub: user.sub }));
    } else {
      console.log(JSON.stringify({ msg: 'auth.soft.none', method: c.req.method, path: c.req.path }));
    }
  } catch {
    console.log(JSON.stringify({ msg: 'auth.soft.invalid', method: c.req.method, path: c.req.path }));
  }
  return next();
});

function getBaseUrl(c: any): string {
  // Prefer explicit AUTH_BASE_URL (recommended in production)
  if (c.env.AUTH_BASE_URL) return c.env.AUTH_BASE_URL;
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

function getAuthCookieSameSite(c: { env: Env; req: { url: string } }): 'Lax' | 'Strict' | 'None' {
  // Explicit override wins
  if (c.env.AUTH_COOKIE_SAMESITE) return c.env.AUTH_COOKIE_SAMESITE;
  // If WEB_ORIGIN is configured, this deployment is expected to be called from a separate SPA origin.
  // Cookie-based auth in that scenario requires SameSite=None for fetch/XHR.
  const isHttps = new URL(c.req.url).protocol === 'https:';
  if (c.env.WEB_ORIGIN && isHttps) return 'None';
  // Local/insecure fallback (browsers reject SameSite=None without Secure on HTTP)
  return 'Lax';
}

function withAuthFlag(
  redirectTo: string,
  auth: 'success' | 'error' | 'drive_connected' | 'drive_error'
): string {
  try {
    const url = new URL(redirectTo);
    url.searchParams.set('auth', auth);
    return url.toString();
  } catch {
    // Relative URL fallback
    try {
      const url = new URL(redirectTo, 'http://local');
      url.searchParams.set('auth', auth);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return redirectTo;
    }
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function assertTrustedMutationOrigin(c: { env: Env; req: { header: (n: string) => string | undefined }; json: (b: object, s: number) => Response }): Response | null {
  const web = c.env.WEB_ORIGIN;
  if (!web) return null;
  const origin = c.req.header('origin');
  if (!origin || origin !== web) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  return null;
}

async function requireAuth(c: any, next: any) {
  const blocked = assertTrustedMutationOrigin(c);
  if (blocked) return blocked;

  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

  try {
    const user = c.get('user') ?? (await resolveUserFromCookies({ request: c.req.raw, jwtSecret }));
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    c.set('user', user);
    return await next();
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
}

// --- Auth routes ---
app.get('/auth/status', (c) => {
  const sameSite = getAuthCookieSameSite(c);
  return c.json({
    googleClientConfigured: Boolean(c.env.GOOGLE_CLIENT_ID),
    googleClientSecretConfigured: Boolean(c.env.GOOGLE_CLIENT_SECRET),
    jwtConfigured: Boolean(c.env.AUTH_JWT_SECRET),
    authBaseUrl: c.env.AUTH_BASE_URL || null,
    webOriginSet: Boolean(c.env.WEB_ORIGIN),
    webOrigin: c.env.WEB_ORIGIN || null,
    cookieSameSiteConfigured: c.env.AUTH_COOKIE_SAMESITE || null,
    cookieSameSiteEffective: sameSite,
    callbackUrl: `${getBaseUrl(c)}/auth/callback`,
  });
});

app.get('/auth/login', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'Google OAuth not configured' }, 500);

  const baseUrl = getBaseUrl(c);
  const redirectTo = c.req.query('redirect') || '/';
  const { location, setCookies } = await buildGoogleAuthorizeRedirect({
    requestUrl: new URL(c.req.url),
    baseUrl,
    clientId,
    redirectTo,
    cookieSameSite: getAuthCookieSameSite(c),
    purpose: 'login',
  });

  setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
  return c.redirect(location);
});

/** Incremental OAuth: request drive.readonly + offline refresh for the logged-in user. */
app.get('/auth/drive/connect', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!clientId || !jwtSecret) return c.json({ error: 'Google OAuth not configured' }, 500);

  const user = await resolveUserFromCookies({ request: c.req.raw, jwtSecret });
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const baseUrl = getBaseUrl(c);
  const redirectTo = c.req.query('redirect') || c.env.WEB_ORIGIN || '/';
  const { location, setCookies } = await buildGoogleAuthorizeRedirect({
    requestUrl: new URL(c.req.url),
    baseUrl,
    clientId,
    redirectTo,
    cookieSameSite: getAuthCookieSameSite(c),
    purpose: 'drive',
  });

  setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
  return c.redirect(location);
});

app.get('/auth/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!clientId || !jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

  const baseUrl = getBaseUrl(c);
  try {
    const result = await handleOAuthCallback({
      request: c.req.raw,
      requestUrl: new URL(c.req.url),
      baseUrl,
      clientId,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      jwtSecret,
      db: c.env.DB,
      cookieSameSite: getAuthCookieSameSite(c),
    });
    if (result.purpose === 'drive' && result.googleRefreshToken) {
      await upsertDriveRefreshToken({
        db: c.env.DB,
        userSub: result.user.sub,
        jwtSecret,
        refreshToken: result.googleRefreshToken,
      });
      result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
      return c.redirect(withAuthFlag(result.redirectTo, 'drive_connected'));
    }
    result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.redirect(withAuthFlag(result.redirectTo, 'success'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        msg: 'auth.callback.error',
        error: message,
        hasClientSecret: Boolean(c.env.GOOGLE_CLIENT_SECRET),
      })
    );
    const fallback = c.req.query('redirect') || '/';
    const isDrive = message.toLowerCase().includes('drive');
    return c.redirect(withAuthFlag(fallback, isDrive ? 'drive_error' : 'error'));
  }
});

app.post('/auth/logout', async (c) => {
  const blocked = assertTrustedMutationOrigin(c);
  if (blocked) return blocked;
  const cookies = await buildLogoutCookies({
    request: c.req.raw,
    requestUrl: new URL(c.req.url),
    db: c.env.DB,
  });
  cookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
  return c.json({ ok: true });
});

app.post('/auth/refresh', async (c) => {
  const blocked = assertTrustedMutationOrigin(c);
  if (blocked) return blocked;
  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!jwtSecret) return c.json({ error: 'Auth not configured' }, 500);

  const rawRefresh = getCookie(c.req.raw, getRefreshCookieName());
  if (!rawRefresh) {
    clearAllAuthCookieHeaders(new URL(c.req.url)).forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await rotateRefreshSession({
    db: c.env.DB,
    requestUrl: new URL(c.req.url),
    jwtSecret,
    rawRefresh,
    cookieSameSite: getAuthCookieSameSite(c),
  }).catch((error) => {
    console.error('Error rotating refresh session:', error);
    return { error: 'unavailable' as const };
  });

  if ('error' in result && result.error === 'unavailable') {
    return c.json({ error: 'Auth session unavailable' }, 503);
  }

  if ('error' in result) {
    clearAllAuthCookieHeaders(new URL(c.req.url)).forEach(v => c.header('Set-Cookie', v, { append: true }));
    return c.json({ error: 'Unauthorized' }, 401);
  }

  result.setCookies.forEach(v => c.header('Set-Cookie', v, { append: true }));
  return c.json({ ok: true, user: result.user });
});

app.get('/auth/me', async (c) => {
  const jwtSecret = c.env.AUTH_JWT_SECRET;
  if (!jwtSecret) return c.json({ user: null });
  try {
    const user = await resolveUserFromCookies({ request: c.req.raw, jwtSecret });
    return c.json({ user });
  } catch {
    return c.json({ user: null });
  }
});

const VALID_SORT_FIELDS = ['number', 'name', 'rhythm', 'tonality', 'category', 'author', 'created_at'] as const;
type SortField = typeof VALID_SORT_FIELDS[number];

const NOCASE_FIELDS: SortField[] = ['name', 'author', 'rhythm', 'tonality', 'category'];

/** NULL/empty values always sort last, regardless of ASC/DESC. */
function buildOrderClause(sort: SortField, order: 'ASC' | 'DESC'): string {
  if (sort === 'created_at') {
    return `ORDER BY p.created_at ${order}`;
  }

  const emptyLast = `CASE WHEN p.${sort} IS NULL OR p.${sort} = '' THEN 1 ELSE 0 END ASC`;

  if (sort === 'number') {
    return `ORDER BY ${emptyLast}, CAST(p.number AS INTEGER) ${order}`;
  }

  const collate = NOCASE_FIELDS.includes(sort) ? ' COLLATE NOCASE' : '';
  return `ORDER BY ${emptyLast}, p.${sort}${collate} ${order}`;
}

/** Build FTS5 MATCH string (prefix terms, ANDed). */
function buildFtsMatchQuery(search: string): string {
  const terms = search
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => `"${t.replace(/"/g, '""')}"*`);
  return terms.length > 0 ? terms.join(' AND ') : '';
}

function buildWhereClause(params: {
  search?: string;
  useFts?: boolean;
  tagGroups?: string[][];
  rhythm?: string[];
  tonality?: string[];
  category?: string[];
  materialKinds?: string[];
  numberMin?: number;
  numberMax?: number;
}): { clause: string; bindings: (string | number)[] } {
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.search) {
    const pattern = `%${params.search}%`;
    if (params.useFts) {
      const ftsQuery = buildFtsMatchQuery(params.search);
      if (ftsQuery) {
        conditions.push(
          `(p.rowid IN (SELECT rowid FROM praises_fts WHERE praises_fts MATCH ?) OR p.id LIKE ?)`
        );
        bindings.push(ftsQuery, pattern);
      } else {
        conditions.push(`p.id LIKE ?`);
        bindings.push(pattern);
      }
    } else {
      conditions.push(
        `(p.name LIKE ? OR p.lyrics LIKE ? OR p.author LIKE ? OR p.rhythm LIKE ? OR p.tonality LIKE ? OR p.category LIKE ? OR p.id LIKE ?)`
      );
      bindings.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    }
  }

  if (params.tagGroups && params.tagGroups.length > 0) {
    for (const group of params.tagGroups) {
      conditions.push(
        `p.id IN (SELECT praise_id FROM praise_tags WHERE tag_id IN (${group.map(() => '?').join(',')}))`
      );
      bindings.push(...group);
    }
  }

  if (params.rhythm && params.rhythm.length > 0) {
    conditions.push(`p.rhythm IN (${params.rhythm.map(() => '?').join(',')})`);
    bindings.push(...params.rhythm);
  }

  if (params.tonality && params.tonality.length > 0) {
    conditions.push(`p.tonality IN (${params.tonality.map(() => '?').join(',')})`);
    bindings.push(...params.tonality);
  }

  if (params.category && params.category.length > 0) {
    conditions.push(`p.category IN (${params.category.map(() => '?').join(',')})`);
    bindings.push(...params.category);
  }

  if (params.materialKinds && params.materialKinds.length > 0) {
    conditions.push(
      `p.id IN (
        SELECT pm.praise_id FROM praise_materials pm
        WHERE pm.material_kind IN (${params.materialKinds.map(() => '?').join(',')})
        GROUP BY pm.praise_id
        HAVING COUNT(DISTINCT pm.material_kind) = ?
      )`
    );
    bindings.push(...params.materialKinds, params.materialKinds.length);
  }

  if (params.numberMin !== undefined) {
    conditions.push(`CAST(p.number AS INTEGER) >= ?`);
    bindings.push(params.numberMin);
  }

  if (params.numberMax !== undefined) {
    conditions.push(`CAST(p.number AS INTEGER) <= ?`);
    bindings.push(params.numberMax);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, bindings };
}

// GET /api/praises - List all praises with optional search
app.get('/api/praises', async (c) => {
  const search = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  const tags = c.req.query('tags') ? c.req.query('tags')!.split(',').filter(Boolean) : undefined;
  const rhythm = c.req.query('rhythm') ? c.req.query('rhythm')!.split(',').filter(Boolean) : undefined;
  const tonality = c.req.query('tonality') ? c.req.query('tonality')!.split(',').filter(Boolean) : undefined;
  const category = c.req.query('category') ? c.req.query('category')!.split(',').filter(Boolean) : undefined;
  const materialKinds = c.req.query('materialKinds')
    ? c.req.query('materialKinds')!.split(',').filter(Boolean)
    : undefined;
  const numberMin = c.req.query('numberMin') ? parseInt(c.req.query('numberMin')!, 10) : undefined;
  const numberMax = c.req.query('numberMax') ? parseInt(c.req.query('numberMax')!, 10) : undefined;

  const sortParam = c.req.query('sort') as SortField | undefined;
  const sort = VALID_SORT_FIELDS.includes(sortParam!) ? sortParam! : 'number';
  const order = c.req.query('order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  let useFtsAttempt = Boolean(search);

  for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const tagGroups =
      tags && tags.length > 0 ? await resolveTagFilterGroups(c.env.DB, tags) : undefined;

    const { clause: whereClause, bindings: whereBindings } = buildWhereClause({
      search: search || undefined,
      useFts: useFtsAttempt,
      tagGroups,
      rhythm,
      tonality,
      category,
      materialKinds,
      numberMin,
      numberMax,
    });

    const orderClause = buildOrderClause(sort, order);
    const bindings: (string | number)[] = [...whereBindings];

    const query = `
      SELECT
        p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics, p.group_id,
        GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids,
        GROUP_CONCAT(DISTINCT ${TAG_LABEL_SQL}) as tag_names
      FROM praises p
      LEFT JOIN praise_tags pt ON p.id = pt.praise_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN tags tp ON t.parent_id = tp.id
      ${whereClause}
      GROUP BY p.id
      ${orderClause}
      LIMIT ? OFFSET ?
    `;
    bindings.push(limit, offset);

    const result = await c.env.DB.prepare(query).bind(...bindings).all();

    let countQuery: string;
    let countBindings: (string | number)[] = [...whereBindings];

    if (whereClause) {
      countQuery = `SELECT COUNT(*) as total FROM praises p ${whereClause}`;
    } else {
      countQuery = `SELECT COUNT(*) as total FROM praises`;
      countBindings = [];
    }

    const countResult = await c.env.DB.prepare(countQuery).bind(...countBindings).first();
    const total = (countResult?.total as number) || 0;

    return c.json({
      data: result.results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (useFtsAttempt && search) {
      useFtsAttempt = false;
      console.warn(
        JSON.stringify({
          msg: 'api.praises.fts_fallback',
          error: error instanceof Error ? error.message : String(error),
        })
      );
      continue;
    }
    console.error('Error fetching praises:', error);
    return c.json({ error: 'Failed to fetch praises' }, 500);
  }
  }

  return c.json({ error: 'Failed to fetch praises' }, 500);
});

// GET /api/plpcg/praises - Lightweight list for PLPCG (no lyrics text; slim materials)
app.get('/api/plpcg/praises', async (c) => {
  try {
    const query = parsePlpcgListQuery(c);
    const result = await listPlpcgPraises(c.env.DB, query, {
      buildWhereClause,
      buildOrderClause: buildOrderClause as PlpcgListDeps['buildOrderClause'],
      validSortFields: VALID_SORT_FIELDS,
      resolveTagFilterGroups,
      tagLabelSql: TAG_LABEL_SQL,
    });
    return c.json(result);
  } catch (error) {
    console.error('Error fetching PLPCG praises:', error);
    return c.json({ error: 'Failed to fetch praises' }, 500);
  }
});

// GET /api/praises/filters - Get filter options
app.get('/api/praises/filters', async (c) => {
  try {
    const [rhythmsResult, tonalitiesResult, categoriesResult, tagsResult] = await Promise.all([
      c.env.DB.prepare(`SELECT DISTINCT rhythm FROM praises WHERE rhythm IS NOT NULL AND rhythm != '' ORDER BY rhythm`).all(),
      c.env.DB.prepare(`SELECT DISTINCT tonality FROM praises WHERE tonality IS NOT NULL AND tonality != '' ORDER BY tonality`).all(),
      c.env.DB.prepare(`SELECT DISTINCT category FROM praises WHERE category IS NOT NULL AND category != '' ORDER BY category`).all(),
      c.env.DB.prepare(`
        SELECT t.id, t.name, t.parent_id, COUNT(pt.praise_id) as count
        FROM tags t
        LEFT JOIN praise_tags pt ON t.id = pt.tag_id
        GROUP BY t.id
        ORDER BY t.name
      `).all(),
    ]);

    const tagRows = (tagsResult.results as { id: string; name: string; parent_id: string | null; count: number }[]) ?? [];
    const childCountByParent = new Map<string, number>();
    for (const t of tagRows) {
      if (t.parent_id) {
        childCountByParent.set(t.parent_id, (childCountByParent.get(t.parent_id) ?? 0) + Number(t.count));
      }
    }
    const tagsOut = tagRows.map((t) => {
      const hasChildren = childCountByParent.has(t.id);
      const count = hasChildren ? (childCountByParent.get(t.id) ?? 0) : Number(t.count);
      return { id: t.id, name: t.name, parent_id: t.parent_id ?? null, count };
    });

    return c.json({
      rhythms: (rhythmsResult.results as { rhythm: string }[]).map(r => r.rhythm),
      tonalities: (tonalitiesResult.results as { tonality: string }[]).map(r => r.tonality),
      categories: (categoriesResult.results as { category: string }[]).map(r => r.category),
      tags: tagsOut,
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    return c.json({ error: 'Failed to fetch filters' }, 500);
  }
});

// GET /api/praises/:id/download.zip - Public ZIP export (metadata.yml + materials)
app.get('/api/praises/:id/download.zip', async (c) => {
  const id = c.req.param('id');

  try {
    const result = await buildPraiseZipStream(c.env.DB, c.env.ASSETS, id);
    if (!result) {
      return c.json({ error: 'Praise not found' }, 404);
    }

    const encodedFilename = encodeURIComponent(result.filename);
    const safeFilename = result.filename.replace(/"/g, '');
    return new Response(result.stream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    if (error instanceof PraiseZipTooLargeError) {
      return c.json({ error: error.message }, 413);
    }
    console.error('Error building praise ZIP:', error);
    return c.json({ error: 'Failed to build download' }, 500);
  }
});

// GET /api/praises/:id - Get single praise with materials
app.get('/api/praises/:id', async (c) => {
  const id = c.req.param('id');

  try {
    // Fetch praise with tags
    const praiseQuery = `
      SELECT 
        p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics, p.group_id,
        GROUP_CONCAT(pt.tag_id) as tag_ids
      FROM praises p
      LEFT JOIN praise_tags pt ON p.id = pt.praise_id
      WHERE p.id = ?
      GROUP BY p.id
    `;
    const praiseResult = await c.env.DB.prepare(praiseQuery).bind(id).first() as PraiseResult | null;

    if (!praiseResult) {
      return c.json({ error: 'Praise not found' }, 404);
    }

    // Fetch materials for this praise
    const materialsQuery = `
      SELECT 
        pm.id, pm.praise_id, pm.material_kind, pm.type, pm.r2_key, pm.file_path_legacy,
        pm.source_material_id, pm.merged_from_praise_id, pm.url,
        mp.name AS merged_from_praise_name
      FROM praise_materials pm
      LEFT JOIN praises mp ON mp.id = pm.merged_from_praise_id
      WHERE pm.praise_id = ?
    `;
    const materialsResult = await c.env.DB.prepare(materialsQuery).bind(id).all();

    // Fetch tag names (with parent for display)
    const tagIds = praiseResult.tag_ids ? praiseResult.tag_ids.split(',') : [];
    let tags: TagRow[] = [];
    
    if (tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(',');
      const tagsQuery = `
        SELECT t.id, t.name, t.parent_id, tp.name as parent_name
        FROM tags t
        LEFT JOIN tags tp ON t.parent_id = tp.id
        WHERE t.id IN (${placeholders})
      `;
      const tagsResult = await c.env.DB.prepare(tagsQuery).bind(...tagIds).all();
      tags = (tagsResult.results as TagRow[]).map((t) => ({
        id: t.id,
        name: t.name,
        parent_id: t.parent_id ?? null,
        parent_name: t.parent_name ?? null,
      }));
    }

    let group_members: { id: string; tags: TagRow[] }[] = [];
    if (praiseResult.group_id) {
      const membersResult = await c.env.DB.prepare(
        `SELECT p.id,
                GROUP_CONCAT(pt.tag_id) as tag_ids,
                GROUP_CONCAT(${TAG_LABEL_SQL}) as tag_names
         FROM praises p
         LEFT JOIN praise_tags pt ON p.id = pt.praise_id
         LEFT JOIN tags t ON pt.tag_id = t.id
         LEFT JOIN tags tp ON t.parent_id = tp.id
         WHERE p.group_id = ? AND p.id != ?
         GROUP BY p.id
         ORDER BY p.name, p.number`
      ).bind(praiseResult.group_id, id).all();

      group_members = (membersResult.results as { id: string; tag_ids: string | null; tag_names: string | null }[]).map(
        (m) => {
          const ids = m.tag_ids ? m.tag_ids.split(',') : [];
          const names = m.tag_names ? m.tag_names.split(',') : [];
          return {
            id: m.id,
            tags: ids.map((tid, i) => ({
              id: tid,
              name: names[i] || tid,
              parent_id: null,
            })),
          };
        }
      );
    }

    const materialKindLabels = await loadMaterialKindLabels(c.env.DB);

    const materials = (materialsResult.results as any[]).map(m => ({
      ...m,
      material_kind_name: labelFor(materialKindLabels, m.material_kind),
    }));

    return c.json({
      data: {
        ...praiseResult,
        tag_ids: tagIds,
        tags,
        materials,
        group_members,
      },
    });
  } catch (error) {
    console.error('Error fetching praise:', error);
    return c.json({ error: 'Failed to fetch praise' }, 500);
  }
});

// GET /api/materials/kinds - List all material kinds
app.get('/api/materials/kinds', async (c) => {
  try {
    const data = await listMaterialKindsForLocale(c.env.DB);
    return c.json({ data });
  } catch (error) {
    console.error('Error fetching material kinds:', error);
    return c.json({ error: 'Failed to fetch material kinds' }, 500);
  }
});

// GET /api/tags - List all tags
app.get('/api/tags', async (c) => {
  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name, parent_id FROM tags ORDER BY name ASC`
    ).all();
    return c.json({
      data: ((result.results as TagRow[]) ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        parent_id: t.parent_id ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return c.json({ error: 'Failed to fetch tags' }, 500);
  }
});

// POST /api/tags - Create root tag or subtag (admin)
app.post('/api/tags', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    return c.json({ error: "Field 'name' is required" }, 400);
  }

  let parentId: string | null = null;
  if ('parent_id' in body && body.parent_id != null && body.parent_id !== '') {
    if (typeof body.parent_id !== 'string') {
      return c.json({ error: "Field 'parent_id' must be a string" }, 400);
    }
    parentId = body.parent_id.trim();
  }

  try {
    if (parentId) {
      const parent = await c.env.DB.prepare(
        'SELECT id, parent_id FROM tags WHERE id = ?'
      ).bind(parentId).first<{ id: string; parent_id: string | null }>();
      if (!parent) return c.json({ error: 'Parent tag not found' }, 400);
      if (parent.parent_id) {
        return c.json({ error: 'Subtags cannot have subtags (one level only)' }, 400);
      }
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO tags (id, name, parent_id) VALUES (?, ?, ?)'
    ).bind(id, name.trim(), parentId).run();

    const parentName = parentId
      ? ((await c.env.DB.prepare('SELECT name FROM tags WHERE id = ?').bind(parentId).first()) as { name: string } | null)?.name
      : null;

    return c.json({
      data: {
        id,
        name: name.trim(),
        parent_id: parentId,
        parent_name: parentName ?? null,
      },
    }, 201);
  } catch (error) {
    console.error('Error creating tag:', error);
    return c.json({ error: 'Failed to create tag' }, 500);
  }
});

// POST /api/praises - Create a praise (admin)
app.post('/api/praises', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    return c.json({ error: "Field 'name' is required" }, 400);
  }

  const optionalFields = ['number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
  const fieldValues: Record<(typeof optionalFields)[number], string | null> = {
    number: null,
    author: null,
    rhythm: null,
    tonality: null,
    category: null,
    lyrics: null,
  };

  for (const key of optionalFields) {
    if (!(key in body)) continue;
    const val = body[key];
    if (val === null || val === undefined) {
      fieldValues[key] = null;
      continue;
    }
    if (typeof val !== 'string') {
      return c.json({ error: `Field '${key}' must be a string` }, 400);
    }
    fieldValues[key] = val;
  }

  let tagIds: string[] = [];
  if ('tag_ids' in body) {
    if (!Array.isArray(body.tag_ids)) {
      return c.json({ error: "Field 'tag_ids' must be an array" }, 400);
    }
    tagIds = body.tag_ids.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
  }

  const id = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      `INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      name.trim(),
      fieldValues.number,
      fieldValues.author,
      fieldValues.rhythm,
      fieldValues.tonality,
      fieldValues.category,
      fieldValues.lyrics
    ).run();

    for (const tagId of tagIds) {
      const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
      if (!tag) return c.json({ error: 'Tag not found' }, 400);
      if (await tagHasChildren(c.env.DB, tagId)) {
        return c.json({ error: 'Cannot attach a parent tag; use a subtag' }, 400);
      }

      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)'
      ).bind(id, tagId).run();
    }
  } catch (error) {
    console.error('Error creating praise:', error);
    return c.json({ error: 'Failed to create praise' }, 500);
  }

  try {
    const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as Env);
    const json = await res.json();
    return c.json(json, res.status === 200 ? 201 : (res.status as ContentfulStatusCode));
  } catch (error) {
    console.error('Error re-fetching praise after create:', error);
    return c.json({ ok: true }, 201);
  }
});

// PATCH /api/praises/:id - Update praise fields (admin)
app.patch('/api/praises/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const updatable = ['name', 'number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
  const sets: string[] = [];
  const bindings: (string | null)[] = [];

  for (const key of updatable) {
    if (!(key in body)) continue;
    const val = body[key];
    if (val === null || val === undefined) {
      sets.push(`${key} = ?`);
      bindings.push(null);
      continue;
    }
    if (typeof val !== 'string') {
      return c.json({ error: `Field '${key}' must be a string` }, 400);
    }
    sets.push(`${key} = ?`);
    bindings.push(val);
  }

  if (sets.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  try {
    const sql = `UPDATE praises SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`;
    await c.env.DB.prepare(sql).bind(...bindings, id).run();
  } catch (error) {
    console.error('Error updating praise:', error);
    return c.json({ error: 'Failed to update praise' }, 500);
  }

  // Return updated detail (same shape as GET /api/praises/:id)
  const reqUrl = new URL(c.req.url);
  const base = `${reqUrl.protocol}//${reqUrl.host}`;
  try {
    const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error re-fetching praise after update:', error);
    return c.json({ ok: true });
  }
});

// POST /api/praises/:id/group - Link this praise into another's group (admin)
app.post('/api/praises/:id/group', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null) as { praise_id?: unknown } | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

  const targetId = body.praise_id;
  if (typeof targetId !== 'string' || !targetId.trim()) {
    return c.json({ error: "Field 'praise_id' is required" }, 400);
  }
  if (targetId === id) {
    return c.json({ error: 'Cannot group a praise with itself' }, 400);
  }

  try {
    const self = await c.env.DB.prepare('SELECT id, group_id FROM praises WHERE id = ?')
      .bind(id)
      .first<{ id: string; group_id: string | null }>();
    if (!self) return c.json({ error: 'Praise not found' }, 404);

    const other = await c.env.DB.prepare('SELECT id, group_id FROM praises WHERE id = ?')
      .bind(targetId)
      .first<{ id: string; group_id: string | null }>();
    if (!other) return c.json({ error: 'Target praise not found' }, 404);

    const gid = other.group_id ?? other.id;
    await c.env.DB.prepare(
      `UPDATE praises SET group_id = ?, updated_at = datetime('now') WHERE id IN (?, ?)`
    )
      .bind(gid, id, targetId)
      .run();
  } catch (error) {
    console.error('Error grouping praises:', error);
    return c.json({ error: 'Failed to group praises' }, 500);
  }

  try {
    const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error re-fetching praise after group:', error);
    return c.json({ ok: true });
  }
});

// POST /api/praises/:id/tags - Attach a tag to a praise (admin)
app.post('/api/praises/:id/tags', requireAuth, async (c) => {
  const praiseId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as { tag_id?: unknown } | null;
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

  const tagId = body.tag_id;
  if (typeof tagId !== 'string' || !tagId.trim()) {
    return c.json({ error: "Field 'tag_id' is required" }, 400);
  }

  try {
    const praise = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(praiseId).first();
    if (!praise) return c.json({ error: 'Praise not found' }, 404);

    const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
    if (!tag) return c.json({ error: 'Tag not found' }, 404);
    if (await tagHasChildren(c.env.DB, tagId)) {
      return c.json({ error: 'Cannot attach a parent tag; use a subtag' }, 400);
    }

    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)'
    ).bind(praiseId, tagId).run();
  } catch (error) {
    console.error('Error adding praise tag:', error);
    return c.json({ error: 'Failed to add tag' }, 500);
  }

  try {
    const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error re-fetching praise after adding tag:', error);
    return c.json({ ok: true });
  }
});

async function deletePraiseWithAssets(env: Env, praiseId: string): Promise<void> {
  const materials = await env.DB.prepare(
    `SELECT id, r2_key FROM praise_materials WHERE praise_id = ?`
  ).bind(praiseId).all();
  for (const row of (materials.results as { id: string; r2_key: string | null }[]) ?? []) {
    if (row.r2_key) {
      try {
        await env.ASSETS.delete(`storage/${row.r2_key}`);
      } catch (e) {
        console.warn('Failed to delete R2 object:', e);
      }
    }
  }
  await env.DB.prepare('DELETE FROM praises WHERE id = ?').bind(praiseId).run();
}

// POST /api/praises/:keeperId/merge - Merge duplicate praise into keeper (admin)
app.post('/api/praises/:keeperId/merge', requireAuth, async (c) => {
  const keeperId = c.req.param('keeperId');
  const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const sourcePraiseId = body.source_praise_id;
  if (typeof sourcePraiseId !== 'string' || !sourcePraiseId.trim()) {
    return c.json({ error: "Field 'source_praise_id' is required" }, 400);
  }
  const sourceId = sourcePraiseId.trim();
  if (sourceId === keeperId) {
    return c.json({ error: 'Cannot merge a praise into itself' }, 400);
  }

  const metadata = body.metadata;
  if (!metadata || typeof metadata !== 'object') {
    return c.json({ error: "Field 'metadata' is required" }, 400);
  }

  const metaObj = metadata as Record<string, unknown>;
  const updatable = ['name', 'number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
  const metaValues: Record<(typeof updatable)[number], string | null> = {
    name: null,
    number: null,
    author: null,
    rhythm: null,
    tonality: null,
    category: null,
    lyrics: null,
  };

  for (const key of updatable) {
    if (!(key in metaObj)) {
      return c.json({ error: `Field 'metadata.${key}' is required` }, 400);
    }
    const val = metaObj[key];
    if (key === 'name') {
      if (typeof val !== 'string' || !val.trim()) {
        return c.json({ error: "Field 'metadata.name' is required" }, 400);
      }
      metaValues[key] = val.trim();
      continue;
    }
    if (val === null || val === undefined) {
      metaValues[key] = null;
      continue;
    }
    if (typeof val !== 'string') {
      return c.json({ error: `Field 'metadata.${key}' must be a string` }, 400);
    }
    metaValues[key] = val;
  }

  let tagIds: string[] = [];
  if (!('tag_ids' in body) || !Array.isArray(body.tag_ids)) {
    return c.json({ error: "Field 'tag_ids' must be an array" }, 400);
  }
  tagIds = body.tag_ids.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  let materialIdsToImport: string[] = [];
  if (!('material_ids_to_import' in body) || !Array.isArray(body.material_ids_to_import)) {
    return c.json({ error: "Field 'material_ids_to_import' must be an array" }, 400);
  }
  materialIdsToImport = body.material_ids_to_import.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  try {
    const keeper = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(keeperId).first();
    if (!keeper) return c.json({ error: 'Keeper praise not found' }, 404);

    const source = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(sourceId).first();
    if (!source) return c.json({ error: 'Source praise not found' }, 404);

    for (const tagId of tagIds) {
      const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
      if (!tag) return c.json({ error: 'Tag not found' }, 400);
      if (await tagHasChildren(c.env.DB, tagId)) {
        return c.json({ error: 'Cannot attach a parent tag; use a subtag' }, 400);
      }
    }

    for (const materialId of materialIdsToImport) {
      const mat = await c.env.DB.prepare(
        'SELECT id, praise_id FROM praise_materials WHERE id = ?'
      ).bind(materialId).first() as { id: string; praise_id: string } | null;
      if (!mat) {
        return c.json({ error: `Material not found: ${materialId}` }, 409);
      }
      if (mat.praise_id !== sourceId) {
        return c.json({ error: `Material ${materialId} does not belong to source praise` }, 409);
      }
    }

    await c.env.DB.prepare(
      `UPDATE praises SET name = ?, number = ?, author = ?, rhythm = ?, tonality = ?, category = ?, lyrics = ?,
       updated_at = datetime('now') WHERE id = ?`
    ).bind(
      metaValues.name,
      metaValues.number,
      metaValues.author,
      metaValues.rhythm,
      metaValues.tonality,
      metaValues.category,
      metaValues.lyrics,
      keeperId
    ).run();

    await c.env.DB.prepare('DELETE FROM praise_tags WHERE praise_id = ?').bind(keeperId).run();
    for (const tagId of tagIds) {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)'
      ).bind(keeperId, tagId).run();
    }

    for (const materialId of materialIdsToImport) {
      await c.env.DB.prepare(
        `UPDATE praise_materials SET praise_id = ?, merged_from_praise_id = ? WHERE id = ? AND praise_id = ?`
      ).bind(keeperId, sourceId, materialId, sourceId).run();
    }

    await deletePraiseWithAssets(c.env, sourceId);
  } catch (error) {
    console.error('Error merging praises:', error);
    return c.json({ error: 'Failed to merge praises' }, 500);
  }

  try {
    const res = await app.request(`/api/praises/${keeperId}`, { method: 'GET' }, c.env as Env);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error re-fetching praise after merge:', error);
    return c.json({ ok: true });
  }
});

// DELETE /api/praises/:id/tags/:tagId - Detach a tag from a praise (admin)
app.delete('/api/praises/:id/tags/:tagId', requireAuth, async (c) => {
  const praiseId = c.req.param('id');
  const tagId = c.req.param('tagId');

  try {
    const praise = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(praiseId).first();
    if (!praise) return c.json({ error: 'Praise not found' }, 404);

    await c.env.DB.prepare(
      'DELETE FROM praise_tags WHERE praise_id = ? AND tag_id = ?'
    ).bind(praiseId, tagId).run();
  } catch (error) {
    console.error('Error removing praise tag:', error);
    return c.json({ error: 'Failed to remove tag' }, 500);
  }

  try {
    const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error re-fetching praise after removing tag:', error);
    return c.json({ ok: true });
  }
});

// POST /api/praises/:id/materials - Create a material (admin, JSON)
app.post('/api/praises/:id/materials', requireAuth, async (c) => {
  const praiseId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

  const material_kind = body.material_kind;
  const type = body.type;
  const url = body.url;

  if (typeof material_kind !== 'string' || !material_kind) return c.json({ error: "Field 'material_kind' is required" }, 400);
  if (typeof type !== 'string' || !type) return c.json({ error: "Field 'type' is required" }, 400);

  const hasUrl = typeof url === 'string' && url.trim().length > 0;
  const isYouTube = (u: string) => {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
    } catch {
      return false;
    }
  };

  if (type === 'youtube') {
    if (!hasUrl) return c.json({ error: "Field 'url' is required for type youtube" }, 400);
    if (!isYouTube(url)) return c.json({ error: 'Invalid YouTube URL' }, 400);
  }
  const id = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      praiseId,
      material_kind,
      type,
      null,
      '',
      null,
      null,
      hasUrl ? url.trim() : null
    ).run();
  } catch (error) {
    console.error('Error creating material:', error);
    return c.json({ error: 'Failed to create material' }, 500);
  }

  const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
  const json = await res.json();
  return c.json(json, res.status as ContentfulStatusCode);
});

// POST /api/praises/:id/materials/bulk-upload - Bulk upload files for a praise (admin, multipart)
app.post('/api/praises/:id/materials/bulk-upload', requireAuth, async (c) => {
  const praiseId = c.req.param('id');

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart/form-data' }, 400);
  }

  const itemsRaw = form.get('items');
  if (typeof itemsRaw !== 'string') return c.json({ error: "Missing 'items' field" }, 400);

  let items: Array<{ key: string; material_kind: string; type: string; file_path_legacy?: string }>;
  try {
    items = JSON.parse(itemsRaw);
    if (!Array.isArray(items)) throw new Error('items must be an array');
  } catch (e) {
    return c.json({ error: 'Invalid items JSON' }, 400);
  }

  try {
    for (const item of items) {
      if (!item || typeof item !== 'object') return c.json({ error: 'Invalid item' }, 400);
      if (typeof item.key !== 'string') return c.json({ error: "Item missing 'key'" }, 400);
      if (typeof item.material_kind !== 'string' || !item.material_kind) return c.json({ error: "Item missing 'material_kind'" }, 400);
      if (typeof item.type !== 'string' || !item.type) return c.json({ error: "Item missing 'type'" }, 400);

      const fileEntry = form.get(item.key);
      if (fileEntry === null || typeof fileEntry === 'string') {
        return c.json({ error: `Missing file for key ${item.key}` }, 400);
      }
      // Remainder of FormData.get() is File (see Cloudflare FormData typings)
      const file = fileEntry as File;

      const materialId = crypto.randomUUID();
      const r2_key = `assets/praises/${praiseId}/${materialId}.${item.type}`;
      const storageKey = `storage/${r2_key}`;

      await c.env.ASSETS.put(storageKey, file.stream(), {
        httpMetadata: {
          contentType: file.type || undefined,
        },
      });

      await c.env.DB.prepare(
        `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        materialId,
        praiseId,
        item.material_kind,
        item.type,
        r2_key,
        item.file_path_legacy || file.name,
        null,
        null,
        null
      ).run();
    }
  } catch (error) {
    console.error('Error bulk uploading materials:', error);
    return c.json({ error: 'Failed to bulk upload materials' }, 500);
  }

  const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
  const json = await res.json();
  return c.json(json, res.status as ContentfulStatusCode);
});

// --- Google Drive import ---

app.get('/api/drive/status', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const connected = await hasDriveCredentials(c.env.DB, user.sub);
  return c.json({ connected });
});

app.post('/api/drive/scans', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const jwtSecret = c.env.AUTH_JWT_SECRET;
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!jwtSecret || !clientId) return c.json({ error: 'Auth not configured' }, 500);

  const body = await c.req.json().catch(() => null) as { url?: string } | null;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) return c.json({ error: 'Missing url' }, 400);

  let root;
  try {
    root = parseDriveUrl(url);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Invalid Drive URL' }, 400);
  }

  const refresh = await getDriveRefreshToken({ db: c.env.DB, userSub: user.sub, jwtSecret });
  if (!refresh) return c.json({ error: 'Drive not connected', code: 'drive_not_connected' }, 403);

  const scanId = crypto.randomUUID();
  const ts = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO drive_scans (id, user_sub, source_url, root_id, root_kind, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`
  )
    .bind(scanId, user.sub, url, root.id, root.kind, ts, ts)
    .run();

  try {
    const accessToken = await getDriveAccessToken({
      clientId,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      refreshToken: refresh,
    });
    const { files, skipped } = await listDriveTree(accessToken, root.id, root.kind);

    // Batch insert scan files
    const CHUNK = 40;
    for (let i = 0; i < files.length; i += CHUNK) {
      const slice = files.slice(i, i + CHUNK);
      const stmts = slice.map((f) =>
        c.env.DB.prepare(
          `INSERT INTO drive_scan_files (id, scan_id, drive_file_id, name, rel_path, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          scanId,
          f.id,
          f.name,
          f.relPath,
          f.mimeType,
          f.sizeBytes
        )
      );
      if (stmts.length) await c.env.DB.batch(stmts);
    }

    await c.env.DB.prepare(
      `UPDATE drive_scans SET status = 'done', skipped_json = ?, updated_at = ? WHERE id = ?`
    )
      .bind(JSON.stringify(skipped), nowSec(), scanId)
      .run();

    return c.json({
      data: {
        id: scanId,
        status: 'done',
        files: files.map((f) => ({
          drive_file_id: f.id,
          name: f.name,
          rel_path: f.relPath,
          mime_type: f.mimeType,
          size_bytes: f.sizeBytes,
        })),
        skipped,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await c.env.DB.prepare(
      `UPDATE drive_scans SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`
    )
      .bind(message.slice(0, 2000), nowSec(), scanId)
      .run();
    console.error('drive scan failed', message);
    return c.json({ error: message || 'Drive scan failed' }, 502);
  }
});

app.get('/api/drive/scans/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const scanId = c.req.param('id');
  const scan = await c.env.DB.prepare(
    `SELECT id, status, error, skipped_json FROM drive_scans WHERE id = ? AND user_sub = ?`
  )
    .bind(scanId, user.sub)
    .first<{ id: string; status: string; error: string | null; skipped_json: string | null }>();
  if (!scan) return c.json({ error: 'Scan not found' }, 404);

  const filesRes = await c.env.DB.prepare(
    `SELECT drive_file_id, name, rel_path, mime_type, size_bytes FROM drive_scan_files WHERE scan_id = ? ORDER BY rel_path`
  )
    .bind(scanId)
    .all<{
      drive_file_id: string;
      name: string;
      rel_path: string;
      mime_type: string | null;
      size_bytes: number | null;
    }>();

  let skipped: unknown[] = [];
  if (scan.skipped_json) {
    try {
      skipped = JSON.parse(scan.skipped_json);
    } catch {
      skipped = [];
    }
  }

  return c.json({
    data: {
      id: scan.id,
      status: scan.status,
      error: scan.error,
      files: filesRes.results || [],
      skipped,
    },
  });
});

app.post('/api/praises/:id/materials/drive-import', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const praiseId = c.req.param('id');
  const body = await c.req.json().catch(() => null) as {
    items?: Array<{
      drive_file_id: string;
      material_kind: string;
      type: string;
      file_path_legacy?: string;
    }>;
  } | null;

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Missing items' }, 400);
  }

  const praise = await c.env.DB.prepare(`SELECT id FROM praises WHERE id = ?`)
    .bind(praiseId)
    .first<{ id: string }>();
  if (!praise) return c.json({ error: 'Praise not found' }, 404);

  const connected = await hasDriveCredentials(c.env.DB, user.sub);
  if (!connected) return c.json({ error: 'Drive not connected', code: 'drive_not_connected' }, 403);

  for (const item of items) {
    if (!item?.drive_file_id || !item.material_kind || !item.type) {
      return c.json({ error: 'Invalid item' }, 400);
    }
  }

  const jobId = crypto.randomUUID();
  const ts = nowSec();
  await c.env.DB.prepare(
    `INSERT INTO import_jobs (id, praise_id, user_sub, status, total_count, done_count, failed_count, skipped_count, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, 0, 0, 0, ?, ?)`
  )
    .bind(jobId, praiseId, user.sub, items.length, ts, ts)
    .run();

  const itemIds: string[] = [];
  const CHUNK = 40;
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const stmts = slice.map((item) => {
      const itemId = crypto.randomUUID();
      itemIds.push(itemId);
      return c.env.DB.prepare(
        `INSERT INTO import_job_items (id, job_id, drive_file_id, material_kind, type, file_path_legacy, status, attempts, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`
      ).bind(
        itemId,
        jobId,
        item.drive_file_id,
        item.material_kind,
        item.type,
        item.file_path_legacy || null,
        ts
      );
    });
    await c.env.DB.batch(stmts);
  }

  await enqueueDriveMessages(
    c.env,
    itemIds.map((itemId) => ({ type: 'import_item' as const, jobId, itemId }))
  );

  const job = await c.env.DB.prepare(
    `SELECT id, praise_id, status, total_count, done_count, failed_count, skipped_count FROM import_jobs WHERE id = ?`
  )
    .bind(jobId)
    .first();

  return c.json({ data: job }, 202);
});

app.get('/api/import-jobs/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const jobId = c.req.param('id');
  const job = await c.env.DB.prepare(
    `SELECT id, praise_id, status, total_count, done_count, failed_count, skipped_count, created_at, updated_at
     FROM import_jobs WHERE id = ? AND user_sub = ?`
  )
    .bind(jobId, user.sub)
    .first();
  if (!job) return c.json({ error: 'Job not found' }, 404);

  const items = await c.env.DB.prepare(
    `SELECT id, drive_file_id, material_kind, type, file_path_legacy, status, attempts, error, material_id
     FROM import_job_items WHERE job_id = ? ORDER BY file_path_legacy`
  )
    .bind(jobId)
    .all();

  return c.json({ data: { ...job, items: items.results || [] } });
});

app.post('/api/import-jobs/:id/retry-failed', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const jobId = c.req.param('id');
  const job = await c.env.DB.prepare(
    `SELECT id FROM import_jobs WHERE id = ? AND user_sub = ?`
  )
    .bind(jobId, user.sub)
    .first<{ id: string }>();
  if (!job) return c.json({ error: 'Job not found' }, 404);

  const failed = await c.env.DB.prepare(
    `SELECT id FROM import_job_items WHERE job_id = ? AND status = 'failed'`
  )
    .bind(jobId)
    .all<{ id: string }>();

  const ids = (failed.results || []).map((r) => r.id);
  if (ids.length === 0) return c.json({ data: { retried: 0 } });

  const ts = nowSec();
  await c.env.DB.prepare(
    `UPDATE import_job_items SET status = 'pending', error = NULL, updated_at = ? WHERE job_id = ? AND status = 'failed'`
  )
    .bind(ts, jobId)
    .run();
  await c.env.DB.prepare(
    `UPDATE import_jobs SET status = 'pending', failed_count = 0, updated_at = ? WHERE id = ?`
  )
    .bind(ts, jobId)
    .run();

  await enqueueDriveMessages(
    c.env,
    ids.map((itemId) => ({ type: 'import_item' as const, jobId, itemId }))
  );

  return c.json({ data: { retried: ids.length } });
});

// PATCH /api/materials/:materialId - Update a material (admin)
app.patch('/api/materials/:materialId', requireAuth, async (c) => {
  const materialId = c.req.param('materialId');
  const body = await c.req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

  const sets: string[] = [];
  const bindings: (string | null)[] = [];

  if ('material_kind' in body) {
    if (body.material_kind !== null && typeof body.material_kind !== 'string') {
      return c.json({ error: "Field 'material_kind' must be a string" }, 400);
    }
    sets.push(`material_kind = ?`);
    bindings.push(body.material_kind);
  }

  if ('type' in body) {
    if (body.type !== null && typeof body.type !== 'string') {
      return c.json({ error: "Field 'type' must be a string" }, 400);
    }
    sets.push(`type = ?`);
    bindings.push(body.type);
  }

  if ('url' in body) {
    if (body.url !== null && typeof body.url !== 'string') {
      return c.json({ error: "Field 'url' must be a string" }, 400);
    }
    const trimmed = typeof body.url === 'string' ? body.url.trim() : null;
    sets.push(`url = ?`);
    bindings.push(trimmed && trimmed.length > 0 ? trimmed : null);
    // If url is set, ensure r2_key is NULL (logical material)
    if (trimmed && trimmed.length > 0) {
      sets.push(`r2_key = NULL`);
    }
  }

  if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

  try {
    const row = await c.env.DB.prepare(`SELECT praise_id FROM praise_materials WHERE id = ?`).bind(materialId).first() as any;
    if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

    // Enforce: if type is youtube, url must be a valid youtube url
    const newType = typeof body.type === 'string' ? body.type : null;
    const newUrl = 'url' in body ? (typeof body.url === 'string' ? body.url.trim() : null) : null;
    if (newType === 'youtube') {
      const effectiveUrl = newUrl ?? undefined;
      if (!effectiveUrl || effectiveUrl.length === 0) return c.json({ error: "Field 'url' is required for type youtube" }, 400);
      try {
        const parsed = new URL(effectiveUrl);
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
        const ok = host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
        if (!ok) return c.json({ error: 'Invalid YouTube URL' }, 400);
      } catch {
        return c.json({ error: 'Invalid YouTube URL' }, 400);
      }
    }

    await c.env.DB.prepare(`UPDATE praise_materials SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...bindings, materialId)
      .run();

    const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error updating material:', error);
    return c.json({ error: 'Failed to update material' }, 500);
  }
});

// DELETE /api/materials/:materialId - Delete a material (admin)
app.delete('/api/materials/:materialId', requireAuth, async (c) => {
  const materialId = c.req.param('materialId');
  try {
    const row = await c.env.DB.prepare(`SELECT praise_id, r2_key FROM praise_materials WHERE id = ?`)
      .bind(materialId)
      .first() as any;
    if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

    await c.env.DB.prepare(`DELETE FROM praise_materials WHERE id = ?`).bind(materialId).run();

    if (row.r2_key) {
      try {
        await c.env.ASSETS.delete(`storage/${row.r2_key}`);
      } catch (e) {
        // Best-effort cleanup
        console.warn('Failed to delete R2 object:', e);
      }
    }

    const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (error) {
    console.error('Error deleting material:', error);
    return c.json({ error: 'Failed to delete material' }, 500);
  }
});

// GET /assets/* - Serve files from R2
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
    chord: 'text/plain',
  };
  
  const contentType = contentTypes[ext || ''] || 'application/octet-stream';
  
  c.header('Content-Type', contentType);
  c.header('Accept-Ranges', 'bytes');
  c.header('Content-Disposition', `inline; filename="${r2Key.split('/').pop()}"`);
  
  c.status(status as 200 | 206);
  return c.body(object.body);
});

// Root endpoint
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

export { app };

const worker = {
  fetch: app.fetch.bind(app),
  async queue(batch: MessageBatch<DriveImportQueueMessage>, env: Env) {
    await handleDriveImportQueueBatch(batch, env);
  },
};

export default worker;
