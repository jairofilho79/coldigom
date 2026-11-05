import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';

import { CONTENT_TYPES, declaredTypeFromName, headMatchesDeclared, safeOriginalName, sniffType } from '../contributions/sniff';

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

  it('tolera janela cortada bem no meio de um caractere UTF-8 multibyte', () => {
    // 'ã' é 2 bytes (0xC3 0xA3); cortar logo após o primeiro byte deixa uma
    // sequência incompleta na borda — decode(..., {stream:true}) não deve lançar.
    const completo = enc('Louvação');
    const idx = completo.indexOf(0xc3);
    const cortado = completo.subarray(0, idx + 1);
    expect(sniffType(cortado)).toBe('text');
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
  it('tira aspas e DEL (0x7f)', () => {
    expect(safeOriginalName('a"bc.pdf')).toBe('abc.pdf');
    expect(safeOriginalName('a\x7fbc.pdf')).toBe('abc.pdf');
  });
});

describe('sniff — partituras editáveis', () => {
  const musicxml = enc('<?xml version="1.0"?><score-partwise version="4.0"><part-list/></score-partwise>');
  const mscz = zipSync({
    'META-INF/container.xml': enc('<container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>'),
    'score.mscx': enc('<museScore version="4.0"><Score/></museScore>'),
  });

  it('aceita somente as três extensões explícitas, sem alias xml/mscx/zip', () => {
    for (const type of ['mscz', 'mxl', 'musicxml'] as const) {
      expect(declaredTypeFromName(`partitura.${type.toUpperCase()}`)).toBe(type);
    }
    for (const ext of ['xml', 'mscx', 'zip', 'musicxml.exe']) {
      expect(declaredTypeFromName(`partitura.${ext}`)).toBeNull();
    }
    expect(CONTENT_TYPES).toMatchObject({
      mscz: 'application/vnd.musescore',
      mxl: 'application/vnd.recordare.musicxml',
      musicxml: 'application/vnd.recordare.musicxml+xml',
    });
  });

  it('ZIP é só candidato: não inventa mscz/mxl pela assinatura PK', () => {
    expect(sniffType(mscz.subarray(0, 16))).toBe('zip');
    expect(headMatchesDeclared(mscz.subarray(0, 16), 'mscz')).toBe(true);
    expect(headMatchesDeclared(mscz.subarray(0, 16), 'mxl')).toBe(true);
    expect(headMatchesDeclared(enc('PK'), 'mscz')).toBe(false);
    expect(headMatchesDeclared(enc('PK\x05\x06'), 'mxl')).toBe(false);
    expect(headMatchesDeclared(musicxml, 'mscz')).toBe(false);
    expect(headMatchesDeclared(mscz, 'musicxml')).toBe(false);
    expect(headMatchesDeclared(mscz, 'pdf')).toBe(false);
  });

  it('MusicXML preserva o sniff de texto e admite prólogo na janela de 16 bytes', () => {
    expect(sniffType(musicxml)).toBe('text');
    expect(headMatchesDeclared(musicxml.subarray(0, 16), 'musicxml')).toBe(true);
    expect(headMatchesDeclared(enc('\ufeff<score-timewise version="4.0"/>'), 'musicxml')).toBe(true);
    expect(headMatchesDeclared(enc('<score-partwise'), 'musicxml')).toBe(true);
    expect(headMatchesDeclared(enc('<!-- exportado pelo editor -->'), 'musicxml')).toBe(true);
    expect(headMatchesDeclared(enc('<html/>'), 'musicxml')).toBe(false);
    expect(headMatchesDeclared(enc('<museScore/>'), 'musicxml')).toBe(false);
    expect(headMatchesDeclared(enc('<score-partwise-fake/>'), 'musicxml')).toBe(false);
    expect(headMatchesDeclared(enc('texto qualquer'), 'musicxml')).toBe(false);
    expect(headMatchesDeclared(musicxml, 'txt')).toBe(true);
    expect(headMatchesDeclared(musicxml, 'chordpro')).toBe(true);
  });
});
