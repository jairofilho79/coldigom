import { describe, expect, it } from 'vitest';

import { checkStructural } from '../contributions/structural';

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const PDF_LIMPO = enc('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n%%EOF\n');

describe('checkStructural — pdf', () => {
  it('pdf simples é limpo', () => {
    expect(checkStructural(PDF_LIMPO, 'pdf')).toEqual({ status: 'limpa', detectedType: 'pdf', tokens: [] });
  });
  it('tokens perigosos viram suspeita com a lista', () => {
    const v = checkStructural(enc('%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'), 'pdf');
    expect(v.status).toBe('suspeita');
    expect(v.tokens).toEqual(['/JavaScript', '/JS', '/OpenAction']);
  });
  it('/Encrypt é suspeita (não dá para inspecionar)', () => {
    expect(checkStructural(enc('%PDF-1.4\n/Encrypt 5 0 R'), 'pdf').tokens).toEqual(['/Encrypt']);
  });
  it('"pdf" que é HTML: assinatura errada', () => {
    const v = checkStructural(enc('<html><script>'), 'pdf');
    expect(v).toMatchObject({ status: 'suspeita', detectedType: null, reason: 'signature_mismatch' });
  });
});

describe('checkStructural — mp3', () => {
  it('ID3 e frame sync são limpos', () => {
    expect(checkStructural(cat(enc('ID3\x03\x00\x00\x00\x00\x00\x0a'), new Uint8Array(10)), 'mp3').status).toBe('limpa');
    expect(checkStructural(new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0, 0]), 'mp3').status).toBe('limpa');
  });
  it('APIC acima de 2 MB é suspeita', () => {
    // Frame ID3v2.3: 'APIC' + tamanho (4 bytes big-endian) + flags(2)
    const size = 3 * 1024 * 1024;
    const header = enc('ID3\x03\x00\x00\x00\x00\x00\x0a');
    const apic = cat(
      enc('APIC'),
      new Uint8Array([(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff]),
      new Uint8Array(2),
    );
    expect(checkStructural(cat(header, apic), 'mp3')).toMatchObject({ status: 'suspeita', reason: 'apic_too_large' });
  });
});

describe('checkStructural — imagens', () => {
  it('png com IEND é limpo; truncado é suspeita', () => {
    const png = cat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), enc('....IHDR....IEND'), new Uint8Array(4));
    expect(checkStructural(png, 'png').status).toBe('limpa');
    expect(checkStructural(png.slice(0, 12), 'png')).toMatchObject({ status: 'suspeita', reason: 'truncated' });
  });
  it('jpg precisa de FF D9 no fim', () => {
    expect(checkStructural(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]), 'jpg').status).toBe('limpa');
    expect(checkStructural(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]), 'jpg')).toMatchObject({ status: 'suspeita', reason: 'truncated' });
  });
});

describe('checkStructural — texto', () => {
  it('utf-8 válido é limpo; byte nulo e > 256 KB são suspeita', () => {
    expect(checkStructural(enc('{t: Louvor}\n[C]Ainda'), 'chordpro').status).toBe('limpa');
    // byte nulo no meio do conteúdo: nunca é texto válido
    expect(checkStructural(enc('a\x00b'), 'txt').status).toBe('suspeita');
    expect(checkStructural(new Uint8Array(256 * 1024 + 1).fill(0x61), 'txt')).toMatchObject({ status: 'suspeita', reason: 'text_too_large' });
  });
});
