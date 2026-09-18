import { describe, expect, it, vi } from 'vitest';

import { handleContribScanBatch, requeueStaleContributions, scanContribution, type ScanDeps } from '../contributions/scan';
import type { LinkChecker } from '../contributions/links';
import type { VirusTotalClient } from '../contributions/virustotal';
import type { ContribScanMessage, Env } from '../env';

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
    if (/^UPDATE contributions SET/.test(s)) {
      const id = b[b.length - 1] as string;
      const row = contribs.get(id)!;
      // Mesmo guard `AND status = 'recebida'` da query real: se a linha já
      // saiu de 'recebida' (outra entrega da mesma mensagem terminou primeiro),
      // esta escrita é pulada — replica a idempotência do WHERE de verdade.
      if (/AND status = 'recebida'/.test(s) && row.status !== 'recebida') return [];
      const cols = [...s.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
      cols.forEach((c, i) => { row[c] = b[i]; });
      return [];
    }
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
    get: vi.fn(async (k: string) => {
      if (!store.has(k)) return null;
      const bytes = store.get(k)!;
      return {
        arrayBuffer: async () => bytes.buffer.slice(0),
        // `.blob()` (submitFile do VT) e `.body` + `httpMetadata` (cópia de
        // quarantine/ → contributions/ streaming) — os dois caminhos que
        // deixaram de materializar um segundo/terceiro `Uint8Array` do arquivo.
        blob: async () => new Blob([bytes]),
        body: new Blob([bytes]).stream(),
        httpMetadata: {},
      };
    }),
    put: vi.fn(async (k: string, body: BodyInit) => { store.set(k, new Uint8Array(await new Response(body).arrayBuffer())); }),
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

  it('entrega duplicada da mesma mensagem: a segunda não sobrescreve o veredito que a primeira já gravou', async () => {
    // Simula duas entregas concorrentes da mesma mensagem da fila (at-least-once):
    // as duas leem a linha como 'recebida', mas uma delas termina primeiro e
    // marca 'pendente'. Aqui isso acontece bem no meio da execução da segunda
    // (dentro do `r2.get` do arquivo), como uma corrida real faria.
    const { db, contribs } = statefulDb(CONTRIB, [FILE]);
    const bytes = PDF_JS; // token perigoso → esta chamada tentaria gravar 'bloqueada'
    const r2 = {
      get: vi.fn(async () => {
        contribs.set('c1', { ...contribs.get('c1')!, status: 'pendente', scan_status: 'limpa' });
        return { arrayBuffer: async () => bytes.buffer.slice(0), blob: async () => new Blob([bytes]), body: new Blob([bytes]).stream(), httpMetadata: {} };
      }),
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    } as unknown as R2Bucket;
    const out = await scanContribution(deps(db, r2), { contributionId: 'c1', phase: 'submit', attempt: 0 });
    expect(out).toEqual({ kind: 'done', status: 'bloqueada' });
    // O guard `AND status = 'recebida'` não bateu (já virou 'pendente' na
    // "outra" entrega) — o status gravado continua o da primeira, não é
    // rebaixado para 'bloqueada' pela segunda.
    expect(contribs.get('c1')!.status).toBe('pendente');
    expect(r2.put).not.toHaveBeenCalled();
  });
});

describe('handleContribScanBatch', () => {
  function batchOf(id: string) {
    const msg: ContribScanMessage = { contributionId: id, phase: 'submit', attempt: 0 };
    const ack = vi.fn();
    const retry = vi.fn();
    const batch = { messages: [{ body: msg, ack, retry }] } as unknown as MessageBatch<ContribScanMessage>;
    return { batch, ack, retry };
  }

  it('done → ack, sem retry', async () => {
    const { db } = statefulDb({ ...CONTRIB, status: 'pendente', scan_status: 'limpa' }, []);
    const { batch, ack, retry } = batchOf('c1');
    const env = { DB: db, ASSETS: r2With({}) } as unknown as Env;
    await handleContribScanBatch(batch, env);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('retry: manda CONTRIB_SCAN.send com delaySeconds e dá ack (não usa message.retry)', async () => {
    // created_at = agora: como `handleContribScanBatch` não recebe um `now`
    // de teste (usa `new Date()` de verdade dentro de `scanContribution`), a
    // linha não pode ser fixa no passado sob risco de cair no ramo de timeout.
    const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const { db } = statefulDb({ ...CONTRIB, created_at: nowIso }, [FILE]);
    const send = vi.fn(async () => undefined);
    const { batch, ack, retry } = batchOf('c1');
    // Sem VIRUSTOTAL_API_KEY/SAFE_BROWSING_API_KEY: lookupHash/links adiam sem
    // rede nenhuma (determinístico), levando a scanContribution a pedir retry.
    const env = { DB: db, ASSETS: r2With({ 'quarantine/c1/f1.pdf': PDF }), CONTRIB_SCAN: { send } } as unknown as Env;
    await handleContribScanBatch(batch, env);
    expect(send).toHaveBeenCalledWith({ contributionId: 'c1', phase: 'poll', attempt: 1 }, { delaySeconds: 900 });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('scanContribution lança → message.retry({ delaySeconds: 900 }), sem ack', async () => {
    const boomDb = {
      prepare: () => ({ bind: () => ({ first: () => { throw new Error('boom'); } }) }),
    } as unknown as D1Database;
    const { batch, ack, retry } = batchOf('c1');
    const env = { DB: boomDb, ASSETS: r2With({}) } as unknown as Env;
    await handleContribScanBatch(batch, env);
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 900 });
    expect(ack).not.toHaveBeenCalled();
  });
});

describe('requeueStaleContributions', () => {
  /** D1 falso mínimo só para as duas queries do cron de resgate. */
  function requeueFakeDb(rows: Row[]) {
    const contribs = new Map(rows.map((r) => [r.id as string, { ...r }]));
    const db = {
      prepare: (sql: string) => ({
        bind: (...b: unknown[]) => ({
          run: async () => {
            if (/^UPDATE contributions SET status = 'bloqueada'/.test(sql)) {
              const cutoff = b[0] as string;
              let changes = 0;
              for (const row of contribs.values()) {
                if (row.status === 'recebida' && (row.created_at as string) < cutoff) {
                  row.status = 'bloqueada';
                  row.scan_report = JSON.stringify({ reason: 'timeout' });
                  changes++;
                }
              }
              return { meta: { changes } };
            }
            throw new Error(`run não suportado no fake: ${sql}`);
          },
          all: async () => {
            if (/^SELECT id FROM contributions WHERE status = 'recebida' AND updated_at < \?/.test(sql)) {
              const cutoff = b[0] as string;
              const results = Array.from(contribs.values())
                .filter((row) => row.status === 'recebida' && (row.updated_at as string) < cutoff)
                .map((row) => ({ id: row.id }));
              return { results };
            }
            throw new Error(`all não suportado no fake: ${sql}`);
          },
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;
    return { db, contribs };
  }

  it('recebida parada > 6h reenfileira como submit; > 24h bloqueia por timeout', async () => {
    const now = new Date('2026-09-17T12:00:00Z');
    const rows: Row[] = [
      { id: 'c-6h', status: 'recebida', created_at: '2026-09-17 04:00:00', updated_at: '2026-09-17 04:00:00' }, // 8h parada
      { id: 'c-24h', status: 'recebida', created_at: '2026-09-16 10:00:00', updated_at: '2026-09-16 10:00:00' }, // 26h parada
      { id: 'c-fresh', status: 'recebida', created_at: '2026-09-17 11:50:00', updated_at: '2026-09-17 11:50:00' }, // 10 min, não mexe
    ];
    const { db, contribs } = requeueFakeDb(rows);
    const send = vi.fn(async () => undefined);
    const env = { DB: db, CONTRIB_SCAN: { send } } as unknown as Env;
    const out = await requeueStaleContributions(env, now);
    expect(out).toEqual({ requeued: 1, timedOut: 1 });
    expect(send).toHaveBeenCalledWith({ contributionId: 'c-6h', phase: 'submit', attempt: 0 });
    expect(contribs.get('c-24h')).toMatchObject({ status: 'bloqueada' });
    expect(JSON.parse(contribs.get('c-24h')!.scan_report as string)).toEqual({ reason: 'timeout' });
    expect(contribs.get('c-fresh')).toMatchObject({ status: 'recebida' });
  });
});
