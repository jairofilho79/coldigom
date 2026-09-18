import { describe, expect, it, vi } from 'vitest';

import { hasVerdict, verdictFromStats, virusTotalClient } from '../contributions/virustotal';

type Call = [string, RequestInit | undefined];
function fetchSeq(responses: { status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  let i = 0;
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const STATS = { malicious: 0, suspicious: 0, harmless: 60, undetected: 10 };

// 200 com corpo que não é JSON válido — simula proxy/erro que engana o status.
function fetchNotJson() {
  return vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
}

describe('virusTotalClient', () => {
  it('sem chave → adiado no_api_key sem rede', async () => {
    const { f, calls } = fetchSeq([{ status: 200 }]);
    expect(await virusTotalClient(undefined, f).lookupHash('ab')).toEqual({ kind: 'adiado', reason: 'no_api_key' });
    expect(calls.length).toBe(0);
  });

  it('lookupHash: 200 devolve stats; 404 é unknown; 429 é adiado', async () => {
    const known = fetchSeq([{ status: 200, body: { data: { attributes: { last_analysis_stats: STATS } } } }]);
    expect(await virusTotalClient('k', known.f).lookupHash('abc')).toEqual({ kind: 'known', stats: STATS });
    expect(known.calls[0][0]).toBe('https://www.virustotal.com/api/v3/files/abc');
    expect((known.calls[0][1]!.headers as Record<string, string>)['x-apikey']).toBe('k');
    expect(await virusTotalClient('k', fetchSeq([{ status: 404 }]).f).lookupHash('abc')).toEqual({ kind: 'unknown' });
    expect(await virusTotalClient('k', fetchSeq([{ status: 429 }]).f).lookupHash('abc')).toEqual({ kind: 'adiado', reason: 'rate_limited' });
  });

  it('lookupHash: 200 com corpo não-JSON → adiado error, não lança', async () => {
    expect(await virusTotalClient('k', fetchNotJson()).lookupHash('abc')).toEqual({ kind: 'adiado', reason: 'error' });
  });

  it('lookupHash: 200 com stats zeradas (visto mas nunca analisado) → unknown', async () => {
    const zero = { malicious: 0, suspicious: 0, harmless: 0, undetected: 0 };
    const { f } = fetchSeq([{ status: 200, body: { data: { attributes: { last_analysis_stats: zero } } } }]);
    expect(await virusTotalClient('k', f).lookupHash('abc')).toEqual({ kind: 'unknown' });
  });

  it('submitFile manda multipart e devolve o analysisId', async () => {
    const { f, calls } = fetchSeq([{ status: 200, body: { data: { type: 'analysis', id: 'an-1' } } }]);
    const out = await virusTotalClient('k', f).submitFile(new Uint8Array([1, 2, 3]), 'x.pdf');
    expect(out).toEqual({ kind: 'submitted', analysisId: 'an-1' });
    expect(calls[0][0]).toBe('https://www.virustotal.com/api/v3/files');
    expect(calls[0][1]!.method).toBe('POST');
    expect(calls[0][1]!.body).toBeInstanceOf(FormData);
  });

  it('submitFile aceita um Blob direto (objeto do R2) sem reembrulhar', async () => {
    const { f, calls } = fetchSeq([{ status: 200, body: { data: { type: 'analysis', id: 'an-2' } } }]);
    const blob = new Blob([new Uint8Array([9, 9])]);
    const out = await virusTotalClient('k', f).submitFile(blob, 'x.pdf');
    expect(out).toEqual({ kind: 'submitted', analysisId: 'an-2' });
    const form = calls[0][1]!.body as FormData;
    const sent = form.get('file') as Blob;
    expect(sent.size).toBe(blob.size);
  });

  it('submitFile: 200 com corpo não-JSON → adiado error, não lança', async () => {
    expect(await virusTotalClient('k', fetchNotJson()).submitFile(new Uint8Array([1]), 'x.pdf')).toEqual({ kind: 'adiado', reason: 'error' });
  });

  it('pollAnalysis: queued, completed, erro', async () => {
    const c = virusTotalClient('k', fetchSeq([{ status: 200, body: { data: { attributes: { status: 'queued' } } } }]).f);
    expect(await c.pollAnalysis('an-1')).toEqual({ kind: 'queued' });
    const done = virusTotalClient('k', fetchSeq([{ status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }]).f);
    expect(await done.pollAnalysis('an-1')).toEqual({ kind: 'completed', stats: STATS });
    const boom = vi.fn(async () => { throw new TypeError('x'); }) as unknown as typeof fetch;
    expect(await virusTotalClient('k', boom).pollAnalysis('an-1')).toEqual({ kind: 'adiado', reason: 'error' });
  });

  it('pollAnalysis: 200 com corpo não-JSON → adiado error, não lança', async () => {
    expect(await virusTotalClient('k', fetchNotJson()).pollAnalysis('an-1')).toEqual({ kind: 'adiado', reason: 'error' });
  });

  it('pollAnalysis: completed com stats zeradas → adiado error, não limpa por omissão', async () => {
    const zero = { malicious: 0, suspicious: 0, harmless: 0, undetected: 0 };
    const c = virusTotalClient('k', fetchSeq([{ status: 200, body: { data: { attributes: { status: 'completed', stats: zero } } } }]).f);
    expect(await c.pollAnalysis('an-1')).toEqual({ kind: 'adiado', reason: 'error' });
  });
});

describe('hasVerdict', () => {
  it('true com qualquer contagem > 0; false com as quatro zeradas', () => {
    expect(hasVerdict({ malicious: 0, suspicious: 0, harmless: 0, undetected: 0 })).toBe(false);
    expect(hasVerdict({ ...STATS })).toBe(true);
  });
});

describe('verdictFromStats', () => {
  it('malicious ≥ 1 infectada; só suspicious suspeita; senão limpa', () => {
    expect(verdictFromStats({ ...STATS, malicious: 1 })).toBe('infectada');
    expect(verdictFromStats({ ...STATS, suspicious: 2 })).toBe('suspeita');
    expect(verdictFromStats(STATS)).toBe('limpa');
  });
});
