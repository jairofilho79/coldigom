/** Google Drive API helpers (list + download). */

export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export const GOOGLE_APPS_MIME_PREFIX = 'application/vnd.google-apps.';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

export type DriveListedFile = {
  id: string;
  name: string;
  relPath: string;
  mimeType: string;
  sizeBytes: number | null;
};

export type DriveSkipped = {
  path: string;
  reason: string;
};

type DriveApiFile = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

async function driveFetch(accessToken: string, pathAndQuery: string): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getDriveAccessToken(params: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): Promise<string> {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', params.refreshToken);
  body.set('client_id', params.clientId);
  if (params.clientSecret) body.set('client_secret', params.clientSecret);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Google token refresh missing access_token');
  return json.access_token;
}

export async function getDriveFileMeta(
  accessToken: string,
  fileId: string
): Promise<DriveApiFile> {
  const q = new URLSearchParams({
    fields: 'id,name,mimeType,size,shortcutDetails',
    supportsAllDrives: 'true',
  });
  const res = await driveFetch(accessToken, `files/${encodeURIComponent(fileId)}?${q}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive metadata failed (${res.status}): ${text}`);
  }
  return (await res.json()) as DriveApiFile;
}

async function listChildrenPage(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveApiFile[]; nextPageToken?: string }> {
  const q = new URLSearchParams({
    q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
    fields: 'nextPageToken,files(id,name,mimeType,size,shortcutDetails)',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  if (pageToken) q.set('pageToken', pageToken);
  const res = await driveFetch(accessToken, `files?${q}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive list failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { files?: DriveApiFile[]; nextPageToken?: string };
  return { files: json.files || [], nextPageToken: json.nextPageToken };
}

function isNativeGoogleDoc(mime: string): boolean {
  return (
    mime.startsWith(GOOGLE_APPS_MIME_PREFIX) &&
    mime !== FOLDER_MIME &&
    mime !== SHORTCUT_MIME
  );
}

/**
 * Recursively list downloadable files under a Drive root (folder or single file).
 * Native Google Docs are skipped with a reason.
 */
export async function listDriveTree(
  accessToken: string,
  rootId: string,
  rootKindHint: 'folder' | 'file'
): Promise<{ files: DriveListedFile[]; skipped: DriveSkipped[] }> {
  const files: DriveListedFile[] = [];
  const skipped: DriveSkipped[] = [];

  const rootMeta = await getDriveFileMeta(accessToken, rootId);
  const rootMime = rootMeta.mimeType || '';

  if (rootKindHint === 'file' && rootMime !== FOLDER_MIME) {
    await collectFile(rootMeta, rootMeta.name || rootMeta.id, files, skipped, accessToken);
    return { files, skipped };
  }

  // Folder (or open?id that turned out to be a folder)
  const folderQueue: Array<{ id: string; prefix: string }> = [
    { id: rootId, prefix: rootMeta.name || '' },
  ];

  while (folderQueue.length > 0) {
    const current = folderQueue.shift()!;
    let pageToken: string | undefined;
    do {
      const page = await listChildrenPage(accessToken, current.id, pageToken);
      for (const child of page.files) {
        const childPath = current.prefix
          ? `${current.prefix}/${child.name}`
          : child.name;
        const mime = child.mimeType || '';
        if (mime === FOLDER_MIME) {
          folderQueue.push({ id: child.id, prefix: childPath });
          continue;
        }
        await collectFile(child, childPath, files, skipped, accessToken);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  return { files, skipped };
}

async function collectFile(
  meta: DriveApiFile,
  relPath: string,
  files: DriveListedFile[],
  skipped: DriveSkipped[],
  accessToken: string
): Promise<void> {
  let id = meta.id;
  let mime = meta.mimeType || 'application/octet-stream';
  let name = meta.name;
  let size = meta.size ? Number(meta.size) : null;

  if (mime === SHORTCUT_MIME) {
    const targetId = meta.shortcutDetails?.targetId;
    const targetMime = meta.shortcutDetails?.targetMimeType;
    if (!targetId) {
      skipped.push({ path: relPath, reason: 'Atalho sem destino' });
      return;
    }
    if (targetMime === FOLDER_MIME) {
      skipped.push({ path: relPath, reason: 'Atalho para pasta ignorado' });
      return;
    }
    try {
      const target = await getDriveFileMeta(accessToken, targetId);
      id = target.id;
      mime = target.mimeType || targetMime || 'application/octet-stream';
      name = target.name || name;
      size = target.size ? Number(target.size) : size;
    } catch {
      skipped.push({ path: relPath, reason: 'Não foi possível resolver o atalho' });
      return;
    }
  }

  if (isNativeGoogleDoc(mime)) {
    skipped.push({
      path: relPath,
      reason: 'Documento nativo do Google (pule na v1 — exporte PDF/áudio antes)',
    });
    return;
  }

  files.push({
    id,
    name,
    relPath,
    mimeType: mime,
    sizeBytes: Number.isFinite(size as number) ? size : null,
  });
}

/** Stream file bytes from Drive (alt=media). */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<{ body: ReadableStream; contentType?: string; contentLength?: number }> {
  const q = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' });
  const res = await driveFetch(accessToken, `files/${encodeURIComponent(fileId)}?${q}`);
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive download failed (${res.status}): ${text}`);
  }
  const lenHeader = res.headers.get('content-length');
  return {
    body: res.body,
    contentType: res.headers.get('content-type') || undefined,
    contentLength: lenHeader ? Number(lenHeader) : undefined,
  };
}
