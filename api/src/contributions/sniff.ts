/**
 * Assinaturas de arquivo. A extensão do nome é só o que a pessoa declarou; a
 * chave do R2 e o Content-Type que o admin vai receber saem daqui.
 */
export const ALLOWED_TYPES = ['pdf', 'mp3', 'jpg', 'png', 'txt', 'chordpro', 'mscz', 'mxl', 'musicxml'] as const;
export type DeclaredType = (typeof ALLOWED_TYPES)[number];
export const IMAGE_TYPES: readonly DeclaredType[] = ['jpg', 'png'];

export const CONTENT_TYPES: Record<DeclaredType, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  txt: 'text/plain; charset=utf-8',
  chordpro: 'text/plain; charset=utf-8',
  mscz: 'application/vnd.musescore',
  mxl: 'application/vnd.recordare.musicxml',
  musicxml: 'application/vnd.recordare.musicxml+xml',
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
    // `stream: true` tolera uma sequência UTF-8 multibyte cortada bem na borda
    // da janela de sniff — a spec pede "UTF-8 válido nos primeiros 4 KB", e um
    // caractere acentuado que caiu na metade certa não pode reprovar um
    // arquivo que é, de fato, texto válido.
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(head, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/** ZIP é candidato, nunca um formato de partitura validado; isso cabe ao estrutural. */
export function sniffType(head: Uint8Array): DeclaredType | 'text' | 'zip' | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(head, [0x49, 0x44, 0x33])) return 'mp3'; // ID3
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0) return 'mp3'; // frame sync
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  // MZ: executável (PE/DOS). "MZ" sozinho também é ASCII válido, mas nunca deve
  // colar como texto — por isso a assinatura é checada antes do fallback.
  if (startsWith(head, [0x4d, 0x5a])) return null;
  return looksLikeText(head) ? 'text' : null;
}

export function headMatchesDeclared(head: Uint8Array, declared: DeclaredType): boolean {
  const sniffed = sniffType(head);
  if (declared === 'mscz' || declared === 'mxl') return sniffed === 'zip';
  if (declared === 'musicxml') {
    // Isso é triagem; XML completo, root e DTD são conferidos no estrutural.
    return sniffed === 'text' && /^\s*(?:<\?[A-Za-z_:][\w.:-]*(?:[\s?]|$)|<!--|<!DOCTYPE\s+score-(?:partwise|timewise)(?:\s|$)|<(?:[A-Za-z_][\w.-]*:)?score-(?:partwise|timewise)(?:[\s/>]|$))/
      .test(new TextDecoder().decode(head));
  }
  if (declared === 'txt' || declared === 'chordpro') return sniffed === 'text';
  return sniffed === declared;
}

/** Vai para Content-Disposition e para a tela do admin: nada de caminho, aspas nem controle. */
export function safeOriginalName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/\x00-\x1f\x7f"]/g, '').trim();
  return (cleaned || 'arquivo').slice(0, 200);
}
