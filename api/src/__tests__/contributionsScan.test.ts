import { describe, expect, it, vi } from 'vitest';

import { scanContribution, type ScanDeps } from '../contributions/scan';
import type { LinkChecker } from '../contributions/links';
import type { VirusTotalClient } from '../contributions/virustotal';

type Row = Record<string, unknown>;
const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.4\n%%EOF');
const PDF_JS = enc('%PDF-1.4\n/OpenAction /JavaScript');

/** D1 falso com estado: guarda contributions/contribution_files/quota em mapas e aplica UPDATE por regex. */
function statefulDb(contrib: Row, files: Row[]) {
  const contribs = new Map<string, Row>([[contrib.id as string, { ...contrib }]]);
  const fileRows = new Map<string, Row>(files.map((f) => [f.id as string, { ...f }]));
  const quota = new Map<string, { count: number; bytes: number }>();
  const exec = (sql: string, b: unknown[]) => {
    const s = sql.replace(/\s+/g, ' ');
    if (/^SELECT .* FROM contributions WHERE id = \?/.test(s)) return [contribs.get(b[0] as string) ?? null];
    if (/FROM contribution_files WHERE contribution_id = \?/.test(s)) return Array.from(fileRows.values()).filter((f) => f.contribution_id === b[0]);
    if (/FROM contribution_files WHERE sha256 = \? AND scan_status = 'limpa'/.test(s)) return Array.from(fileRows.values()).filter((f) => f.sha256 === b[0] && f.scan_status === 'limpa' && f.id !== b[1]);
    if (/FROM contribution_quota/.test(s)) return [quota.get(`${b[0]}|${b[1]}`) ?? null];
    if (/^INSERT INTO contribution_quota/.test(s)) { const k = `${b[0]}|${b[1]}`; const q = quota.get(k) ?? { count: 0, bytes: 0 }; quota.set(k, { count: q.count + (b[2] as number), bytes: q.bytes + (b[3] as number) }); return []; }
    if (/^UPDATE contribution_files SET/.test(s)) { const id = b[b.length - 1] as string; const cols = [...s.matchAll(/(\w+) = \?/g)].map((m) => m[1]); const row = fileRows.get(id)!; cols.forEach((c, i) => { row[c] = b[i]; }); return []; }
    if (/^UPDATE contributions SET/.test(s)) { const id = b[b.length - 1] as string; const cols = [...s.matchAll(/(\w+) = \?/g)].map((m) => m[1]); const row = contribs.get(id)!; cols.forEach((c, i) => { row[c] = b[i]; }); return []; }
    throw new Error(`SQL não suportado no fake: ${s}`);
  };
  const db = {
    prepare: (sql: string) => ({
      bind: (...b: unknown[]) => ({
        first: async () => exec(sql, b)[0] ?? null,
        all: async () => ({ results: exec(sql, b) }),
        run: async () => { exec(sql, b); return { meta: { changes: 1 } }; },
      }),
    }),
    batch: async (stmts: { run: () => Promise<unknown> }[]) => { for (const st of stmts) await st.run(); return []; },
  } as unknown as D1Database;
  return { db, contribs, fileRows, quota };
}

function r2With(objs: Record<string, Uint8Array>) {
  const store = new Map(Object.entries(objs));
  return {
    store,
    get: vi.fn(async (k: string) => (store.has(k) ? { arrayBuffer: async () => store.get(k)!.buffer.slice(0) } : null)),
    put: vi.fn(async (k: string, body: ArrayBuffer | Uint8Array) => { store.set(k, body instanceof Uint8Array ? body : new Uint8Array(body)); }),
    delete: vi.fn(async (k: string) => { store.delete(k); }),
  } as unknown as R2Bucket & { store: Map<string, Uint8Array> };
}

const vtClean: VirusTotalClient = {
  lookupHash: async () => ({ kind: 'known', stats: { malicious: 0, suspicious: 0, harmless: 5, undetected: 1 } }),
  submitFile: async () => ({ kind: 'submitted', analysisId: 'an-1' }),
  pollAnalysis: async () => ({ kind: 'completed', stats: { malicious: 0, suspicious: 0, harmless: 5, undetected: 1 } }),
};
const linksClean: LinkChecker = async (urls) => Object.fromEntries(urls.map((u) => [u, 'clean' as const]));

const CONTRIB = { id: 'c1', status: 'recebida', scan_status: 'pendente', links: '[]', created_at: '2026-09-17 10:00:00', scan_report: null };
const FILE = { id: 'f1', contribution_id: 'c1', declared_type: 'pdf', sha256: 'h1', r2_key: 'quarantine/c1/f1.pdf', scan_status: 'pendente', scan_detail: null, detected_type: null };
const NOW = () => new Date('2026-09-17T11:00:00Z');

function deps(db: D1Database, r2: R2Bucket, over: Partial<ScanDeps> = {}): ScanDeps {
  return { db, r2, vt: vtClean, links: linksClean, now: NOW, ...over };
}

describe('scanContribution', () => {
  it('pdf limpo + VT conhecido: move para contributions/, pendente/limpa', async () => {
    const { db, contribs, fileRows } = statefulDb(CONTRIB, [FILE]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF });
    const out = await scanContribution(deps(db, r2), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'done', status: 'pendente' });
    expect(contribs.get('c1')).toMatchObject({ status: 'pendente', scan_status: 'limpa' });
    expect(fileRows.get('f1')).toMatchObject({ scan_status: 'limpa', detected_type: 'pdf', r2_key: 'contributions/c1/f1.pdf' });
    expect(r2.store.has('contributions/c1/f1.pdf')).toBe(true);
    expect(r2.store.has('quarantine/c1/f1.pdf')).toBe(false);
  });

  it('token perigoso: bloqueada/suspeita, fica em quarentena, VT nem é chamado', async () => {
    const { db, contribs, fileRows } = statefulDb(CONTRIB, [FILE]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF_JS });
    const lookup = vi.fn(vtClean.lookupHash);
    const out = await scanContribution(deps(db, r2, { vt: { ...vtClean, lookupHash: lookup } }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'done', status: 'bloqueada' });
    expect(contribs.get('c1')).toMatchObject({ status: 'bloqueada', scan_status: 'suspeita' });
    expect(JSON.parse(fileRows.get('f1')!.scan_detail as string).structural.tokens).toEqual(['/JavaScript', '/OpenAction']);
    expect(r2.store.has('quarantine/c1/f1.pdf')).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('dedupe: hash já limpo noutro arquivo pula o VT', async () => {
    const { db, fileRows } = statefulDb(CONTRIB, [FILE, { ...FILE, id: 'f0', contribution_id: 'c0', scan_status: 'limpa', detected_type: 'pdf', r2_key: 'contributions/c0/f0.pdf', scan_detail: '{"virustotal":{"sha256":"h1"}}' }]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF });
    const lookup = vi.fn(vtClean.lookupHash);
    await scanContribution(deps(db, r2, { vt: { ...vtClean, lookupHash: lookup } }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(lookup).not.toHaveBeenCalled();
    expect(fileRows.get('f1')).toMatchObject({ scan_status: 'limpa' });
  });

  it('VT desconhece o hash: envia, grava analysisId e pede retry de 60 s em poll', async () => {
    const { db, fileRows } = statefulDb(CONTRIB, [FILE]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF });
    const vt = { ...vtClean, lookupHash: async () => ({ kind: 'unknown' as const }) };
    const out = await scanContribution(deps(db, r2, { vt }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'retry', delaySeconds: 60, message: { contributionId: 'c1', phase: 'poll', attempt: 1 } });
    expect(JSON.parse(fileRows.get('f1')!.scan_detail as string).virustotal.analysisId).toBe('an-1');
  });

  it('poll completed malicioso → bloqueada/infectada', async () => {
    const { db, contribs } = statefulDb({ ...CONTRIB, scan_status: 'adiado' }, [{ ...FILE, scan_detail: '{"structural":{"ok":true},"virustotal":{"analysisId":"an-1"}}' }]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF });
    const vt = { ...vtClean, pollAnalysis: async () => ({ kind: 'completed' as const, stats: { malicious: 3, suspicious: 0, harmless: 1, undetected: 0 } }) };
    const out = await scanContribution(deps(db, r2, { vt }), { contributionId: 'c1', phase: 'poll', attempt: 1 });
    expect(out).toEqual({ kind: 'done', status: 'bloqueada' });
    expect(contribs.get('c1')).toMatchObject({ status: 'bloqueada', scan_status: 'infectada' });
  });

  it('VT 429 → adiado e retry de 15 min; cota diária ≥ 450 → adiado sem chamar', async () => {
    const { db, contribs } = statefulDb(CONTRIB, [FILE]);
    const r2 = r2With({ 'quarantine/c1/f1.pdf': PDF });
    const vt = { ...vtClean, lookupHash: async () => ({ kind: 'adiado' as const, reason: 'rate_limited' as const }) };
    const out = await scanContribution(deps(db, r2, { vt }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toMatchObject({ kind: 'retry', delaySeconds: 900 });
    expect(contribs.get('c1')).toMatchObject({ scan_status: 'adiado' });

    const s2 = statefulDb(CONTRIB, [FILE]);
    s2.quota.set('_vt|2026-09-17', { count: 450, bytes: 0 });
    const lookup = vi.fn(vtClean.lookupHash);
    const out2 = await scanContribution(deps(s2.db, r2With({ 'quarantine/c1/f1.pdf': PDF }), { vt: { ...vtClean, lookupHash: lookup } }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out2).toMatchObject({ kind: 'retry', delaySeconds: 900 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('link unsafe → bloqueada mesmo sem arquivo', async () => {
    const { db, contribs } = statefulDb({ ...CONTRIB, links: '[{"url":"https://youtu.be/x","host":"youtu.be","safe_browsing":"pending"}]' }, []);
    const links: LinkChecker = async () => ({ 'https://youtu.be/x': 'unsafe' });
    const out = await scanContribution(deps(db, r2With({}), { links }), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'done', status: 'bloqueada' });
    expect(JSON.parse(contribs.get('c1')!.links as string)[0].safe_browsing).toBe('unsafe');
  });

  it('adiado há mais de 24 h → bloqueada por timeout', async () => {
    const { db, contribs } = statefulDb({ ...CONTRIB, created_at: '2026-09-15 10:00:00' }, [FILE]);
    const vt = { ...vtClean, lookupHash: async () => ({ kind: 'adiado' as const, reason: 'error' as const }) };
    const out = await scanContribution(deps(db, r2With({ 'quarantine/c1/f1.pdf': PDF }), { vt }), { contributionId: 'c1', phase: 'submit', attempt: 5 });
    expect(out).toEqual({ kind: 'done', status: 'bloqueada' });
    expect(JSON.parse(contribs.get('c1')!.scan_report as string).reason).toBe('timeout');
  });

  it('contribuição já decidida pelo scan é no-op', async () => {
    const { db } = statefulDb({ ...CONTRIB, status: 'pendente', scan_status: 'limpa' }, []);
    const out = await scanContribution(deps(db, r2With({})), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'done', status: 'pendente' });
  });
});
