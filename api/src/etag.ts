/** sha256 do texto em UTF-8, 64 hex minúsculos — o ETag e o checksum do manifest PLPCG. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tira o `W/` de um ETag fraco — compressão de borda pode enfraquecer o ETag no caminho. */
function forte(value: string): string {
  const v = value.trim();
  return v.startsWith('W/') ? v.slice(2) : v;
}

/** `If-None-Match` casa com `etag`? Aceita lista separada por vírgula, ETag fraco e `*`. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  const alvo = forte(etag);
  return ifNoneMatch.split(',').some((candidato) => forte(candidato) === alvo);
}
