/**
 * POST /api/contributions, GET /api/contributions/mine e /:id (spec §4.2).
 * Ordem de validação do POST, sempre nesta sequência: schema do payload →
 * forma/tamanho/assinatura dos arquivos → cota diária → upload no R2 → grava
 * em D1 (batch) → enfileira o scan. Nada é escrito antes da cota passar, e
 * nenhum objeto fica em quarantine/ sem linha em D1 (limpeza no catch).
 */
import type { App } from '../env';
import { requireAppUser } from '../appUser';
import { declaredTypeFromName, headMatchesDeclared, IMAGE_TYPES, safeOriginalName, type DeclaredType } from '../contributions/sniff';
import { parsePayload } from '../contributions/schema';
import { bumpQuotaStmt, dayUtc, MAX_DAILY_BYTES, MAX_DAILY_COUNT, readQuota, resetAtUtc } from '../contributions/quota';
import { getContributionForUser, insertContributionStmt, insertFileStmt, listFiles, listMine, toUserJson } from '../contributions/repo';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
const PAGE = 20;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function registerContributionsRoutes(app: App) {
  app.post('/api/contributions', requireAppUser, async (c) => {
    const user = c.get('appUser');
    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      return c.json({ error: 'invalid_multipart' }, 400);
    }

    const rawPayload = form.get('payload');
    if (typeof rawPayload !== 'string') return c.json({ error: 'payload_required' }, 400);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayload);
    } catch {
      return c.json({ error: 'invalid_payload' }, 400);
    }
    const parsed = parsePayload(parsedJson);
    if (!parsed.ok) return c.json({ error: parsed.error, detail: parsed.detail }, 400);
    const payload = parsed.payload;

    // Arquivos: validar tudo (forma, tamanho, assinatura) antes de tocar o R2.
    // @cloudflare/workers-types não tipa getAll() como File-aware (só o dicionário
    // de gestos já contornava isso com `as unknown`); no runtime real e nestes
    // testes, File está presente.
    const files = (form.getAll('file') as unknown[]).filter((f): f is File => f instanceof File);
    if (files.length > MAX_FILES) return c.json({ error: 'too_many_files' }, 400);
    const prepared: { file: File; name: string; type: DeclaredType; bytes: Uint8Array }[] = [];
    let total = 0;
    for (const file of files) {
      const name = safeOriginalName(file.name);
      const type = declaredTypeFromName(name);
      if (!type) return c.json({ error: 'file_type_not_allowed', file: name }, 400);
      if (payload.kind === 'bug' && !IMAGE_TYPES.includes(type)) return c.json({ error: 'file_type_not_allowed', file: name }, 400);
      if (file.size > MAX_FILE_BYTES) return c.json({ error: 'file_too_large', file: name }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!headMatchesDeclared(bytes.subarray(0, 16), type)) return c.json({ error: 'file_type_mismatch', file: name }, 400);
      total += bytes.length;
      prepared.push({ file, name, type, bytes });
    }

    const day = dayUtc();
    const quota = await readQuota(c.env.DB, user.userId, day);
    if (quota.count >= MAX_DAILY_COUNT || quota.bytes + total > MAX_DAILY_BYTES) {
      return c.json({ error: 'quota_exceeded', resetAt: resetAtUtc() }, 429);
    }

    const id = crypto.randomUUID();
    const uploaded: string[] = [];
    const fileStmts = [];
    try {
      for (const p of prepared) {
        const fileId = crypto.randomUUID();
        const key = `quarantine/${id}/${fileId}.${p.type}`;
        await c.env.ASSETS.put(key, p.bytes);
        uploaded.push(key);
        fileStmts.push(
          insertFileStmt(c.env.DB, {
            id: fileId,
            contributionId: id,
            originalName: p.name,
            declaredType: p.type,
            size: p.bytes.length,
            sha256: await sha256Hex(p.bytes),
            r2Key: key,
          })
        );
      }
    } catch (err) {
      // Nunca deixar objeto em quarantine/ sem linha em D1.
      await Promise.all(uploaded.map((k) => c.env.ASSETS.delete(k).catch(() => undefined)));
      console.error(JSON.stringify({ msg: 'contributions.upload_failed', id, err: String(err) }));
      return c.json({ error: 'upload_failed' }, 500);
    }

    const needsScan = prepared.length > 0 || payload.links.length > 0;
    const status = needsScan ? 'recebida' : 'pendente';
    await c.env.DB.batch([
      insertContributionStmt(c.env.DB, { id, userId: user.userId, userEmail: user.email ?? '', userName: user.name, payload, status, scanStatus: needsScan ? 'pendente' : 'sem_arquivo' }),
      ...fileStmts,
      bumpQuotaStmt(c.env.DB, user.userId, day, 1, total),
    ]);
    if (needsScan) {
      if (!c.env.CONTRIB_SCAN) console.error(JSON.stringify({ msg: 'contributions.queue_missing', id }));
      else await c.env.CONTRIB_SCAN.send({ contributionId: id, phase: 'submit', attempt: 0 });
    }
    return c.json({ id, status }, 201);
  });

  // Precisa vir antes de /api/contributions/:id, senão o parâmetro engole "mine".
  app.get('/api/contributions/mine', requireAppUser, async (c) => {
    const user = c.get('appUser');
    const { rows, nextCursor } = await listMine(c.env.DB, user.userId, c.req.query('cursor') ?? null, PAGE);
    const data = [];
    for (const row of rows) data.push(toUserJson(row, await listFiles(c.env.DB, row.id)));
    return c.json({ data, nextCursor });
  });

  app.get('/api/contributions/:id', requireAppUser, async (c) => {
    const user = c.get('appUser');
    // Com requireAppUser encadeado, c.req.param('id') alarga para string | undefined
    // (mesmo desvio de tipos do dicionário de gestos, ver gestures.ts).
    const row = await getContributionForUser(c.env.DB, c.req.param('id') as string, user.userId);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ data: toUserJson(row, await listFiles(c.env.DB, row.id)) });
  });
}
