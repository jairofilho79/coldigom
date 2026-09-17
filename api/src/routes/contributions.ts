/**
 * POST /api/contributions, GET /api/contributions/mine e /:id (spec §4.2).
 * Ordem de validação do POST, sempre nesta sequência: teto do corpo → schema
 * do payload → forma/tamanho/assinatura dos arquivos → cota diária → upload
 * no R2 → grava em D1 (batch) → enfileira o scan. Nada é escrito antes da
 * cota passar, e nenhum objeto fica em quarantine/ sem linha em D1 (limpeza
 * no catch de upload e no catch do batch).
 */
import type { App } from '../env';
import { requireAppUser } from '../appUser';
import { declaredTypeFromName, headMatchesDeclared, IMAGE_TYPES, safeOriginalName, type DeclaredType } from '../contributions/sniff';
import { parsePayload } from '../contributions/schema';
import { bumpQuotaStmt, dayUtc, MAX_DAILY_BYTES, MAX_DAILY_COUNT, readQuota, resetAtUtc } from '../contributions/quota';
import { getContributionForUser, insertContributionStmt, insertFileStmt, listFiles, listFilesForContributions, listMine, toUserJson } from '../contributions/repo';

export const MAX_FILES = 5;
// A parte `payload` do multipart é um JSON pequeno por natureza (título,
// corpo, campos); 64 KiB é folgado para o maior formulário real e barato de
// rejeitar antes do `JSON.parse` de um valor artificialmente enorme.
export const MAX_PAYLOAD_BYTES = 64 * 1024;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;
// O edge da Cloudflare já limita o corpo da requisição a 100 MB nos planos
// Free/Pro — 5 arquivos de 32 MiB nunca chegam até aqui de qualquer forma.
// Este teto (96 MiB) só existe para responder 413 com um erro nosso, cedo,
// em vez de deixar o edge cortar a conexão sem explicação nenhuma pro app.
export const MAX_REQUEST_BYTES = 96 * 1024 * 1024;
// Assinatura binária cabe em 16 bytes; texto (txt/chordpro) precisa de uma
// janela maior porque a spec pede "UTF-8 válido nos primeiros 4 KB" — 16
// bytes cortaria um caractere acentuado no meio na maioria dos arquivos reais.
const BINARY_SNIFF_WINDOW = 16;
const TEXT_SNIFF_WINDOW = 4096;
const PAGE = 20;

/**
 * Hash sem materializar o arquivo inteiro de novo em memória: no runtime real
 * (Workers), `crypto.DigestStream` consome o próprio stream do arquivo, então
 * o arquivo só é lido uma vez no total (o stream de upload é outro, separado).
 * `DigestStream` não existe em Node (só em workerd) — nestes testes
 * (`vitest --pool=threads`, ambiente Node) cai para `subtle.digest` sobre o
 * `arrayBuffer()`, que é uma cópia extra só em teste, nunca em produção.
 */
async function sha256Hex(file: File): Promise<string> {
  const DigestStreamCtor = (
    crypto as unknown as {
      DigestStream?: new (algorithm: string) => WritableStream<ArrayBuffer | ArrayBufferView> & { digest: Promise<ArrayBuffer> };
    }
  ).DigestStream;
  let digest: ArrayBuffer;
  if (DigestStreamCtor) {
    const ds = new DigestStreamCtor('SHA-256');
    await file.stream().pipeTo(ds);
    digest = await ds.digest;
  } else {
    digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  }
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function registerContributionsRoutes(app: App) {
  app.post('/api/contributions', requireAppUser, async (c) => {
    const user = c.get('appUser');

    // Content-Length mentiroso ou ausente não impede nada aqui — é só uma
    // rejeição antecipada de corpo obviamente grande demais, antes de gastar
    // tempo parseando multipart. O teto de verdade é a soma real dos
    // arquivos, checada depois do parse.
    const declaredLength = Number(c.req.header('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return c.json({ error: 'request_too_large' }, 413);
    }

    let form: FormData;
    try {
      form = await c.req.raw.formData();
    } catch {
      return c.json({ error: 'invalid_multipart' }, 400);
    }

    const rawPayload = form.get('payload');
    if (typeof rawPayload !== 'string') return c.json({ error: 'payload_required' }, 400);
    if (rawPayload.length > MAX_PAYLOAD_BYTES) return c.json({ error: 'payload_too_large' }, 413);
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
    const prepared: { file: File; name: string; type: DeclaredType }[] = [];
    let total = 0;
    for (const file of files) {
      const name = safeOriginalName(file.name);
      const type = declaredTypeFromName(name);
      if (!type) return c.json({ error: 'file_type_not_allowed', file: name }, 400);
      if (payload.kind === 'bug' && !IMAGE_TYPES.includes(type)) return c.json({ error: 'file_type_not_allowed', file: name }, 400);
      if (file.size > MAX_FILE_BYTES) return c.json({ error: 'file_too_large', file: name }, 413);
      // Só a janela de sniff é lida agora — o arquivo inteiro só é lido uma
      // vez, no upload/hash lá embaixo (nunca duas cópias em memória).
      const window = type === 'txt' || type === 'chordpro' ? TEXT_SNIFF_WINDOW : BINARY_SNIFF_WINDOW;
      const head = new Uint8Array(await file.slice(0, window).arrayBuffer());
      if (!headMatchesDeclared(head, type)) return c.json({ error: 'file_type_mismatch', file: name }, 400);
      // file.size vem do parser de multipart do runtime, não de nada que o
      // cliente declarou à parte — é o mesmo valor gravado em D1 depois.
      total += file.size;
      prepared.push({ file, name, type });
    }
    if (total > MAX_REQUEST_BYTES) return c.json({ error: 'request_too_large' }, 413);

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
        // R2 aceita Blob/File diretamente — subir p.file evita reconstruir um
        // Uint8Array só para isso (o arquivo já foi lido pelo parser da
        // FormData; ASSETS.put lê o stream dele, não duplica em memória).
        await c.env.ASSETS.put(key, p.file);
        uploaded.push(key);
        fileStmts.push(
          insertFileStmt(c.env.DB, {
            id: fileId,
            contributionId: id,
            originalName: p.name,
            declaredType: p.type,
            size: p.file.size,
            sha256: await sha256Hex(p.file),
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
    try {
      await c.env.DB.batch([
        insertContributionStmt(c.env.DB, { id, userId: user.userId, userEmail: user.email ?? '', userName: user.name, payload, status, scanStatus: needsScan ? 'pendente' : 'sem_arquivo' }),
        ...fileStmts,
        bumpQuotaStmt(c.env.DB, user.userId, day, 1, total),
      ]);
    } catch (err) {
      // O D1 falhar depois do upload também não pode deixar objeto órfão em
      // quarantine/ — mesma limpeza do catch acima.
      await Promise.all(uploaded.map((k) => c.env.ASSETS.delete(k).catch(() => undefined)));
      console.error(JSON.stringify({ msg: 'contributions.db_failed', id, err: String(err) }));
      return c.json({ error: 'upload_failed' }, 500);
    }
    if (needsScan) {
      if (!c.env.CONTRIB_SCAN) {
        console.error(JSON.stringify({ msg: 'contributions.queue_missing', id }));
      } else {
        try {
          await c.env.CONTRIB_SCAN.send({ contributionId: id, phase: 'submit', attempt: 0 });
        } catch (err) {
          // O batch já comitou — voltar 500 aqui faria o app reenviar e
          // duplicar a contribuição. O cron de retomada (Task 8) reenfileira
          // toda 'recebida' parada há mais de 6h, então isto se autocorrige.
          console.error(JSON.stringify({ msg: 'contributions.queue_send_failed', id, err: String(err) }));
        }
      }
    }
    return c.json({ id, status }, 201);
  });

  // Precisa vir antes de /api/contributions/:id, senão o parâmetro engole "mine".
  app.get('/api/contributions/mine', requireAppUser, async (c) => {
    const user = c.get('appUser');
    const { rows, nextCursor } = await listMine(c.env.DB, user.userId, c.req.query('cursor') ?? null, PAGE);
    // Uma consulta só para os arquivos da página inteira — nada de `listFiles`
    // em loop (N+1: 20 linhas de página viravam 20 SELECTs), mesmo ajuste já
    // feito na lista do admin (repo.ts).
    const filesByContribution = await listFilesForContributions(c.env.DB, rows.map((row) => row.id));
    const data = rows.map((row) => toUserJson(row, filesByContribution.get(row.id) ?? []));
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
