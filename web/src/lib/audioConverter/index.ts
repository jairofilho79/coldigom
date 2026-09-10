import { Mp3Encoder } from '@breezystack/lamejs';

export const CONVERTIBLE_AUDIO_EXTENSIONS = new Set(['m4a', 'wav', 'aac', 'ogg', 'flac', 'wma']);

/** Verifica se o nome ou extensão corresponde a um áudio conversível para MP3. */
export function isConvertibleAudio(fileNameOrExt: string): boolean {
  const ext = fileNameOrExt.split('.').pop()?.toLowerCase() || fileNameOrExt.toLowerCase();
  return CONVERTIBLE_AUDIO_EXTENSIONS.has(ext);
}

/** Converte Float32 [-1..1] para Int16 [-32768..32767] para o encoder LAME. */
export function float32ToInt16(f32: Float32Array): Int16Array {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return i16;
}

export interface PcmAudioData {
  channels: number;
  sampleRate: number;
  left: Float32Array;
  right?: Float32Array;
}

/** Codifica amostras PCM brutas em MP3 usando o encoder LAME. */
export function encodePcmToMp3(
  pcm: PcmAudioData,
  options?: { kbps?: number; onProgress?: (pct: number) => void }
): Uint8Array {
  const kbps = options?.kbps ?? 128;
  const channels = Math.min(Math.max(pcm.channels, 1), 2);
  const sampleRate = pcm.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const leftI16 = float32ToInt16(pcm.left);
  const rightI16 = channels === 2 && pcm.right ? float32ToInt16(pcm.right) : undefined;

  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  const totalSamples = leftI16.length;

  for (let i = 0; i < totalSamples; i += blockSize) {
    const leftChunk = leftI16.subarray(i, i + blockSize);
    const rightChunk = rightI16 ? rightI16.subarray(i, i + blockSize) : undefined;
    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf && mp3buf.length > 0) {
      chunks.push(new Uint8Array(mp3buf));
    }
    if (options?.onProgress) {
      options.onProgress(Math.min(100, Math.round((i / totalSamples) * 100)));
    }
  }

  const end = encoder.flush();
  if (end && end.length > 0) {
    chunks.push(new Uint8Array(end));
  }
  if (options?.onProgress) {
    options.onProgress(100);
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Decodifica um Blob/File de áudio nativamente usando a Web Audio API. */
export async function decodeAudioBlob(blob: Blob): Promise<PcmAudioData> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      : null;
  if (!AudioCtx) {
    throw new Error('Web Audio API (AudioContext) não é suportada neste ambiente.');
  }

  const ctx = new AudioCtx();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const left = audioBuffer.getChannelData(0);
    const right = channels > 1 ? audioBuffer.getChannelData(1) : undefined;
    return { channels, sampleRate, left, right };
  } finally {
    if (typeof ctx.close === 'function') {
      void ctx.close().catch(() => {});
    }
  }
}

/**
 * Converte qualquer arquivo/Blob de áudio suportado pelo navegador (m4a, wav, aac, etc.) para um File MP3.
 */
export async function convertAudioToMp3(
  fileOrBlob: Blob,
  options?: {
    filename?: string;
    kbps?: number;
    onProgress?: (pct: number) => void;
  }
): Promise<File> {
  const pcm = await decodeAudioBlob(fileOrBlob);
  const mp3Bytes = encodePcmToMp3(pcm, {
    kbps: options?.kbps ?? 128,
    onProgress: options?.onProgress,
  });

  const origName =
    options?.filename || (fileOrBlob instanceof File ? fileOrBlob.name : 'audio.m4a');
  const mp3Name = origName.replace(/\.[^.]+$/, '') + '.mp3';

  const arrayBuffer = mp3Bytes.buffer.slice(
    mp3Bytes.byteOffset,
    mp3Bytes.byteOffset + mp3Bytes.byteLength
  ) as ArrayBuffer;

  return new File([arrayBuffer], mp3Name, { type: 'audio/mpeg' });
}
