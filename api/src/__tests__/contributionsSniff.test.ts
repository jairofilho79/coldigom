import { describe, expect, it } from 'vitest';

import { declaredTypeFromName, headMatchesDeclared, safeOriginalName, sniffType } from '../contributions/sniff';

const enc = (s: string) => new TextEncoder().encode(s);

describe('declaredTypeFromName', () => {
  it('mapeia extensões permitidas e normaliza jpeg', () => {
    expect(declaredTypeFromName('a.PDF')).toBe('pdf');
    expect(declaredTypeFromName('foto.jpeg')).toBe('jpg');
    expect(declaredTypeFromName('cifra.chordpro')).toBe('chordpro');
    expect(declaredTypeFromName('x.exe')).toBeNull();
    expect(declaredTypeFromName('semext')).toBeNull();
  });
});

describe('sniffType', () => {
  it('reconhece as assinaturas', () => {
    expect(sniffType(enc('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffType(enc('ID3\x03\x00'))).toBe('mp3');
    expect(sniffType(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBe('mp3');
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(sniffType(enc('{title: Ainda há tempo}\n'))).toBe('text');
    expect(sniffType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // MZ (exe)
    expect(sniffType(enc('<html>'))).toBe('text');
  });
});

describe('headMatchesDeclared', () => {
  it('txt/chordpro aceitam texto; binários exigem a própria assinatura', () => {
    expect(headMatchesDeclared(enc('%PDF-1.4'), 'pdf')).toBe(true);
    expect(headMatchesDeclared(enc('<html>'), 'pdf')).toBe(false);
    expect(headMatchesDeclared(enc('{t: x}'), 'chordpro')).toBe(true);
    expect(headMatchesDeclared(new Uint8Array([0x4d, 0x5a]), 'txt')).toBe(false);
    // byte nulo não é "texto" para efeitos de assinatura, mesmo declarando txt/chordpro
    expect(headMatchesDeclared(enc('a\x00b'), 'txt')).toBe(false);
  });
});

describe('safeOriginalName', () => {
  it('tira separadores e controle, limita a 200', () => {
    expect(safeOriginalName('../x/\\y\x07.pdf')).toBe('..xy.pdf');
    expect(safeOriginalName('a'.repeat(300) + '.pdf').length).toBe(200);
    expect(safeOriginalName('   ')).toBe('arquivo');
  });
});
