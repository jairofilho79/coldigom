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
const MAX_TEXT = 256 * 1024;
const MAX_APIC = 2 * 1024 * 1024;

function latin1(bytes: Uint8Array): string {
  // PDF é ASCII/latin-1 na estrutura; decodificar como latin1 nunca lança.
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return s;
}

function pdfTokens(bytes: Uint8Array): string[] {
  const text = latin1(bytes);
  // `/JS` sozinho não pode casar `/JSx`: exige fronteira (não-letra) depois.
  return PDF_TOKENS.filter((t) => new RegExp(t.replace('/', '\\/') + '(?![A-Za-z])').test(text));
}

function endsWith(bytes: Uint8Array, tail: number[]): boolean {
  if (bytes.length < tail.length) return false;
  return tail.every((b, i) => bytes[bytes.length - tail.length + i] === b);
}

function id3ApicTooLarge(bytes: Uint8Array): boolean {
  if (!(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)) return false;
  const text = latin1(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
  let at = text.indexOf('APIC');
  while (at >= 0 && at + 8 <= bytes.length) {
    const size = ((bytes[at + 4] << 24) | (bytes[at + 5] << 16) | (bytes[at + 6] << 8) | bytes[at + 7]) >>> 0;
    if (size > MAX_APIC) return true;
    at = text.indexOf('APIC', at + 4);
  }
  return false;
}

export function checkStructural(bytes: Uint8Array, declared: DeclaredType): StructuralVerdict {
  const head = bytes.subarray(0, 16);
  const sniffed = sniffType(head);
  const detectedType: DeclaredType | null = sniffed === 'text' ? (declared === 'txt' || declared === 'chordpro' ? declared : null) : sniffed;

  const expectText = declared === 'txt' || declared === 'chordpro';
  if ((expectText && sniffed !== 'text') || (!expectText && sniffed !== declared)) {
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
    case 'txt':
    case 'chordpro':
      if (bytes.length > MAX_TEXT) return { status: 'suspeita', detectedType, tokens: [], reason: 'text_too_large' };
      if (!looksLikeText(bytes)) return { status: 'suspeita', detectedType, tokens: [], reason: 'binary_in_text' };
      return { status: 'limpa', detectedType, tokens: [] };
  }
}
