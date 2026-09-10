import { describe, it, expect, vi } from 'vitest';
import {
  isConvertibleAudio,
  float32ToInt16,
  encodePcmToMp3,
  convertAudioToMp3,
} from '../lib/audioConverter';

describe('audioConverter', () => {
  describe('isConvertibleAudio', () => {
    it('reconhece extensões de áudio que não são MP3 como conversíveis', () => {
      expect(isConvertibleAudio('soprano.m4a')).toBe(true);
      expect(isConvertibleAudio('AUDIO.WAV')).toBe(true);
      expect(isConvertibleAudio('voz.aac')).toBe(true);
      expect(isConvertibleAudio('baixo.ogg')).toBe(true);
      expect(isConvertibleAudio('m4a')).toBe(true);
    });

    it('rejeita MP3 e formatos que não são áudio conversível', () => {
      expect(isConvertibleAudio('soprano.mp3')).toBe(false);
      expect(isConvertibleAudio('partitura.pdf')).toBe(false);
      expect(isConvertibleAudio('cifra.chord')).toBe(false);
      expect(isConvertibleAudio('mid')).toBe(false);
    });
  });

  describe('float32ToInt16', () => {
    it('converte e limita amostras no intervalo de 16-bit com sinal', () => {
      const f32 = new Float32Array([-1.5, -1.0, 0, 0.5, 1.0, 1.5]);
      const i16 = float32ToInt16(f32);
      expect(i16[0]).toBe(-32768);
      expect(i16[1]).toBe(-32768);
      expect(i16[2]).toBe(0);
      expect(i16[3]).toBe(Math.floor(0.5 * 32767));
      expect(i16[4]).toBe(32767);
      expect(i16[5]).toBe(32767);
    });
  });

  describe('encodePcmToMp3', () => {
    it('codifica dados PCM mono em um buffer MP3 válido', () => {
      const sampleRate = 44100;
      const length = sampleRate; // 1 segundo
      const left = new Float32Array(length);
      // Gera onda senoidal simples de 440 Hz
      for (let i = 0; i < length; i++) {
        left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
      }

      let progressReports = 0;
      const mp3 = encodePcmToMp3(
        { channels: 1, sampleRate, left },
        {
          kbps: 128,
          onProgress: () => {
            progressReports++;
          },
        }
      );

      expect(mp3).toBeInstanceOf(Uint8Array);
      expect(mp3.length).toBeGreaterThan(0);
      expect(progressReports).toBeGreaterThan(0);
      // Primeiro byte de cabeçalho do frame MPEG costuma ser 0xFF
      expect(mp3[0]).toBe(0xff);
    });

    it('codifica dados PCM estéreo', () => {
      const sampleRate = 44100;
      const length = sampleRate / 2; // 0.5 segundo
      const left = new Float32Array(length);
      const right = new Float32Array(length);

      const mp3 = encodePcmToMp3(
        { channels: 2, sampleRate, left, right },
        { kbps: 192 }
      );

      expect(mp3).toBeInstanceOf(Uint8Array);
      expect(mp3.length).toBeGreaterThan(0);
      expect(mp3[0]).toBe(0xff);
    });
  });

  describe('convertAudioToMp3 com AudioContext simulado', () => {
    it('decodifica e converte um arquivo para File MP3', async () => {
      const sampleRate = 44100;
      const fakeLeft = new Float32Array(1152);
      const fakeAudioBuffer = {
        numberOfChannels: 1,
        sampleRate,
        getChannelData: vi.fn().mockReturnValue(fakeLeft),
      };

      const mockCtx = {
        decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer),
        close: vi.fn().mockResolvedValue(undefined),
      };

      class MockAudioContext {
        decodeAudioData = mockCtx.decodeAudioData;
        close = mockCtx.close;
      }

      vi.stubGlobal('AudioContext', MockAudioContext);

      const fakeFile = new File(['fake-m4a-data'], 'soprano.m4a', { type: 'audio/x-m4a' });
      const mp3File = await convertAudioToMp3(fakeFile);

      expect(mp3File).toBeInstanceOf(File);
      expect(mp3File.name).toBe('soprano.mp3');
      expect(mp3File.type).toBe('audio/mpeg');
      expect(mp3File.size).toBeGreaterThan(0);

      vi.unstubAllGlobals();
    });
  });
});
