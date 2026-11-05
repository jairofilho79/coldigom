import { describe, expect, it, beforeEach } from 'vitest';
import {
  inferMaterialKind,
  UNKNOWN_MATERIAL_KIND_ID,
  resetAliasIndexCache,
} from '../lib/materialKindInference';
import { GENERATED_ALIASES } from '../lib/materialKindInference/aliases.generated';
import { MANUAL_ALIASES } from '../lib/materialKindInference/aliases.manual';

const KIND = {
  sheetMusic: '36fa6e60-37d6-40a4-87e4-aa099839ad25',
  score: 'a19e9baa-596d-4d11-87a4-f0ccecdebca3',
  chordChartI: '27e39659-b4a0-4ef2-87f4-546fe292298d',
  chordChartII: '5a9d9ced-a5e3-4848-adac-f02a14b56038',
  piano: '09d5120b-2dd2-4408-8982-68bee197ce6a',
  altoSax: '6d35011f-b98b-436f-b4f7-92c3cff413c5',
  sopranoSax: 'e1f16ebc-20af-4d12-b95f-80f3608df128',
  altoVoice: '8ddc2fed-5298-4ead-bc71-e529921c00ac',
  sopranoVoice: '3723a55b-a0bb-49b1-be0e-2914915c51af',
  midiAlto: 'ab76454d-6876-433b-932c-6b4bb88075ac',
  midiSopranoII: '48a0529d-f6c4-455c-b83b-19a99c0285ae',
  audio: '8860ed67-6b33-4e08-9064-adb93a5f5c2a',
  trumpet: 'b2d08b24-26b7-4bf6-970d-eb84e29833ea',
  audioStudio: 'd336b4ef-7cee-4b6e-8d7a-cdb15264e70d',
  audioChurch: 'dd947eae-1d84-4f82-9bae-c6bce23f7bf2',
  fluteI: 'e4d3baf3-c5f5-4c87-af45-298217d8a66f',
  fluteII: '3ba482c9-fb5f-4a80-a62b-11d71e5f5be6',
  flutes: 'ac1ee2a5-0dfa-4fb5-999f-e6f2025c0cc2',
  trumpetI: '5989b562-aa89-465c-a869-4dc06efc19fc',
  trumpetII: '8b647c5f-bf5b-40fa-9a2b-aefb8bddd541',
  trumpets: '9a2e9a05-44cf-4d88-b51b-09e6e32cd722',
  tromboneI: '0084abef-6e3e-4003-9882-afab27107713',
  tromboneII: '71f3dd8f-02ae-434a-8e6a-0ba37fc736cc',
  trombones: '1c73024a-872a-44ad-bd63-4536a28a3063',
  clarinetI: 'bf62dc10-4a2e-48d2-8d4f-1f182c8fe6f9',
  clarinetII: '085c34e3-1129-4ef3-8e48-e10d31c9579f',
  clarinets: '9a931e47-fade-4965-891b-790d8d90164a',
  clarinetSibI: 'baa2b993-c37a-4f96-ae5f-8560d2e4b6d8',
  clarinetSibII: 'b5b61ce6-6ad1-41da-9889-eeabed58ffd2',
  clarinetsSib: 'b403be03-b66c-47c7-b28c-c8e248f99df5',
} as const;

function catalog(...ids: string[]): Set<string> {
  return new Set([...Object.values(KIND), UNKNOWN_MATERIAL_KIND_ID, ...ids]);
}

function fullCatalog(): Set<string> {
  return new Set([
    ...Object.keys(GENERATED_ALIASES),
    ...Object.keys(MANUAL_ALIASES),
    UNKNOWN_MATERIAL_KIND_ID,
  ]);
}

function infer(fileName: string, relPath = fileName) {
  return inferMaterialKind({ fileName, relPath, catalogIds: catalog() });
}

describe('inferMaterialKind', () => {
  beforeEach(() => {
    resetAliasIndexCache();
  });

  it('infere Partitura → Sheet Music', () => {
    const r = infer('Partitura.pdf');
    expect(r.materialKindId).toBe(KIND.sheetMusic);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.method).toMatch(/exact|token/);
  });

  it('infere Grade → Score', () => {
    const r = infer('Grade.pdf');
    expect(r.materialKindId).toBe(KIND.score);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('infere Cifra I', () => {
    const r = infer('Cifra I.pdf');
    expect(r.materialKindId).toBe(KIND.chordChartI);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('infere cifra-1 via numeral arábico', () => {
    const r = infer('cifra-1.pdf');
    expect(r.materialKindId).toBe(KIND.chordChartI);
  });

  it('infere Piano a partir da pasta', () => {
    const r = infer('part.pdf', 'Instrumentos/Piano/part.pdf');
    expect(r.materialKindId).toBe(KIND.piano);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('infere sax alto / saxofone alto → Alto Saxophone', () => {
    expect(infer('sax alto.pdf').materialKindId).toBe(KIND.altoSax);
    expect(infer('saxofone alto.pdf').materialKindId).toBe(KIND.altoSax);
  });

  it('prefere saxofone sobre voz quando o nome traz sax + registro', () => {
    const path = 'EM NOSSOS LÁBIOS/Em nossos labios - Sax Soprano.pdf';
    const r = inferMaterialKind({
      fileName: 'Em nossos labios - Sax Soprano.pdf',
      relPath: path,
      catalogIds: fullCatalog(),
    });
    expect(r.materialKindId).toBe(KIND.sopranoSax);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);

    const alto = inferMaterialKind({
      fileName: 'Em nossos labios - Sax Alto.pdf',
      relPath: 'EM NOSSOS LÁBIOS/Em nossos labios - Sax Alto.pdf',
      catalogIds: fullCatalog(),
    });
    expect(alto.materialKindId).toBe(KIND.altoSax);
  });

  it('infere midi_soprano_2 → MIDI Soprano II', () => {
    const r = infer('midi_soprano_2.mid');
    expect(r.materialKindId).toBe(KIND.midiSopranoII);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('infere label de ZIP exportado', () => {
    const uuid = '83f2bc41-ed69-4078-a84a-0d2b102b979f';
    const r = infer(`Partitura-${uuid}.pdf`);
    expect(r.materialKindId).toBe(KIND.sheetMusic);
    expect(r.method).toMatch(/zip-label|exact/);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('infere UUID legado no nome do arquivo', () => {
    const matId = '5631112f-f3d7-4b7f-a53d-3897a4c69c2b';
    const kindId = KIND.chordChartII;
    const r = infer(`${matId}.${kindId}.pdf`);
    expect(r.materialKindId).toBe(kindId);
    expect(r.method).toBe('uuid');
    expect(r.confidence).toBe(1);
  });

  it('infere partiura (typo de partitura) → Sheet Music', () => {
    const r = infer('partiura.pdf');
    expect(r.materialKindId).toBe(KIND.sheetMusic);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('retorna Desconhecido para nomes genéricos', () => {
    expect(infer('documento.pdf').materialKindId).toBe(UNKNOWN_MATERIAL_KIND_ID);
    expect(infer('arquivo.xyz').materialKindId).toBe(UNKNOWN_MATERIAL_KIND_ID);
  });

  it('infere Alto → Voz contralto (match exato de alias curto)', () => {
    const r = infer('Alto.pdf');
    expect(r.materialKindId).toBe(KIND.altoVoice);
    expect(r.confidence).toBeGreaterThanOrEqual(0.72);
  });

  it('ignora kind ausente do catálogo da API', () => {
    const r = inferMaterialKind({
      fileName: 'Partitura.pdf',
      relPath: 'Partitura.pdf',
      catalogIds: new Set([UNKNOWN_MATERIAL_KIND_ID, KIND.score]),
    });
    expect(r.materialKindId).toBe(UNKNOWN_MATERIAL_KIND_ID);
  });

  it('infere Audio em inglês', () => {
    const r = infer('Audio.mp3');
    expect(r.materialKindId).toBe(KIND.audio);
  });

  it('infere divisões de flauta (Flauta I, Flauta 2, Flautas)', () => {
    expect(infer('Flauta I.pdf').materialKindId).toBe(KIND.fluteI);
    expect(infer('Flauta 1.pdf').materialKindId).toBe(KIND.fluteI);
    expect(infer('Flute 2.pdf').materialKindId).toBe(KIND.fluteII);
    expect(infer('Flautas.pdf').materialKindId).toBe(KIND.flutes);
  });

  it('infere divisões de clarinete e clarinete em Si bemol', () => {
    expect(infer('Clarinete 1.pdf').materialKindId).toBe(KIND.clarinetI);
    expect(infer('Clarinete II.pdf').materialKindId).toBe(KIND.clarinetII);
    expect(infer('Clarinetes.pdf').materialKindId).toBe(KIND.clarinets);
    expect(infer('Clarinete Sib 1.pdf').materialKindId).toBe(KIND.clarinetSibI);
    expect(infer('Clarinete em Si bemol 2.pdf').materialKindId).toBe(KIND.clarinetSibII);
    expect(infer('Clarinetes em Si bemol.pdf').materialKindId).toBe(KIND.clarinetsSib);
  });

  it('infere divisões de trompete e trombone', () => {
    expect(infer('Trompete 1.pdf').materialKindId).toBe(KIND.trumpetI);
    expect(infer('Trompete II.pdf').materialKindId).toBe(KIND.trumpetII);
    expect(infer('Trompetes.pdf').materialKindId).toBe(KIND.trumpets);
    expect(infer('Trombone 1.pdf').materialKindId).toBe(KIND.tromboneI);
    expect(infer('Trombone II.pdf').materialKindId).toBe(KIND.tromboneII);
    expect(infer('Trombones.pdf').materialKindId).toBe(KIND.trombones);
  });

  it('infere Áudio Studio e Áudio Igreja', () => {
    expect(infer('Audio Studio.mp3').materialKindId).toBe(KIND.audioStudio);
    expect(infer('Audio Igreja.mp3').materialKindId).toBe(KIND.audioChurch);
  });
});

describe('inferTypeFromExtension', () => {
  it('mapeia extensões conhecidas', async () => {
    const { inferTypeFromExtension } = await import('../lib/materialKindInference');
    expect(inferTypeFromExtension('a.pdf')).toBe('pdf');
    expect(inferTypeFromExtension('a.mp3')).toBe('mp3');
    expect(inferTypeFromExtension('a.mid')).toBe('mid');
    expect(inferTypeFromExtension('a.midi')).toBe('mid');
    expect(inferTypeFromExtension('a.chord')).toBe('chord');
    expect(inferTypeFromExtension('a.xyz')).toBe('xyz');
  });

  it('infere tipo a partir do mimeType quando o arquivo não tem extensão', async () => {
    const { inferTypeFromExtension } = await import('../lib/materialKindInference');
    expect(inferTypeFromExtension('BAIXO - Majestoso és', 'audio/x-m4a')).toBe('m4a');
    expect(inferTypeFromExtension('SOPRANO - Majestoso és', 'audio/mp4')).toBe('m4a');
    expect(inferTypeFromExtension('Partitura Geral', 'application/pdf')).toBe('pdf');
    expect(inferTypeFromExtension('Voz Tenor', 'audio/mpeg')).toBe('mp3');
    expect(inferTypeFromExtension('Áudio Ensaio', 'audio/wav')).toBe('wav');
  });
});
