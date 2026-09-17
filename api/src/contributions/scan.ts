/**
 * Consumer da fila `contrib-scan` (spec §5): dedupe → estrutural → links
 * (Safe Browsing) → VirusTotal (lookup/submit/poll) → decisão. Cada arquivo
 * anda pelos passos até virar `limpa | suspeita | infectada`, ou `queued`/
 * `adiado` quando precisa de outra passagem da fila. `scanContribution` é
 * puro em relação a I/O externo — tudo entra por `ScanDeps`, o que deixa o
 * teste com um D1/R2 falsos em vez de mocks do runtime real.
 */
import type { ContribScanMessage, Env } from '../env';
import { safeBrowsingChecker, type LinkChecker, type LinkVerdict } from './links';
import { bumpQuotaStmt, dayUtc, readQuota, VT_DAILY_LIMIT, VT_USER } from './quota';
import { getContribution, listFiles, type ContributionFileRow, type ContributionRow } from './repo';
import { checkStructural } from './structural';
import type { DeclaredType } from './sniff';
import { verdictFromStats, virusTotalClient, type VirusTotalClient } from './virustotal';

export type ScanDeps = { db: D1Database; r2: R2Bucket; vt: VirusTotalClient; links: LinkChecker; now?: () => Date };
export type ScanOutcome =
  | { kind: 'done'; status: 'pendente' | 'bloqueada' }
  | { kind: 'retry'; delaySeconds: number; message: ContribScanMessage };

const POLL_DELAY = 60;
const BACKOFF_DELAY = 15 * 60;
const MAX_POLLS = 10;
const TIMEOUT_MS = 24 * 60 * 60 * 1000;

type FileScan = {
  structural?: { ok: boolean; tokens: string[]; reason?: string };
  virustotal?: { sha256?: string; analysisId?: string; malicious?: number; suspicious?: number; polls?: number; dedupedFrom?: string };
  skipped?: string;
};

function parseDetail(f: ContributionFileRow): FileScan {
  try {
    return f.scan_detail ? (JSON.parse(f.scan_detail) as FileScan) : {};
  } catch {
    return {};
  }
}

async function updateFile(db: D1Database, id: string, patch: Partial<Pick<ContributionFileRow, 'scan_status' | 'detected_type' | 'r2_key'>> & { scan_detail?: FileScan }) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = ?`);
    vals.push(k === 'scan_detail' ? JSON.stringify(v) : v);
  }
  await db.prepare(`UPDATE contribution_files SET ${cols.join(', ')} WHERE id = ?`).bind(...vals, id).run();
}

async function updateContribution(db: D1Database, id: string, patch: { status?: string; scan_status?: string; scan_report?: unknown; links?: unknown }) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = ?`);
    vals.push(k === 'scan_report' || k === 'links' ? JSON.stringify(v) : v);
  }
  cols.push(`updated_at = datetime('now')`);
  await db.prepare(`UPDATE contributions SET ${cols.join(', ')} WHERE id = ?`).bind(...vals, id).run();
}

function createdAtMs(row: ContributionRow): number {
  return Date.parse(row.created_at.replace(' ', 'T') + (row.created_at.endsWith('Z') ? '' : 'Z'));
}

async function vtBudgetLeft(db: D1Database, now: Date): Promise<boolean> {
  return (await readQuota(db, VT_USER, dayUtc(now))).count < VT_DAILY_LIMIT;
}

async function spendVt(db: D1Database, now: Date) {
  await bumpQuotaStmt(db, VT_USER, dayUtc(now), 1, 0).run();
}

/** Um arquivo: estrutural → dedupe → VT. Devolve o novo scan_status do arquivo. */
async function scanFile(deps: ScanDeps, f: ContributionFileRow, phase: 'submit' | 'poll', now: Date): Promise<'limpa' | 'suspeita' | 'infectada' | 'adiado' | 'queued'> {
  const detail = parseDetail(f);
  if (f.scan_status === 'limpa' || f.scan_status === 'suspeita' || f.scan_status === 'infectada') return f.scan_status;

  if (!detail.structural) {
    const obj = await deps.r2.get(f.r2_key);
    if (!obj) {
      await updateFile(deps.db, f.id, { scan_status: 'suspeita', scan_detail: { ...detail, structural: { ok: false, tokens: [], reason: 'missing_object' } } });
      return 'suspeita';
    }
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const v = checkStructural(bytes, f.declared_type as DeclaredType);
    detail.structural = { ok: v.status === 'limpa', tokens: v.tokens, reason: v.reason };
    if (v.status !== 'limpa') {
      await updateFile(deps.db, f.id, { scan_status: 'suspeita', detected_type: v.detectedType, scan_detail: detail });
      return 'suspeita';
    }
    await updateFile(deps.db, f.id, { detected_type: v.detectedType, scan_detail: detail });

    // Dedupe: mesmo hash já limpo em outra linha (spec §5 passo 0) — evita
    // gastar orçamento de VT com um arquivo que já foi visto e aprovado.
    const twin = await deps.db
      .prepare(`SELECT id, scan_detail FROM contribution_files WHERE sha256 = ? AND scan_status = 'limpa' AND id <> ? LIMIT 1`)
      .bind(f.sha256, f.id)
      .first<{ id: string; scan_detail: string | null }>();
    if (twin) {
      detail.virustotal = { sha256: f.sha256, dedupedFrom: twin.id };
      await updateFile(deps.db, f.id, { scan_status: 'limpa', scan_detail: detail });
      return 'limpa';
    }
  }

  // VirusTotal
  if (!(await vtBudgetLeft(deps.db, now))) return 'adiado';
  if (phase === 'poll' && detail.virustotal?.analysisId) {
    await spendVt(deps.db, now);
    const p = await deps.vt.pollAnalysis(detail.virustotal.analysisId);
    if (p.kind === 'adiado') return 'adiado';
    if (p.kind === 'queued') {
      detail.virustotal.polls = (detail.virustotal.polls ?? 0) + 1;
      await updateFile(deps.db, f.id, { scan_detail: detail });
      return detail.virustotal.polls >= MAX_POLLS ? 'adiado' : 'queued';
    }
    const verdict = verdictFromStats(p.stats);
    detail.virustotal = { ...detail.virustotal, malicious: p.stats.malicious, suspicious: p.stats.suspicious };
    await updateFile(deps.db, f.id, { scan_status: verdict, scan_detail: detail });
    return verdict;
  }
  await spendVt(deps.db, now);
  const l = await deps.vt.lookupHash(f.sha256);
  if (l.kind === 'adiado') {
    if (l.reason === 'no_api_key') detail.skipped = 'no_api_key';
    await updateFile(deps.db, f.id, { scan_detail: detail });
    return 'adiado';
  }
  if (l.kind === 'known') {
    const verdict = verdictFromStats(l.stats);
    detail.virustotal = { sha256: f.sha256, malicious: l.stats.malicious, suspicious: l.stats.suspicious };
    await updateFile(deps.db, f.id, { scan_status: verdict, scan_detail: detail });
    return verdict;
  }
  const obj = await deps.r2.get(f.r2_key);
  if (!obj) return 'suspeita';
  await spendVt(deps.db, now);
  const s = await deps.vt.submitFile(new Uint8Array(await obj.arrayBuffer()), f.original_name);
  if (s.kind === 'adiado') return 'adiado';
  detail.virustotal = { sha256: f.sha256, analysisId: s.analysisId, polls: 0 };
  await updateFile(deps.db, f.id, { scan_detail: detail });
  return 'queued';
}

export async function scanContribution(deps: ScanDeps, msg: ContribScanMessage): Promise<ScanOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const row = await getContribution(deps.db, msg.contributionId);
  if (!row) return { kind: 'done', status: 'bloqueada' };
  if (row.status !== 'recebida') return { kind: 'done', status: row.status === 'bloqueada' ? 'bloqueada' : 'pendente' };

  // Links (só na primeira passagem que ainda tem pending).
  let links: { url: string; host: string; safe_browsing: LinkVerdict | 'pending' }[] = [];
  try {
    links = row.links ? JSON.parse(row.links) : [];
  } catch {
    links = [];
  }
  const pendingUrls = links.filter((l) => l.safe_browsing === 'pending' || l.safe_browsing === 'adiado').map((l) => l.url);
  let linksAdiado = false;
  if (pendingUrls.length) {
    const verdicts = await deps.links(pendingUrls);
    links = links.map((l) => (l.url in verdicts ? { ...l, safe_browsing: verdicts[l.url] } : l));
    linksAdiado = links.some((l) => l.safe_browsing === 'adiado');
    await updateContribution(deps.db, row.id, { links });
  }
  const linkUnsafe = links.some((l) => l.safe_browsing === 'unsafe');

  const files = await listFiles(deps.db, row.id);
  const results: Record<string, Awaited<ReturnType<typeof scanFile>>> = {};
  for (const f of files) results[f.id] = await scanFile(deps, f, msg.phase, now);
  const values = Object.values(results);

  const worst = linkUnsafe ? 'unsafe' : values.includes('infectada') ? 'infectada' : values.includes('suspeita') ? 'suspeita' : null;
  if (worst) {
    const scanStatus = worst === 'unsafe' ? 'suspeita' : worst;
    await updateContribution(deps.db, row.id, { status: 'bloqueada', scan_status: scanStatus, scan_report: { files: results, links, reason: worst === 'unsafe' ? 'link_unsafe' : worst } });
    return { kind: 'done', status: 'bloqueada' };
  }

  const stillQueued = values.includes('queued');
  const adiado = linksAdiado || values.includes('adiado');
  if (stillQueued || adiado) {
    if (now.getTime() - createdAtMs(row) > TIMEOUT_MS) {
      await updateContribution(deps.db, row.id, { status: 'bloqueada', scan_status: 'adiado', scan_report: { files: results, links, reason: 'timeout' } });
      return { kind: 'done', status: 'bloqueada' };
    }
    await updateContribution(deps.db, row.id, { scan_status: 'adiado' });
    if (adiado && !(await vtBudgetLeft(deps.db, now))) console.warn(JSON.stringify({ msg: 'contributions.vt_budget_exhausted', id: row.id }));
    return { kind: 'retry', delaySeconds: adiado ? BACKOFF_DELAY : POLL_DELAY, message: { contributionId: row.id, phase: 'poll', attempt: msg.attempt + 1 } };
  }

  // Tudo limpo: sai da quarentena (spec §5 passo 4) — copia para
  // `contributions/` e só então apaga o objeto de `quarantine/`.
  for (const f of files) {
    const dest = f.r2_key.replace(/^quarantine\//, 'contributions/');
    if (dest === f.r2_key) continue;
    const obj = await deps.r2.get(f.r2_key);
    if (obj) {
      await deps.r2.put(dest, await obj.arrayBuffer());
      await deps.r2.delete(f.r2_key);
    }
    await updateFile(deps.db, f.id, { r2_key: dest });
  }
  await updateContribution(deps.db, row.id, { status: 'pendente', scan_status: 'limpa', scan_report: { files: results, links } });
  return { kind: 'done', status: 'pendente' };
}

export async function handleContribScanBatch(batch: MessageBatch<ContribScanMessage>, env: Env): Promise<void> {
  const deps: ScanDeps = {
    db: env.DB,
    r2: env.ASSETS,
    vt: virusTotalClient(env.VIRUSTOTAL_API_KEY),
    links: safeBrowsingChecker(env.SAFE_BROWSING_API_KEY),
  };
  if (!env.VIRUSTOTAL_API_KEY || !env.SAFE_BROWSING_API_KEY) {
    console.error(JSON.stringify({ msg: 'contributions.scan.keys_missing', vt: !!env.VIRUSTOTAL_API_KEY, sb: !!env.SAFE_BROWSING_API_KEY }));
  }
  for (const message of batch.messages) {
    try {
      const out = await scanContribution(deps, message.body);
      if (out.kind === 'retry') {
        // `send` + `ack` (em vez de `message.retry`) dá controle sobre o
        // corpo da próxima tentativa (`phase`/`attempt`), que `retry()` não
        // permite mudar.
        if (env.CONTRIB_SCAN) {
          await env.CONTRIB_SCAN.send(out.message, { delaySeconds: out.delaySeconds });
          message.ack();
        } else {
          message.retry({ delaySeconds: out.delaySeconds });
        }
      } else {
        message.ack();
      }
    } catch (err) {
      console.error(JSON.stringify({ msg: 'contributions.scan.error', id: message.body.contributionId, err: String(err) }));
      message.retry({ delaySeconds: BACKOFF_DELAY });
    }
  }
}

/** Cron diário: mensagem perdida (> 6 h em `recebida` sem avanço) volta à fila; > 24 h bloqueia por timeout. */
export async function requeueStaleContributions(env: Env, now: Date = new Date()): Promise<{ requeued: number; timedOut: number }> {
  const sixH = new Date(now.getTime() - 6 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  const dayAgo = new Date(now.getTime() - TIMEOUT_MS).toISOString().replace('T', ' ').slice(0, 19);
  const timedOut = await env.DB.prepare(
    `UPDATE contributions SET status = 'bloqueada', scan_report = json_object('reason', 'timeout'), updated_at = datetime('now') WHERE status = 'recebida' AND created_at < ?`
  )
    .bind(dayAgo)
    .run();
  const { results } = await env.DB.prepare(`SELECT id FROM contributions WHERE status = 'recebida' AND updated_at < ?`).bind(sixH).all<{ id: string }>();
  let requeued = 0;
  for (const r of results ?? []) {
    if (env.CONTRIB_SCAN) {
      await env.CONTRIB_SCAN.send({ contributionId: r.id, phase: 'submit', attempt: 0 });
      requeued++;
    }
  }
  return { requeued, timedOut: timedOut.meta.changes ?? 0 };
}
