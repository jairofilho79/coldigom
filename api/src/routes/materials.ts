import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthUser } from '../auth';
import { listMaterialKindsForLocale } from '../materialKindLabels';
import type { App } from '../env';
import { requireAuth, requireUploadOrAuth } from '../middleware';
import { storageKeyFor } from '../storageKeys';
import type { MaterialRow } from '../praiseZip';
import {
  erroDeCategoriaDesconhecida,
  materialKindsForaDoCatalogo,
} from '../materialKindLabels';
import { MAX_CHORD_CONTENT_BYTES, isSafeMaterialType } from '../uploadLimits';

type LeituraDeCorpo = { excedeu: true } | { excedeu: false; texto: string };

/**
 * Lê o corpo com teto, sem materializar o que passa do limite.
 *
 * `c.req.text()` trazia o corpo inteiro para a memória antes de qualquer
 * checagem: num Worker de 128 MB, um PUT de 5 MB passava para gravar uma cifra
 * de ~611 bytes. Aqui o content-length declarado já corta a maioria dos casos, e
 * a leitura em pedaços cobre o corpo em chunked, que não declara tamanho.
 */
async function lerCorpoComTeto(request: Request, limite: number): Promise<LeituraDeCorpo> {
  const declarado = Number(request.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > limite) return { excedeu: true };

  const corpo = request.body;
  if (!corpo) return { excedeu: false, texto: '' };

  const leitor = corpo.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > limite) {
        await leitor.cancel();
        return { excedeu: true };
      }
      partes.push(value);
    }
  } finally {
    leitor.releaseLock();
  }

  const junto = new Uint8Array(total);
  let deslocamento = 0;
  for (const parte of partes) {
    junto.set(parte, deslocamento);
    deslocamento += parte.byteLength;
  }
  return { excedeu: false, texto: new TextDecoder().decode(junto) };
}

/**
 * If-Match chega entre aspas (e pode vir marcado como fraco); o R2 compara o
 * valor cru. `*` significa "qualquer objeto existente" e não é condição de
 * versão: cai no caminho sem onlyIf.
 */
function normalizarIfMatch(header: string | undefined): string | null {
  const bruto = header?.trim();
  if (!bruto || bruto === '*') return null;
  return bruto.replace(/^W\//i, '').replace(/^"(.*)"$/, '$1');
}

/** Materiais: catalogo de tipos, conteudo, edicao e remocao. */
export function registerMaterialsRoutes(app: App): void {
  app.get('/api/materials/kinds', async (c) => {
    try {
      const data = await listMaterialKindsForLocale(c.env.DB);
      return c.json({ data });
    } catch (error) {
      console.error('Error fetching material kinds:', error);
      return c.json({ error: 'Failed to fetch material kinds' }, 500);
    }
  });

  // GET /api/tags - List all tags

  app.put('/api/materials/:materialId/content', requireUploadOrAuth, async (c) => {
    const materialId = c.req.param('materialId');
    const rawContentType = c.req.header('content-type') || 'text/plain; charset=utf-8';

    let body: string;
    try {
      const leitura = await lerCorpoComTeto(c.req.raw, MAX_CHORD_CONTENT_BYTES);
      if (leitura.excedeu) {
        return c.json(
          {
            error: `Cifra acima do limite de ${Math.round(MAX_CHORD_CONTENT_BYTES / 1024)} KB.`,
          },
          413
        );
      }
      body = leitura.texto;
    } catch {
      return c.json({ error: 'Invalid body' }, 400);
    }

    // Corpo vazio respondia 200 e substituía o .chord por nada. A única defesa
    // era do lado da tela; o review-app grava por token e não passa por ela.
    // A regra aqui é a mais simples que se sustenta sozinha — "tem de sobrar
    // caractere depois de tirar o espaço" —, de propósito: replicar a gramática
    // do cliente daria duas regras divergentes em vez de uma rede.
    if (body.trim().length === 0) {
      return c.json({ error: 'A cifra não pode ficar vazia.' }, 400);
    }

    try {
      const row = await c.env.DB.prepare(
        `SELECT id, praise_id, type, r2_key FROM praise_materials WHERE id = ?`
      )
        .bind(materialId)
        .first() as { id: string; praise_id: string; type: string; r2_key: string | null } | null;

      if (!row) return c.json({ error: 'Material not found' }, 404);
      if (row.type !== 'chord') return c.json({ error: 'Material is not a chord' }, 400);
      if (!row.r2_key) return c.json({ error: 'Material has no r2_key' }, 400);

      // Confere e grava na MESMA instrução, como o PATCH do louvor já faz. O
      // cliente relia o arquivo e comparava antes de gravar: entre a comparação
      // e o PUT cabia outra gravação. Sem If-Match, grava como antes — o PLPCG e
      // o review-app não mandam o header.
      const opcoes: R2PutOptions = {
        httpMetadata: { contentType: rawContentType.trim() || 'text/plain; charset=utf-8' },
      };
      const ifMatch = normalizarIfMatch(c.req.header('if-match'));
      if (ifMatch) opcoes.onlyIf = { etagMatches: ifMatch };

      const gravado = (await c.env.ASSETS.put(
        storageKeyFor(row.r2_key),
        body,
        opcoes
      )) as R2Object | null;

      // Só com onlyIf o R2 devolve null, e é aí que null significa "outra
      // gravação chegou primeiro". Sem If-Match, o retorno não carrega decisão.
      if (ifMatch && !gravado) {
        return c.json(
          {
            error: 'A cifra foi alterada por outra pessoa. Recarregue antes de salvar.',
            code: 'stale_write',
          },
          409
        );
      }

      // Trocar o conteúdo apaga a marca de revisão, SEMPRE. A migração 015 diz
      // que a marca existe para saber o que ainda precisa de olho humano; texto
      // novo nunca teve esse olho, venha de quem vier. Condicionar a marca ao
      // autor seria adivinhar que reler o próprio texto conta como revisar.
      await c.env.DB.prepare(
        `UPDATE praise_materials
            SET is_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL
          WHERE id = ?`
      )
        .bind(row.id)
        .run();

      // O token de upload é segredo estático compartilhado e não tem identidade:
      // sem este registro, qualquer cifra podia ser substituída sem rastro de
      // quando, por quem, nem de que tamanho.
      const autor = c.get('user') as AuthUser | undefined;
      console.log(
        JSON.stringify({
          msg: 'material.content.write',
          material_id: row.id,
          praise_id: row.praise_id,
          bytes: new TextEncoder().encode(body).byteLength,
          credential: autor ? 'session' : 'token',
          sub: autor?.sub ?? null,
        })
      );

      // Sem o ETag novo o cliente não consegue salvar duas vezes seguidas.
      if (gravado?.httpEtag) c.header('ETag', gravado.httpEtag);

      return c.json({
        ok: true,
        material_id: row.id,
        praise_id: row.praise_id,
        r2_key: row.r2_key,
      });
    } catch (error) {
      console.error('Error uploading chord content:', error);
      return c.json({ error: 'Failed to upload content' }, 500);
    }
  });

  // PATCH /api/materials/:materialId - Update a material (admin)
  app.patch('/api/materials/:materialId', requireAuth, async (c) => {
    const materialId = c.req.param('materialId');
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const sets: string[] = [];
    const bindings: (string | number | null)[] = [];

    let categoriaNova: string | undefined;
    if ('material_kind' in body) {
      if (body.material_kind !== null && typeof body.material_kind !== 'string') {
        return c.json({ error: "Field 'material_kind' must be a string" }, 400);
      }
      if (typeof body.material_kind === 'string') categoriaNova = body.material_kind;
      sets.push(`material_kind = ?`);
      bindings.push(body.material_kind);
    }

    if ('type' in body) {
      // Aqui só havia `typeof !== 'string'`. As rotas de CRIAÇÃO já passavam por
      // isSafeMaterialType; a edição ficou de fora quando a travessia via `type`
      // foi fechada. E o `type` vira extensão da chave do R2 e da entrada do ZIP
      // servido por GET /api/praises/:id/download.zip, que é rota pública.
      if (!isSafeMaterialType(body.type)) {
        return c.json({ error: "Field 'type' must be a safe material type" }, 400);
      }
      sets.push(`type = ?`);
      bindings.push(body.type);
    }

    // A decisão sobre r2_key depende da linha que está no banco, então fica para
    // depois do SELECT; aqui só a validação de forma.
    let urlNova: string | null | undefined;
    if ('url' in body) {
      if (body.url !== null && typeof body.url !== 'string') {
        return c.json({ error: "Field 'url' must be a string" }, 400);
      }
      const trimmed = typeof body.url === 'string' ? body.url.trim() : null;
      const valor: string | null = trimmed && trimmed.length > 0 ? trimmed : null;
      urlNova = valor;
      sets.push(`url = ?`);
      bindings.push(valor);
    }

    if (categoriaNova !== undefined) {
      // As três rotas de criação já validavam contra o catálogo; a edição ficou de
      // fora, e material com categoria inexistente some dos filtros por categoria.
      const foraDoCatalogo = await materialKindsForaDoCatalogo(c.env.DB, [categoriaNova]);
      if (foraDoCatalogo.length > 0) {
        return c.json({ error: erroDeCategoriaDesconhecida(foraDoCatalogo) }, 400);
      }
    }

    if ('is_reviewed' in body) {
      if (typeof body.is_reviewed !== 'boolean') {
        return c.json({ error: "Field 'is_reviewed' must be a boolean" }, 400);
      }
      // quem marcou e quando andam junto com a marca: sem isso, "revisado" não
      // diz de quem foi o olho que passou ali
      sets.push(`is_reviewed = ?`);
      bindings.push(body.is_reviewed ? 1 : 0);
      sets.push(`reviewed_at = ?`);
      bindings.push(body.is_reviewed ? new Date().toISOString() : null);
      sets.push(`reviewed_by = ?`);
      const actor = (c.get('user') as AuthUser | undefined) ?? undefined;
      bindings.push(body.is_reviewed ? (actor?.email ?? actor?.name ?? actor?.sub ?? null) : null);
    }

    if (sets.length === 0) return c.json({ error: 'No fields to update' }, 400);

    try {
      const row = await c.env.DB.prepare(`SELECT praise_id, type, r2_key FROM praise_materials WHERE id = ?`)
        .bind(materialId)
        .first<Pick<MaterialRow, 'praise_id' | 'type' | 'r2_key'>>();
      if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

      // `SET url = ?, r2_key = NULL` sumia com o ponteiro do banco e NÃO apagava
      // o objeto: o .chord ficava órfão no R2 e sem volta. Entre apagar o objeto
      // (best-effort, como o DELETE) e recusar, recusamos: um PATCH de metadado
      // não pode ser o caminho para destruir o único arquivo de uma cifra, ainda
      // mais um best-effort que pode falhar em silêncio. O DELETE já faz as duas
      // limpezas juntas para quem realmente quer se livrar do material.
      if (urlNova && row.r2_key) {
        return c.json(
          {
            error:
              'Este material tem arquivo guardado. Remova o material antes de trocá-lo por um link.',
          },
          400
        );
      }
      if (urlNova) sets.push(`r2_key = NULL`);

      // Enforce: if type is youtube, url must be a valid youtube url
      //
      // O tipo do corpo é opcional; sem ele quem manda é o tipo que já está no
      // banco. Antes, `newType` ficava null quando o corpo não trazia 'type', e
      // um PATCH só com url num material youtube não passava por validação
      // nenhuma: o card continuava com o selo do YouTube apontando para
      // qualquer host. Só validamos quando a url está sendo mexida ou quando o
      // próprio corpo declara youtube — marcar revisado não vira erro de url.
      const tipoNoCorpo = 'type' in body ? (typeof body.type === 'string' ? body.type : null) : undefined;
      const tipoEfetivo = tipoNoCorpo === undefined ? (row.type as string | null) : tipoNoCorpo;
      if (tipoEfetivo === 'youtube' && (urlNova !== undefined || tipoNoCorpo === 'youtube')) {
        const effectiveUrl = urlNova ?? undefined;
        if (!effectiveUrl || effectiveUrl.length === 0) return c.json({ error: "Field 'url' is required for type youtube" }, 400);
        try {
          const parsed = new URL(effectiveUrl);
          const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
          const ok = host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
          if (!ok) return c.json({ error: 'Invalid YouTube URL' }, 400);
        } catch {
          return c.json({ error: 'Invalid YouTube URL' }, 400);
        }
      }

      await c.env.DB.prepare(`UPDATE praise_materials SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...bindings, materialId)
        .run();

      const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error updating material:', error);
      return c.json({ error: 'Failed to update material' }, 500);
    }
  });

  // DELETE /api/materials/:materialId - Delete a material (admin)
  app.delete('/api/materials/:materialId', requireAuth, async (c) => {
    const materialId = c.req.param('materialId');
    try {
      const row = await c.env.DB.prepare(`SELECT praise_id, r2_key FROM praise_materials WHERE id = ?`)
        .bind(materialId)
        .first<Pick<MaterialRow, 'praise_id' | 'r2_key'>>();
      if (!row?.praise_id) return c.json({ error: 'Material not found' }, 404);

      await c.env.DB.prepare(`DELETE FROM praise_materials WHERE id = ?`).bind(materialId).run();

      if (row.r2_key) {
        try {
          await c.env.ASSETS.delete(storageKeyFor(row.r2_key));
        } catch (e) {
          // Best-effort cleanup
          console.warn('Failed to delete R2 object:', e);
        }
      }

      const res = await app.request(`/api/praises/${row.praise_id}`, { method: 'GET' }, c.env);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error deleting material:', error);
      return c.json({ error: 'Failed to delete material' }, 500);
    }
  });

  // GET /assets/* - Serve files from R2
}
