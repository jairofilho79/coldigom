import { looksLikeText, sniffType, type DeclaredType } from './sniff';

export type StructuralVerdict = {
  status: 'limpa' | 'suspeita';
  detectedType: DeclaredType | null;
  tokens: string[];
  reason?: string;
};

/**
 * Tokens que uma partitura nunca precisa. `/Encrypt` entra porque um PDF
 * cifrado não dá para inspecionar. Limitação: objetos dentro de `/ObjStm`
 * comprimido não aparecem aqui — o VirusTotal cobre.
 */
const PDF_TOKENS = ['/JavaScript', '/JS', '/Launch', '/OpenAction', '/AA', '/EmbeddedFile', '/RichMedia', '/XFA', '/Encrypt'];
const PDF_TOKEN_BYTES = PDF_TOKENS.map((t) => new TextEncoder().encode(t));
const MAX_TEXT = 256 * 1024;
const MAX_APIC = 2 * 1024 * 1024;

function latin1(bytes: Uint8Array): string {
  // Só para janelas pequenas (cabeçalho ID3 ≤ 64 KiB, cauda de PNG): nunca sobre
  // o arquivo inteiro, que pode ter até ~32 MiB e estouraria memória do Worker.
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  }
  return s;
}

function isAsciiLetter(b: number | undefined): boolean {
  return b !== undefined && ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a));
}

/** Busca ingênua de bytes (os tokens têm no máximo ~14 bytes; o arquivo, poucas dezenas de MB). */
function bytesIndexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  const limit = hay.length - needle.length;
  outer: for (let i = Math.max(from, 0); i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Varre o `Uint8Array` inteiro sem nunca materializar uma string do arquivo
 * inteiro (um PDF de ~32 MiB viraria ~64 MB de UTF-16 — caro demais para o
 * isolate de 128 MB do Worker).
 */
function pdfTokens(bytes: Uint8Array): string[] {
  const hits: string[] = [];
  for (let i = 0; i < PDF_TOKENS.length; i++) {
    const needle = PDF_TOKEN_BYTES[i];
    let at = bytesIndexOf(bytes, needle, 0);
    let hit = false;
    while (at >= 0 && !hit) {
      // `/JS` sozinho não pode casar `/JSx`: exige fronteira (não-letra) depois.
      if (!isAsciiLetter(bytes[at + needle.length])) hit = true;
      else at = bytesIndexOf(bytes, needle, at + 1);
    }
    if (hit) hits.push(PDF_TOKENS[i]);
  }
  return hits;
}

function endsWith(bytes: Uint8Array, tail: number[]): boolean {
  if (bytes.length < tail.length) return false;
  return tail.every((b, i) => bytes[bytes.length - tail.length + i] === b);
}

/** ID3v2.4 usa tamanho "syncsafe" (7 bits úteis por byte); v2.3 e anteriores usam 32 bits normais. */
function id3FrameSize(b0: number, b1: number, b2: number, b3: number, majorVersion: number): number {
  if (majorVersion >= 4) {
    return (((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f)) >>> 0;
  }
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function id3ApicTooLarge(bytes: Uint8Array): boolean {
  if (!(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) return false;
  const majorVersion = bytes[3];
  const text = latin1(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
  let at = text.indexOf('APIC');
  while (at >= 0 && at + 8 <= bytes.length) {
    const size = id3FrameSize(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7], majorVersion);
    if (size > MAX_APIC) return true;
    at = text.indexOf('APIC', at + 4);
  }
  return false;
}

export function checkStructural(bytes: Uint8Array, declared: DeclaredType): StructuralVerdict {
  if (declared === 'txt' || declared === 'chordpro') {
    // Texto não tem assinatura binária de cabeçalho para conferir contra os 16
    // primeiros bytes — a checagem real é sobre o buffer inteiro (tamanho e UTF-8).
    if (bytes.length > MAX_TEXT) return { status: 'suspeita', detectedType: declared, tokens: [], reason: 'text_too_large' };
    if (!looksLikeText(bytes)) return { status: 'suspeita', detectedType: null, tokens: [], reason: 'binary_in_text' };
    return { status: 'limpa', detectedType: declared, tokens: [] };
  }

  const head = bytes.subarray(0, 16);
  const sniffed = sniffType(head);
  const detectedType: DeclaredType | null = sniffed === 'text' ? null : sniffed;
  if (sniffed !== declared) {
    return { status: 'suspeita', detectedType, tokens: [], reason: 'signature_mismatch' };
  }

  switch (declared) {
    case 'pdf': {
      const tokens = pdfTokens(bytes);
      return tokens.length ? { status: 'suspeita', detectedType, tokens } : { status: 'limpa', detectedType, tokens: [] };
    }
    case 'mp3':
      if (id3ApicTooLarge(bytes)) return { status: 'suspeita', detectedType, tokens: [], reason: 'apic_too_large' };
      return { status: 'limpa', detectedType, tokens: [] };
    case 'png': {
      const hasIend = latin1(bytes.subarray(Math.max(0, bytes.length - 16))).includes('IEND');
      return hasIend ? { status: 'limpa', detectedType, tokens: [] } : { status: 'suspeita', detectedType, tokens: [], reason: 'truncated' };
    }
    case 'jpg':
      return endsWith(bytes, [0xff, 0xd9]) ? { status: 'limpa', detectedType, tokens: [] } : { status: 'suspeita', detectedType, tokens: [], reason: 'truncated' };
  }
}
