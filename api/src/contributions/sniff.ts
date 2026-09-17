/**
 * Assinaturas de arquivo. A extensão do nome é só o que a pessoa declarou; a
 * chave do R2 e o Content-Type que o admin vai receber saem daqui.
 */
export const ALLOWED_TYPES = ['pdf', 'mp3', 'jpg', 'png', 'txt', 'chordpro'] as const;
export type DeclaredType = (typeof ALLOWED_TYPES)[number];
export const IMAGE_TYPES: readonly DeclaredType[] = ['jpg', 'png'];

export const CONTENT_TYPES: Record<DeclaredType, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
  chordpro: 'text/plain; charset=utf-8',
};

export function declaredTypeFromName(name: string): DeclaredType | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (!ext) return null;
  if (ext === 'jpeg') return 'jpg';
  return (ALLOWED_TYPES as readonly string[]).includes(ext) ? (ext as DeclaredType) : null;
}

function startsWith(head: Uint8Array, bytes: number[]): boolean {
  return bytes.every((b, i) => head[i] === b);
}

export function looksLikeText(head: Uint8Array): boolean {
  for (const b of head) if (b === 0) return false;
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(head);
    return true;
  } catch {
    return false;
  }
}

/** `null` = assinatura binária desconhecida (exe, zip, office…). */
export function sniffType(head: Uint8Array): DeclaredType | 'text' | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(head, [0x49, 0x44, 0x33])) return 'mp3'; // ID3
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0) return 'mp3'; // frame sync
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // MZ: executável (PE/DOS). "MZ" sozinho também é ASCII válido, mas nunca deve
  // colar como texto — por isso a assinatura é checada antes do fallback.
  if (startsWith(head, [0x4d, 0x5a])) return null;
  return looksLikeText(head) ? 'text' : null;
}

export function headMatchesDeclared(head: Uint8Array, declared: DeclaredType): boolean {
  const sniffed = sniffType(head);
  if (declared === 'txt' || declared === 'chordpro') return sniffed === 'text';
  return sniffed === declared;
}

/** Vai para Content-Disposition e para a tela do admin: nada de caminho nem controle. */
export function safeOriginalName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/\x00-\x1f]/g, '').trim();
  return (cleaned || 'arquivo').slice(0, 200);
}
