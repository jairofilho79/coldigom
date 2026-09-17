/**
 * VirusTotal API v3 (plano gratuito: 4 req/min, 500/dia, upload ≤ 32 MB).
 * Estratégia: hash primeiro — um PDF que o VT já viu custa um lookup em vez
 * de upload + polling. O contador diário fica no consumer (quota.ts).
 */
const BASE = 'https://www.virustotal.com/api/v3';

export type VtStats = { malicious: number; suspicious: number; harmless: number; undetected: number };
export type VtLookup =
  | { kind: 'known'; stats: VtStats }
  | { kind: 'unknown' }
  | { kind: 'adiado'; reason: 'no_api_key' | 'rate_limited' | 'error' };
export type VtSubmit = { kind: 'submitted'; analysisId: string } | { kind: 'adiado'; reason: 'rate_limited' | 'error' };
export type VtPoll = { kind: 'completed'; stats: VtStats } | { kind: 'queued' } | { kind: 'adiado'; reason: 'rate_limited' | 'error' };

export type VirusTotalClient = {
  lookupHash(sha256: string): Promise<VtLookup>;
  submitFile(bytes: Uint8Array, name: string): Promise<VtSubmit>;
  pollAnalysis(analysisId: string): Promise<VtPoll>;
};

function stats(raw: unknown): VtStats {
  const s = (raw ?? {}) as Partial<VtStats>;
  return { malicious: s.malicious ?? 0, suspicious: s.suspicious ?? 0, harmless: s.harmless ?? 0, undetected: s.undetected ?? 0 };
}

export function verdictFromStats(s: VtStats): 'limpa' | 'suspeita' | 'infectada' {
  if (s.malicious >= 1) return 'infectada';
  if (s.suspicious >= 1) return 'suspeita';
  return 'limpa';
}

export function virusTotalClient(apiKey: string | undefined, fetchFn: typeof fetch = fetch): VirusTotalClient {
  const headers = { 'x-apikey': apiKey ?? '' };
  const adiadoDe = (res: Response): { kind: 'adiado'; reason: 'rate_limited' | 'error' } =>
    ({ kind: 'adiado', reason: res.status === 429 ? 'rate_limited' : 'error' });

  return {
    async lookupHash(sha256) {
      if (!apiKey) return { kind: 'adiado', reason: 'no_api_key' };
      let res: Response;
      try { res = await fetchFn(`${BASE}/files/${sha256}`, { headers }); } catch { return { kind: 'adiado', reason: 'error' }; }
      if (res.status === 404) return { kind: 'unknown' };
      if (!res.ok) return adiadoDe(res);
      let body: { data?: { attributes?: { last_analysis_stats?: unknown } } };
      try {
        // 200 com corpo não-JSON também adia — nunca lança para fora do cliente.
        body = (await res.json()) as { data?: { attributes?: { last_analysis_stats?: unknown } } };
      } catch {
        return { kind: 'adiado', reason: 'error' };
      }
      return { kind: 'known', stats: stats(body.data?.attributes?.last_analysis_stats) };
    },
    async submitFile(bytes, name) {
      if (!apiKey) return { kind: 'adiado', reason: 'error' };
      const form = new FormData();
      form.append('file', new Blob([bytes]), name);
      let res: Response;
      try { res = await fetchFn(`${BASE}/files`, { method: 'POST', headers, body: form }); } catch { return { kind: 'adiado', reason: 'error' }; }
      if (!res.ok) return adiadoDe(res);
      let body: { data?: { id?: string } };
      try {
        body = (await res.json()) as { data?: { id?: string } };
      } catch {
        return { kind: 'adiado', reason: 'error' };
      }
      return body.data?.id ? { kind: 'submitted', analysisId: body.data.id } : { kind: 'adiado', reason: 'error' };
    },
    async pollAnalysis(analysisId) {
      if (!apiKey) return { kind: 'adiado', reason: 'error' };
      let res: Response;
      try { res = await fetchFn(`${BASE}/analyses/${encodeURIComponent(analysisId)}`, { headers }); } catch { return { kind: 'adiado', reason: 'error' }; }
      if (!res.ok) return adiadoDe(res);
      let body: { data?: { attributes?: { status?: string; stats?: unknown } } };
      try {
        body = (await res.json()) as { data?: { attributes?: { status?: string; stats?: unknown } } };
      } catch {
        return { kind: 'adiado', reason: 'error' };
      }
      const attrs = body.data?.attributes;
      if (attrs?.status === 'completed') return { kind: 'completed', stats: stats(attrs.stats) };
      return { kind: 'queued' };
    },
  };
}
