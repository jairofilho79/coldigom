import { describe, expect, it, vi } from 'vitest';

import { verdictFromStats, virusTotalClient } from '../contributions/virustotal';

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

  it('submitFile manda multipart e devolve o analysisId', async () => {
    const { f, calls } = fetchSeq([{ status: 200, body: { data: { type: 'analysis', id: 'an-1' } } }]);
    const out = await virusTotalClient('k', f).submitFile(new Uint8Array([1, 2, 3]), 'x.pdf');
    expect(out).toEqual({ kind: 'submitted', analysisId: 'an-1' });
    expect(calls[0][0]).toBe('https://www.virustotal.com/api/v3/files');
    expect(calls[0][1]!.method).toBe('POST');
    expect(calls[0][1]!.body).toBeInstanceOf(FormData);
  });

  it('pollAnalysis: queued, completed, erro', async () => {
    const c = virusTotalClient('k', fetchSeq([{ status: 200, body: { data: { attributes: { status: 'queued' } } } }]).f);
    expect(await c.pollAnalysis('an-1')).toEqual({ kind: 'queued' });
    const done = virusTotalClient('k', fetchSeq([{ status: 200, body: { data: { attributes: { status: 'completed', stats: STATS } } } }]).f);
    expect(await done.pollAnalysis('an-1')).toEqual({ kind: 'completed', stats: STATS });
    const boom = vi.fn(async () => { throw new TypeError('x'); }) as unknown as typeof fetch;
    expect(await virusTotalClient('k', boom).pollAnalysis('an-1')).toEqual({ kind: 'adiado', reason: 'error' });
  });
});

describe('verdictFromStats', () => {
  it('malicious ≥ 1 infectada; só suspicious suspeita; senão limpa', () => {
    expect(verdictFromStats({ ...STATS, malicious: 1 })).toBe('infectada');
    expect(verdictFromStats({ ...STATS, suspicious: 2 })).toBe('suspeita');
    expect(verdictFromStats(STATS)).toBe('limpa');
  });
});
