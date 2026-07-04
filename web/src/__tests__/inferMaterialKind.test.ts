import { describe, expect, it, beforeEach } from 'vitest';
import {
  inferMaterialKind,
  UNKNOWN_MATERIAL_KIND_ID,
  resetAliasIndexCache,
} from '../lib/materialKindInference';

const KIND = {
  sheetMusic: '36fa6e60-37d6-40a4-87e4-aa099839ad25',
  score: 'a19e9baa-596d-4d11-87a4-f0ccecdebca3',
  chordChartI: '27e39659-b4a0-4ef2-87f4-546fe292298d',
  chordChartII: '5a9d9ced-a5e3-4848-adac-f02a14b56038',
  piano: '09d5120b-2dd2-4408-8982-68bee197ce6a',
  altoSax: '6d35011f-b98b-436f-b4f7-92c3cff413c5',
  altoVoice: '8ddc2fed-5298-4ead-bc71-e529921c00ac',
  midiAlto: 'ab76454d-6876-433b-932c-6b4bb88075ac',
  midiSopranoII: '48a0529d-f6c4-455c-b83b-19a99c0285ae',
  audio: '8860ed67-6b33-4e08-9064-adb93a5f5c2a',
} as const;

function catalog(...ids: string[]): Set<string> {
  return new Set([...Object.values(KIND), UNKNOWN_MATERIAL_KIND_ID, ...ids]);
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
});
