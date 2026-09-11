import type { App } from '../env';
import {
  DICTIONARY_SCHEMA,
  COLUNAS,
  casaEtag,
  lerLinha,
  lerVersao,
  linhaParaEntrada,
  usosDoGesto,
  type LinhaDoDicionario,
} from '../gestures/dicionario';
import { requireAuth } from '../middleware';
import { storageKeyFor } from '../storageKeys';
import {
  chaveDaFigura,
  escreverNoDicionario,
  gerarIdDeGesto,
} from '../gestures/dicionario';
import { GESTURE_ID_RE, validarDocumento } from '../gestures/schema';
import { contarUsos, substituirGesto } from '../gestures/usage';

const CACHE = 'public, max-age=300';

const MAX_FIGURA_NA_CRIACAO = 2 * 1024 * 1024;
const MAX_FIGURA_NA_TROCA = 5 * 1024 * 1024;

/** `exampleTriggers` chega como JSON string (multipart) ou array (JSON). Devolve null se inválido. */
function lerExemplos(valor: unknown): string[] | null {
  let lido: unknown = valor;
  if (typeof valor === 'string') {
    try {
      lido = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (lido === undefined) return [];
  if (!Array.isArray(lido) || !lido.every((x) => typeof x === 'string')) return null;
  return lido.map((s) => s.trim()).filter(Boolean);
}

/** Confere tipo e tamanho de um arquivo de figura; devolve a resposta de erro ou null. */
function problemaNaFigura(file: unknown, tipo: 'image/png' | 'image/gif', teto: number): { status: 400 | 413; error: string } | null {
  if (!(file instanceof File)) return { status: 400, error: `Field 'file' must be a ${tipo}` };
  if (file.type !== tipo && !file.name.toLowerCase().endsWith(tipo === 'image/png' ? '.png' : '.gif')) {
    return { status: 400, error: `File must be ${tipo}` };
  }
  if (file.size > teto) return { status: 413, error: `File above ${Math.round(teto / (1024 * 1024))} MB` };
  return null;
}

/** Dicionário de gestos CIAs: leitura pública, escrita autenticada. */
export function registerGesturesRoutes(app: App): void {
  // GET /api/gestures/dictionary — o dicionário inteiro. A versão é o ETag: o
  // cliente guarda e manda If-None-Match; 304 custa uma leitura de uma linha.
  app.get('/api/gestures/dictionary', async (c) => {
    try {
      const version = await lerVersao(c.env.DB);
      const etag = `"v${version}"`;
      if (casaEtag(c.req.header('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': CACHE } });
      }
      const linhas = await c.env.DB
        .prepare(`SELECT ${COLUNAS} FROM gesture_dictionary ORDER BY name, id`)
        .all<LinhaDoDicionario>();
      const corpo = {
        schema: DICTIONARY_SCHEMA,
        version,
        generatedAt: new Date().toISOString(),
        gestures: (linhas.results ?? []).map(linhaParaEntrada),
      };
      return c.json(corpo, 200, { ETag: etag, 'Cache-Control': CACHE });
    } catch (error) {
      console.error('Error reading gesture dictionary:', error);
      return c.json({ error: 'Failed to read gesture dictionary' }, 500);
    }
  });

  // GET /api/gestures/dictionary/:id — entrada + onde é usada.
  app.get('/api/gestures/dictionary/:id', async (c) => {
    const id = c.req.param('id');
    try {
      const linha = await lerLinha(c.env.DB, id);
      if (!linha) return c.json({ error: 'Gesture not found' }, 404);
      const usages = await usosDoGesto(c.env.DB, id);
      return c.json({ data: { ...linhaParaEntrada(linha), usages } });
    } catch (error) {
      console.error('Error reading gesture:', error);
      return c.json({ error: 'Failed to read gesture' }, 500);
    }
  });

  // GET /api/gestures/usage[?gestureId=] — com id, os usos daquele gesto; sem id,
  // a contagem por gesto, para a lista do dicionário não fazer N requisições.
  app.get('/api/gestures/usage', async (c) => {
    const gestureId = c.req.query('gestureId')?.trim();
    try {
      if (gestureId) return c.json({ data: await usosDoGesto(c.env.DB, gestureId) });
      const r = await c.env.DB
        .prepare(`SELECT gesture_id, COUNT(DISTINCT material_id) AS materials FROM gesture_usage GROUP BY gesture_id`)
        .all<{ gesture_id: string; materials: number }>();
      return c.json({ data: r.results ?? [] });
    } catch (error) {
      console.error('Error reading gesture usage:', error);
      return c.json({ error: 'Failed to read gesture usage' }, 500);
    }
  });

  // POST /api/gestures/dictionary — gesto novo, com figura obrigatória.
  app.post('/api/gestures/dictionary', requireAuth, async (c) => {
    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Expected multipart form' }, 400);
    }
    const name = String(form.get('name') ?? '').trim();
    if (!name) return c.json({ error: "Field 'name' is required" }, 400);
    const description = String(form.get('description') ?? '').trim();
    const exemplos = lerExemplos(form.get('exampleTriggers') ?? undefined);
    if (exemplos === null) return c.json({ error: "Field 'exampleTriggers' must be a JSON array of strings" }, 400);
    const idInformado = form.get('id');
    if (idInformado !== null && (typeof idInformado !== 'string' || !GESTURE_ID_RE.test(idInformado))) {
      return c.json({ error: "Field 'id' must be 12 lowercase hex characters" }, 400);
    }
    // FormData.get() vem tipado só como `string | null` nesta versão de
    // @cloudflare/workers-types (sem File no retorno); no runtime real (e nestes
    // testes) File está presente — mesmo desvio contornado com `as string` para
    // c.req.param() em validation.ts.
    const figura = form.get('image') as unknown;
    if (!(figura instanceof File)) return c.json({ error: "Field 'image' (PNG) is required" }, 400);
    const problema = problemaNaFigura(figura, 'image/png', MAX_FIGURA_NA_CRIACAO);
    if (problema) return c.json({ error: problema.error }, problema.status);

    const id = typeof idInformado === 'string' ? idInformado : gerarIdDeGesto();
    try {
      if (await lerLinha(c.env.DB, id)) return c.json({ error: 'Gesture id already exists' }, 409);
      const imageKey = chaveDaFigura(id, 'png');
      await c.env.ASSETS.put(storageKeyFor(imageKey), figura.stream(), { httpMetadata: { contentType: 'image/png' } });
      try {
        await escreverNoDicionario(c.env.DB, [
          c.env.DB
            .prepare(
              `INSERT INTO gesture_dictionary (id, name, description, example_triggers, image_key, status)
               VALUES (?, ?, ?, ?, ?, 'active')`
            )
            .bind(id, name, description, JSON.stringify(exemplos), imageKey),
        ]);
      } catch (error) {
        // Sem linha no banco, o objeto no R2 é lixo que ninguém mais alcança —
        // mesmo caso do bulk-upload em praises.ts.
        try {
          await c.env.ASSETS.delete(storageKeyFor(imageKey));
        } catch (e) {
          console.warn('Failed to delete R2 object:', e);
        }
        throw error;
      }
      const linha = await lerLinha(c.env.DB, id);
      return c.json(
        {
          data: linha
            ? linhaParaEntrada(linha)
            : { id, name, description, exampleTriggers: exemplos, image: imageKey, gif: null, status: 'active', replacedBy: null, updatedAt: new Date().toISOString() },
        },
        201
      );
    } catch (error) {
      console.error('Error creating gesture:', error);
      return c.json({ error: 'Failed to create gesture' }, 500);
    }
  });

  // PATCH /api/gestures/dictionary/:id — campos de texto e status.
  app.patch('/api/gestures/dictionary/:id', requireAuth, async (c) => {
    // Mesmo desvio de tipos do PATCH /api/validation/findings/:id (validation.ts):
    // com requireAuth encadeado, c.req.param('id') alarga para string | undefined.
    const id = c.req.param('id') as string;
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const linha = await lerLinha(c.env.DB, id).catch(() => null);
    if (!linha) return c.json({ error: 'Gesture not found' }, 404);

    const name = body.name === undefined ? linha.name : String(body.name).trim();
    if (!name) return c.json({ error: "Field 'name' must be a non-empty string" }, 400);
    const description = body.description === undefined ? linha.description : String(body.description).trim();
    const exemplos = body.exampleTriggers === undefined ? null : lerExemplos(body.exampleTriggers);
    if (body.exampleTriggers !== undefined && exemplos === null) {
      return c.json({ error: "Field 'exampleTriggers' must be an array of strings" }, 400);
    }
    const status = body.status === undefined ? linha.status : body.status;
    if (status !== 'active' && status !== 'deprecated') return c.json({ error: "Field 'status' must be active or deprecated" }, 400);
    if (['name', 'description', 'exampleTriggers', 'status'].every((k) => body[k] === undefined)) {
      return c.json({ error: 'Nothing to update' }, 400);
    }

    try {
      await escreverNoDicionario(c.env.DB, [
        c.env.DB
          .prepare(
            `UPDATE gesture_dictionary SET name = ?, description = ?, example_triggers = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .bind(name, description, JSON.stringify(exemplos ?? JSON.parse(linha.example_triggers || '[]')), status, id),
      ]);
      const depois = (await lerLinha(c.env.DB, id)) ?? linha;
      return c.json({ data: linhaParaEntrada(depois) });
    } catch (error) {
      console.error('Error updating gesture:', error);
      return c.json({ error: 'Failed to update gesture' }, 500);
    }
  });

  // POST …/:id/image e …/:id/gif — trocar a figura; mesma rotina, chave e coluna diferentes.
  for (const [sufixo, tipo, coluna] of [
    ['image', 'image/png', 'image_key'],
    ['gif', 'image/gif', 'gif_key'],
  ] as const) {
    app.post(`/api/gestures/dictionary/:id/${sufixo}`, requireAuth, async (c) => {
      const id = c.req.param('id') as string;
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: 'Expected multipart form' }, 400);
      }
      const file = form.get('file') as unknown;
      const problema = problemaNaFigura(file, tipo, MAX_FIGURA_NA_TROCA);
      if (problema) return c.json({ error: problema.error }, problema.status);

      try {
        const linha = await lerLinha(c.env.DB, id);
        if (!linha) return c.json({ error: 'Gesture not found' }, 404);
        const chave = chaveDaFigura(id, sufixo === 'image' ? 'png' : 'gif');
        await c.env.ASSETS.put(storageKeyFor(chave), (file as File).stream(), { httpMetadata: { contentType: tipo } });
        await escreverNoDicionario(c.env.DB, [
          c.env.DB
            .prepare(`UPDATE gesture_dictionary SET ${coluna} = ?, updated_at = datetime('now') WHERE id = ?`)
            .bind(chave, id),
        ]);
        const depois = (await lerLinha(c.env.DB, id)) ?? linha;
        return c.json({ data: linhaParaEntrada({ ...depois, [coluna]: chave }) });
      } catch (error) {
        console.error(`Error uploading gesture ${sufixo}:`, error);
        return c.json({ error: `Failed to upload gesture ${sufixo}` }, 500);
      }
    });
  }

  // POST …/:id/replace-with — funde dois gestos: o de origem vira 'deprecated' com
  // replaced_by, SEMPRE e no batch. Reescrever os documentos é faxina opcional: a
  // resolução de alias já é do cliente, e reescrever N objetos no R2 numa
  // requisição é caro e falível — por isso é sequencial e cada falha vira item
  // da resposta em vez de derrubar o resto.
  app.post('/api/gestures/dictionary/:id/replace-with', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
    if (!targetId) return c.json({ error: "Field 'targetId' is required" }, 400);
    if (targetId === id) return c.json({ error: 'A gesture cannot replace itself' }, 400);
    const rewriteDocuments = body?.rewriteDocuments === true;

    try {
      const origem = await lerLinha(c.env.DB, id);
      if (!origem) return c.json({ error: 'Gesture not found' }, 404);
      const alvo = await lerLinha(c.env.DB, targetId);
      if (!alvo) return c.json({ error: 'Target gesture not found' }, 404);
      if (alvo.status !== 'active') return c.json({ error: 'Target gesture is deprecated' }, 400);

      await escreverNoDicionario(c.env.DB, [
        c.env.DB
          .prepare(`UPDATE gesture_dictionary SET status = 'deprecated', replaced_by = ?, updated_at = datetime('now') WHERE id = ?`)
          .bind(targetId, id),
      ]);

      let reescritos = 0;
      const falhas: { materialId: string; motivo: string }[] = [];
      if (rewriteDocuments) {
        const usos = await usosDoGesto(c.env.DB, id);
        for (const uso of usos) {
          const materialId = uso.material_id;
          try {
            const row = await c.env.DB
              .prepare(`SELECT r2_key FROM praise_materials WHERE id = ?`)
              .bind(materialId)
              .first<{ r2_key: string | null }>();
            if (!row?.r2_key) throw new Error('material sem r2_key');
            const objeto = await c.env.ASSETS.get(storageKeyFor(row.r2_key));
            if (!objeto) throw new Error('objeto não existe no R2');
            let lido: unknown;
            try {
              lido = JSON.parse(await objeto.text());
            } catch {
              throw new Error('documento não é JSON válido');
            }
            const validado = validarDocumento(lido);
            if (!validado.ok) throw new Error(`documento inválido em ${validado.erro.caminho}`);
            const { doc, trocados } = substituirGesto(validado.doc, id, targetId);
            if (trocados === 0) continue;
            await c.env.ASSETS.put(storageKeyFor(row.r2_key), JSON.stringify(doc), {
              httpMetadata: { contentType: 'application/json; charset=utf-8' },
            });
            const usosNovos = contarUsos(doc);
            await c.env.DB.batch([
              c.env.DB.prepare(`DELETE FROM gesture_usage WHERE material_id = ?`).bind(materialId),
              ...[...usosNovos].map(([g, n]) =>
                c.env.DB.prepare(`INSERT INTO gesture_usage (material_id, gesture_id, count) VALUES (?, ?, ?)`).bind(materialId, g, n)
              ),
            ]);
            reescritos += 1;
          } catch (error) {
            falhas.push({ materialId, motivo: error instanceof Error ? error.message : String(error) });
          }
        }
      }

      console.log(JSON.stringify({ msg: 'gesture.replace', from: id, to: targetId, rewritten: reescritos, failed: falhas.length }));
      return c.json({ ok: true, deprecated: id, replacedBy: targetId, reescritos, falhas });
    } catch (error) {
      console.error('Error replacing gesture:', error);
      return c.json({ error: 'Failed to replace gesture' }, 500);
    }
  });
}
