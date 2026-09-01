/** Parse Google Drive share URLs into file/folder IDs. */

export type DriveRootRef = {
  id: string;
  kind: 'folder' | 'file';
};

const FOLDER_RE = /\/folders\/([a-zA-Z0-9_-]+)/;
const FILE_RE = /\/file\/d\/([a-zA-Z0-9_-]+)/;
const OPEN_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)/;
const UCID_RE = /[?&]usp=sharing/; // hint only

/**
 * Extract Drive resource id from common share URL shapes.
 * Kind defaults to folder when path says folders; otherwise file (scan resolves mime).
 */
export function parseDriveUrl(raw: string): DriveRootRef {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty Drive URL');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Bare ID
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
      return { id: trimmed, kind: 'folder' };
    }
    throw new Error('Invalid Drive URL');
  }

  // Sufixo, não substring: `includes('google.com')` casava com
  // `evil-google.com.attacker.net`. Não era explorável — o fetch sempre vai
  // para googleapis.com e o id é restrito a [a-zA-Z0-9_-] — mas é uma checagem
  // que dava falsa segurança para quem viesse depois.
  const host = url.hostname.toLowerCase();
  const dominiosAceitos = ['google.com', 'googledrive.com'];
  const confiavel = dominiosAceitos.some((d) => host === d || host.endsWith(`.${d}`));
  if (!confiavel) {
    throw new Error('URL is not a Google Drive link');
  }

  const folder = FOLDER_RE.exec(url.pathname);
  if (folder?.[1]) return { id: folder[1], kind: 'folder' };

  const file = FILE_RE.exec(url.pathname);
  if (file?.[1]) return { id: file[1], kind: 'file' };

  const openId = OPEN_ID_RE.exec(url.search) || OPEN_ID_RE.exec(url.href);
  if (openId?.[1]) {
    // open?id= can be file or folder — treat as file; scan will detect folder mime
    return { id: openId[1], kind: 'file' };
  }

  // docs.google.com/document/d/ID
  const docs = /\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
  if (docs?.[1]) return { id: docs[1], kind: 'file' };

  void UCID_RE;
  throw new Error('Could not extract Drive file/folder id from URL');
}
