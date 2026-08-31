import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { PraiseZipTooLargeError, buildPraiseZipStream } from '../praiseZip';
import {
  erroDeCategoriaDesconhecida,
  labelFor,
  loadMaterialKindLabels,
  materialKindsForaDoCatalogo,
} from '../materialKindLabels';
import { listPlpcgPraises, parsePlpcgListQuery } from '../plpcgPraises';
import type { App, Env } from '../env';
import { requireAuth } from '../middleware';
import { parseFiltrosDeLista, parseListNumbers } from '../queryParams';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_ITEMS, isSafeMaterialType } from '../uploadLimits';
import { storageKeyFor } from '../storageKeys';
import {
  TAG_LABEL_SQL,
  VALID_SORT_FIELDS,
  buildOrderClause,
  buildWhereClause,
  isFtsError,
  resolveTagFilterGroups,
  tagHasChildren,
  type PraiseResult,
  type SortField,
  type TagRow,
} from '../praiseQuery';

/** Louvores: leitura, escrita, mesclagem e materiais do louvor. */
export function registerPraisesRoutes(app: App): void {
  app.get('/api/praises', async (c) => {
    const search = c.req.query('q') || '';
    const numeros = parseListNumbers({
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      numberMin: c.req.query('numberMin'),
      numberMax: c.req.query('numberMax'),
    });
    if (!numeros.ok) return c.json({ error: numeros.error }, 400);
    const { page, limit, offset, numberMin, numberMax } = numeros;

    const tags = c.req.query('tags') ? c.req.query('tags')!.split(',').filter(Boolean) : undefined;
    const rhythm = c.req.query('rhythm') ? c.req.query('rhythm')!.split(',').filter(Boolean) : undefined;
    const tonality = c.req.query('tonality') ? c.req.query('tonality')!.split(',').filter(Boolean) : undefined;
    const category = c.req.query('category') ? c.req.query('category')!.split(',').filter(Boolean) : undefined;
    const materialKinds = c.req.query('materialKinds')
      ? c.req.query('materialKinds')!.split(',').filter(Boolean)
      : undefined;

    const sortParam = c.req.query('sort') as SortField | undefined;
    const sort = VALID_SORT_FIELDS.includes(sortParam!) ? sortParam! : 'number';
    const order = c.req.query('order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let useFtsAttempt = Boolean(search);

    for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const tagGroups =
        tags && tags.length > 0 ? await resolveTagFilterGroups(c.env.DB, tags) : undefined;

      const { clause: whereClause, bindings: whereBindings } = buildWhereClause({
        search: search || undefined,
        useFts: useFtsAttempt,
        tagGroups,
        rhythm,
        tonality,
        category,
        materialKinds,
        numberMin,
        numberMax,
      });

      const { clause: orderClause, bindings: orderBindings } = buildOrderClause(
        sort,
        order,
        search || undefined
      );
      const bindings: (string | number)[] = [...whereBindings, ...orderBindings];

      const query = `
        SELECT
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics, p.group_id,
          GROUP_CONCAT(DISTINCT pt.tag_id) as tag_ids,
          GROUP_CONCAT(DISTINCT ${TAG_LABEL_SQL}) as tag_names
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        LEFT JOIN tags tp ON t.parent_id = tp.id
        ${whereClause}
        GROUP BY p.id
        ${orderClause}
        LIMIT ? OFFSET ?
      `;
      bindings.push(limit, offset);

      const result = await c.env.DB.prepare(query).bind(...bindings).all();

      let countQuery: string;
      let countBindings: (string | number)[] = [...whereBindings];

      if (whereClause) {
        countQuery = `SELECT COUNT(*) as total FROM praises p ${whereClause}`;
      } else {
        countQuery = `SELECT COUNT(*) as total FROM praises`;
        countBindings = [];
      }

      const countResult = await c.env.DB.prepare(countQuery).bind(...countBindings).first();
      const total = (countResult?.total as number) || 0;

      return c.json({
        data: result.results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      if (useFtsAttempt && search && isFtsError(error)) {
        useFtsAttempt = false;
        console.warn(
          JSON.stringify({
            msg: 'api.praises.fts_fallback',
            error: error instanceof Error ? error.message : String(error),
          })
        );
        continue;
      }
      console.error('Error fetching praises:', error);
      return c.json({ error: 'Failed to fetch praises' }, 500);
    }
    }

    return c.json({ error: 'Failed to fetch praises' }, 500);
  });

  // GET /api/plpcg/praises - Lightweight list for PLPCG (no lyrics text; slim materials)
  app.get('/api/plpcg/praises', async (c) => {
    try {
      const parsed = parsePlpcgListQuery(c);
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const query = parsed.query;
      const result = await listPlpcgPraises(c.env.DB, query, {
        buildWhereClause,
        buildOrderClause: (sort, order, search) =>
          buildOrderClause(sort as SortField, order, search),
        validSortFields: VALID_SORT_FIELDS,
        resolveTagFilterGroups,
        tagLabelSql: TAG_LABEL_SQL,
      });
      return c.json(result);
    } catch (error) {
      console.error('Error fetching PLPCG praises:', error);
      return c.json({ error: 'Failed to fetch praises' }, 500);
    }
  });

  // GET /api/praises/filters - Get filter options
  app.get('/api/praises/filters', async (c) => {
    // As opções eram globais: a tela oferecia um ritmo que, combinado com a
    // categoria já escolhida, dava zero resultados. Agora cada dimensão é
    // contada sob os DEMAIS filtros — ignorando o próprio, senão escolher
    // "Valsa" apagaria os outros ritmos da lista e não haveria como trocar
    // para "Marcha" sem limpar o filtro antes.
    const parsed = parseFiltrosDeLista((k) => c.req.query(k));
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);
    const { filtros } = parsed;

    try {
      const gruposDeTags =
        filtros.tags && filtros.tags.length > 0
          ? await resolveTagFilterGroups(c.env.DB, filtros.tags)
          : undefined;

      /** Cláusula com todos os filtros menos o da dimensão pedida. */
      const exceto = (dimensao: keyof typeof filtros | 'tags') => {
        const { clause, bindings } = buildWhereClause({
          search: filtros.search,
          useFts: false,
          tagGroups: dimensao === 'tags' ? undefined : gruposDeTags,
          rhythm: dimensao === 'rhythm' ? undefined : filtros.rhythm,
          tonality: dimensao === 'tonality' ? undefined : filtros.tonality,
          category: dimensao === 'category' ? undefined : filtros.category,
          materialKinds: filtros.materialKinds,
          numberMin: filtros.numberMin,
          numberMax: filtros.numberMax,
        });
        return { clause, bindings };
      };

      const valoresDe = (coluna: 'rhythm' | 'tonality' | 'category') => {
        const { clause, bindings } = exceto(coluna);
        const prefixo = clause ? `${clause} AND ` : 'WHERE ';
        const sql = `SELECT DISTINCT ${coluna} FROM praises p ${prefixo}p.${coluna} IS NOT NULL AND p.${coluna} != '' ORDER BY ${coluna}`;
        return c.env.DB.prepare(sql).bind(...bindings).all();
      };

      const tagsComContagem = () => {
        const { clause, bindings } = exceto('tags');
        const prefixo = clause ? `${clause} AND ` : 'WHERE ';
        const sql = `
          SELECT
            t.id,
            t.name,
            t.parent_id,
            (
              SELECT COUNT(DISTINCT pt.praise_id)
              FROM praise_tags pt
              JOIN praises p ON p.id = pt.praise_id
              ${prefixo}(
                pt.tag_id = t.id
                OR pt.tag_id IN (SELECT filho.id FROM tags filho WHERE filho.parent_id = t.id)
              )
            ) AS count
          FROM tags t
          ORDER BY t.name
        `;
        return c.env.DB.prepare(sql).bind(...bindings).all();
      };

      const [rhythmsResult, tonalitiesResult, categoriesResult, tagsResult] = await Promise.all([
        valoresDe('rhythm'),
        valoresDe('tonality'),
        valoresDe('category'),
        tagsComContagem(),
      ]);

      const tagRows =
        (tagsResult.results as { id: string; name: string; parent_id: string | null; count: number }[]) ?? [];

      return c.json({
        rhythms: (rhythmsResult.results as { rhythm: string }[]).map((r) => r.rhythm),
        tonalities: (tonalitiesResult.results as { tonality: string }[]).map((r) => r.tonality),
        categories: (categoriesResult.results as { category: string }[]).map((r) => r.category),
        tags: tagRows.map((t) => ({
          id: t.id,
          name: t.name,
          parent_id: t.parent_id ?? null,
          count: Number(t.count),
        })),
      });
    } catch (error) {
      console.error('Error fetching filters:', error);
      return c.json({ error: 'Failed to fetch filters' }, 500);
    }
  });

  // GET /api/praises/:id/download.zip - Public ZIP export (metadata.yml + materials)
  app.get('/api/praises/:id/download.zip', async (c) => {
    const id = c.req.param('id');

    try {
      const result = await buildPraiseZipStream(c.env.DB, c.env.ASSETS, id);
      if (!result) {
        return c.json({ error: 'Praise not found' }, 404);
      }

      const encodedFilename = encodeURIComponent(result.filename);
      const safeFilename = result.filename.replace(/"/g, '');
      return new Response(result.stream, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        },
      });
    } catch (error) {
      if (error instanceof PraiseZipTooLargeError) {
        return c.json({ error: error.message }, 413);
      }
      console.error('Error building praise ZIP:', error);
      return c.json({ error: 'Failed to build download' }, 500);
    }
  });

  // GET /api/praises/:id - Get single praise with materials
  app.get('/api/praises/:id', async (c) => {
    const id = c.req.param('id');

    try {
      // Fetch praise with tags
      const praiseQuery = `
        SELECT 
          p.id, p.name, p.number, p.author, p.rhythm, p.tonality, p.category, p.lyrics, p.group_id,
          p.updated_at,
          GROUP_CONCAT(pt.tag_id) as tag_ids
        FROM praises p
        LEFT JOIN praise_tags pt ON p.id = pt.praise_id
        WHERE p.id = ?
        GROUP BY p.id
      `;
      const praiseResult = await c.env.DB.prepare(praiseQuery).bind(id).first() as PraiseResult | null;

      if (!praiseResult) {
        return c.json({ error: 'Praise not found' }, 404);
      }

      // Fetch materials for this praise
      const materialsQuery = `
        SELECT 
          pm.id, pm.praise_id, pm.material_kind, pm.type, pm.r2_key, pm.file_path_legacy,
          pm.source_material_id, pm.merged_from_praise_id, pm.url,
          pm.is_reviewed, pm.reviewed_at, pm.reviewed_by,
          mp.name AS merged_from_praise_name
        FROM praise_materials pm
        LEFT JOIN praises mp ON mp.id = pm.merged_from_praise_id
        WHERE pm.praise_id = ?
      `;
      const materialsResult = await c.env.DB.prepare(materialsQuery).bind(id).all();

      // Fetch tag names (with parent for display)
      const tagIds = praiseResult.tag_ids ? praiseResult.tag_ids.split(',') : [];
      let tags: TagRow[] = [];
    
      if (tagIds.length > 0) {
        const placeholders = tagIds.map(() => '?').join(',');
        const tagsQuery = `
          SELECT t.id, t.name, t.parent_id, tp.name as parent_name
          FROM tags t
          LEFT JOIN tags tp ON t.parent_id = tp.id
          WHERE t.id IN (${placeholders})
        `;
        const tagsResult = await c.env.DB.prepare(tagsQuery).bind(...tagIds).all();
        tags = (tagsResult.results as TagRow[]).map((t) => ({
          id: t.id,
          name: t.name,
          parent_id: t.parent_id ?? null,
          parent_name: t.parent_name ?? null,
        }));
      }

      let group_members: { id: string; tags: TagRow[] }[] = [];
      if (praiseResult.group_id) {
        const membersResult = await c.env.DB.prepare(
          `SELECT p.id,
                  GROUP_CONCAT(pt.tag_id) as tag_ids,
                  GROUP_CONCAT(${TAG_LABEL_SQL}) as tag_names
           FROM praises p
           LEFT JOIN praise_tags pt ON p.id = pt.praise_id
           LEFT JOIN tags t ON pt.tag_id = t.id
           LEFT JOIN tags tp ON t.parent_id = tp.id
           WHERE p.group_id = ? AND p.id != ?
           GROUP BY p.id
           ORDER BY p.name, p.number`
        ).bind(praiseResult.group_id, id).all();

        group_members = (membersResult.results as { id: string; tag_ids: string | null; tag_names: string | null }[]).map(
          (m) => {
            const ids = m.tag_ids ? m.tag_ids.split(',') : [];
            const names = m.tag_names ? m.tag_names.split(',') : [];
            return {
              id: m.id,
              tags: ids.map((tid, i) => ({
                id: tid,
                name: names[i] || tid,
                parent_id: null,
              })),
            };
          }
        );
      }

      const materialKindLabels = await loadMaterialKindLabels(c.env.DB);

      // O r2_key está preenchido em 100% dos registros de cifra, inclusive nos que
      // nunca tiveram arquivo publicado — só o R2 sabe quais existem de verdade.
      // Sem isto, o card de cifra na UI prometeria conteúdo que não existe.
      const materials = await Promise.all(
        (materialsResult.results as any[]).map(async m => {
          const base = {
            ...m,
            material_kind_name: labelFor(materialKindLabels, m.material_kind),
          };
          if (m.type !== 'chord') return base;
          if (!m.r2_key) return { ...base, has_content: false };
          // Cada head com catch PRÓPRIO. Estes heads rodavam dentro do try do
          // handler: um soluço do R2 tirava o louvor inteiro do ar — nome, letra,
          // tags e todos os materiais — por causa de uma flag opcional. Sem
          // resposta, has_content sai do JSON e o cliente decide o que mostrar.
          try {
            const object = await c.env.ASSETS.head(storageKeyFor(m.r2_key));
            return { ...base, has_content: object !== null };
          } catch (error) {
            console.warn(
              JSON.stringify({
                msg: 'praise.has_content.head_failed',
                material_id: m.id,
                detail: String(error),
              })
            );
            return { ...base, has_content: undefined };
          }
        })
      );

      return c.json({
        data: {
          ...praiseResult,
          tag_ids: tagIds,
          tags,
          materials,
          group_members,
        },
      });
    } catch (error) {
      console.error('Error fetching praise:', error);
      return c.json({ error: 'Failed to fetch praise' }, 500);
    }
  });

  // GET /api/materials/kinds - List all material kinds

  app.post('/api/praises', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const name = body.name;
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: "Field 'name' is required" }, 400);
    }

    const optionalFields = ['number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
    const fieldValues: Record<(typeof optionalFields)[number], string | null> = {
      number: null,
      author: null,
      rhythm: null,
      tonality: null,
      category: null,
      lyrics: null,
    };

    for (const key of optionalFields) {
      if (!(key in body)) continue;
      const val = body[key];
      if (val === null || val === undefined) {
        fieldValues[key] = null;
        continue;
      }
      if (typeof val !== 'string') {
        return c.json({ error: `Field '${key}' must be a string` }, 400);
      }
      fieldValues[key] = val;
    }

    let tagIds: string[] = [];
    if ('tag_ids' in body) {
      if (!Array.isArray(body.tag_ids)) {
        return c.json({ error: "Field 'tag_ids' must be an array" }, 400);
      }
      tagIds = body.tag_ids.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    }

    const id = crypto.randomUUID();

    try {
      await c.env.DB.prepare(
        `INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        name.trim(),
        fieldValues.number,
        fieldValues.author,
        fieldValues.rhythm,
        fieldValues.tonality,
        fieldValues.category,
        fieldValues.lyrics
      ).run();

      for (const tagId of tagIds) {
        const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
        if (!tag) return c.json({ error: 'Tag not found' }, 400);
        if (await tagHasChildren(c.env.DB, tagId)) {
          return c.json({ error: 'Cannot attach a parent tag; use a subtag' }, 400);
        }

        await c.env.DB.prepare(
          'INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)'
        ).bind(id, tagId).run();
      }
    } catch (error) {
      console.error('Error creating praise:', error);
      return c.json({ error: 'Failed to create praise' }, 500);
    }

    try {
      const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as Env);
      const json = await res.json();
      return c.json(json, res.status === 200 ? 201 : (res.status as ContentfulStatusCode));
    } catch (error) {
      console.error('Error re-fetching praise after create:', error);
      return c.json({ ok: true }, 201);
    }
  });

  // PATCH /api/praises/:id - Update praise fields (admin)
  app.patch('/api/praises/:id', requireAuth, async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as any;
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    // Token de versão, opcional: a tela lê o updated_at ao abrir e devolve aqui.
    // Ausente = grava como sempre gravou — o PLPCG consome esta mesma API e não
    // manda o campo.
    const ifUpdatedAt = body.if_updated_at;
    const conferirVersao = ifUpdatedAt !== undefined;
    if (conferirVersao && (typeof ifUpdatedAt !== 'string' || !ifUpdatedAt)) {
      return c.json({ error: "Field 'if_updated_at' must be a non-empty string" }, 400);
    }

    const updatable = ['name', 'number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
    const sets: string[] = [];
    const bindings: (string | null)[] = [];

    for (const key of updatable) {
      if (!(key in body)) continue;
      const val = body[key];

      // O nome é o único campo que não pode ficar vazio. O POST já exigia isso;
      // o PATCH aceitava null para qualquer campo, e as duas rotas discordavam
      // sobre o mesmo dado — dava para deixar um louvor sem nome no acervo.
      if (key === 'name') {
        if (typeof val !== 'string' || !val.trim()) {
          return c.json({ error: "Field 'name' must be a non-empty string" }, 400);
        }
        sets.push('name = ?');
        bindings.push(val.trim());
        continue;
      }

      if (val === null || val === undefined) {
        sets.push(`${key} = ?`);
        bindings.push(null);
        continue;
      }
      if (typeof val !== 'string') {
        return c.json({ error: `Field '${key}' must be a string` }, 400);
      }
      sets.push(`${key} = ?`);
      bindings.push(val);
    }

    if (sets.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    try {
      // Conferir e gravar na MESMA instrução: um SELECT seguido de UPDATE só
      // mudaria a corrida de lugar — dá para outra gravação entrar entre os dois.
      const sql = `UPDATE praises SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?${
        conferirVersao ? ' AND updated_at = ?' : ''
      }`;
      const escrita = await c.env.DB.prepare(sql)
        .bind(...bindings, id, ...(conferirVersao ? [ifUpdatedAt as string] : []))
        .run();

      if (conferirVersao && (escrita.meta?.changes ?? 0) === 0) {
        // Nenhuma linha atingida: ou o louvor sumiu, ou alguém gravou entre a
        // abertura da tela e o save. Só aqui, no caminho de exceção, vale ler.
        const existe = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(id).first();
        if (!existe) return c.json({ error: 'Praise not found' }, 404);
        return c.json(
          {
            error: 'O louvor foi alterado por outra pessoa. Recarregue a página.',
            code: 'stale_write',
          },
          409
        );
      }
    } catch (error) {
      console.error('Error updating praise:', error);
      return c.json({ error: 'Failed to update praise' }, 500);
    }

    // Return updated detail (same shape as GET /api/praises/:id)
    try {
      const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error re-fetching praise after update:', error);
      return c.json({ ok: true });
    }
  });

  // POST /api/praises/:id/group - Link this praise into another's group (admin)
  app.post('/api/praises/:id/group', requireAuth, async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null) as { praise_id?: unknown } | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const targetId = body.praise_id;
    if (typeof targetId !== 'string' || !targetId.trim()) {
      return c.json({ error: "Field 'praise_id' is required" }, 400);
    }
    if (targetId === id) {
      return c.json({ error: 'Cannot group a praise with itself' }, 400);
    }

    try {
      const self = await c.env.DB.prepare('SELECT id, group_id FROM praises WHERE id = ?')
        .bind(id)
        .first<{ id: string; group_id: string | null }>();
      if (!self) return c.json({ error: 'Praise not found' }, 404);

      const other = await c.env.DB.prepare('SELECT id, group_id FROM praises WHERE id = ?')
        .bind(targetId)
        .first<{ id: string; group_id: string | null }>();
      if (!other) return c.json({ error: 'Target praise not found' }, 404);

      const gid = other.group_id ?? other.id;
      await c.env.DB.prepare(
        `UPDATE praises SET group_id = ?, updated_at = datetime('now') WHERE id IN (?, ?)`
      )
        .bind(gid, id, targetId)
        .run();
    } catch (error) {
      console.error('Error grouping praises:', error);
      return c.json({ error: 'Failed to group praises' }, 500);
    }

    try {
      const res = await app.request(`/api/praises/${id}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error re-fetching praise after group:', error);
      return c.json({ ok: true });
    }
  });

  // POST /api/praises/:id/tags - Attach a tag to a praise (admin)
  app.post('/api/praises/:id/tags', requireAuth, async (c) => {
    const praiseId = c.req.param('id');
    const body = await c.req.json().catch(() => null) as { tag_id?: unknown } | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const tagId = body.tag_id;
    if (typeof tagId !== 'string' || !tagId.trim()) {
      return c.json({ error: "Field 'tag_id' is required" }, 400);
    }

    try {
      const praise = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(praiseId).first();
      if (!praise) return c.json({ error: 'Praise not found' }, 404);

      const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
      if (!tag) return c.json({ error: 'Tag not found' }, 404);
      if (await tagHasChildren(c.env.DB, tagId)) {
        return c.json({ error: 'Cannot attach a parent tag; use a subtag' }, 400);
      }

      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)'
      ).bind(praiseId, tagId).run();
    } catch (error) {
      console.error('Error adding praise tag:', error);
      return c.json({ error: 'Failed to add tag' }, 500);
    }

    try {
      const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error re-fetching praise after adding tag:', error);
      return c.json({ ok: true });
    }
  });

  /**
   * Arquivos que ficarão órfãos ao apagar um louvor: os materiais que ainda
   * pertencem a ele, tirando os que estão sendo movidos para outro.
   *
   * Precisa ser lido ANTES da escrita: depois do DELETE, a cascata de
   * praise_materials já levou as linhas e não há mais como saber quais chaves
   * do R2 ficaram sem dono.
   */
  async function chavesQueFicaraoOrfas(
    env: Env,
    praiseId: string,
    idsQueSaem: string[]
  ): Promise<string[]> {
    const excecao =
      idsQueSaem.length > 0 ? ` AND id NOT IN (${idsQueSaem.map(() => '?').join(',')})` : '';
    const materiais = await env.DB.prepare(
      `SELECT id, r2_key FROM praise_materials WHERE praise_id = ?${excecao}`
    )
      .bind(praiseId, ...idsQueSaem)
      .all();
    return ((materiais.results as { r2_key: string | null }[]) ?? [])
      .map((m) => m.r2_key)
      .filter((k): k is string => Boolean(k));
  }

  /**
   * Limpeza best-effort do R2, feita SÓ depois de o banco confirmar.
   *
   * Falhar aqui deixa arquivo órfão — desperdício de espaço, recuperável. A
   * ordem inversa, que era a de antes, destruía o arquivo e deixava a linha
   * apontando para o vazio. Nenhum armazenamento de objetos participa da
   * transação do D1, então a escolha real é qual lado fica inconsistente.
   */
  async function apagarDoR2(env: Env, chaves: string[]): Promise<void> {
    for (const chave of chaves) {
      try {
        await env.ASSETS.delete(`storage/${chave}`);
      } catch (e) {
        console.warn(JSON.stringify({ msg: 'r2.delete.failed', key: chave, error: String(e) }));
      }
    }
  }

  // POST /api/praises/:keeperId/merge - Merge duplicate praise into keeper (admin)
  app.post('/api/praises/:keeperId/merge', requireAuth, async (c) => {
    const keeperId = c.req.param('keeperId');
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const sourcePraiseId = body.source_praise_id;
    if (typeof sourcePraiseId !== 'string' || !sourcePraiseId.trim()) {
      return c.json({ error: "Field 'source_praise_id' is required" }, 400);
    }
    const sourceId = sourcePraiseId.trim();
    if (sourceId === keeperId) {
      return c.json({ error: 'Cannot merge a praise into itself' }, 400);
    }

    const metadata = body.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return c.json({ error: "Field 'metadata' is required" }, 400);
    }

    const metaObj = metadata as Record<string, unknown>;
    const updatable = ['name', 'number', 'author', 'rhythm', 'tonality', 'category', 'lyrics'] as const;
    const metaValues: Record<(typeof updatable)[number], string | null> = {
      name: null,
      number: null,
      author: null,
      rhythm: null,
      tonality: null,
      category: null,
      lyrics: null,
    };

    for (const key of updatable) {
      if (!(key in metaObj)) {
        return c.json({ error: `Field 'metadata.${key}' is required` }, 400);
      }
      const val = metaObj[key];
      if (key === 'name') {
        if (typeof val !== 'string' || !val.trim()) {
          return c.json({ error: "Field 'metadata.name' is required" }, 400);
        }
        metaValues[key] = val.trim();
        continue;
      }
      if (val === null || val === undefined) {
        metaValues[key] = null;
        continue;
      }
      if (typeof val !== 'string') {
        return c.json({ error: `Field 'metadata.${key}' must be a string` }, 400);
      }
      metaValues[key] = val;
    }

    let tagIds: string[] = [];
    if (!('tag_ids' in body) || !Array.isArray(body.tag_ids)) {
      return c.json({ error: "Field 'tag_ids' must be an array" }, 400);
    }
    tagIds = body.tag_ids.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

    let materialIdsToImport: string[] = [];
    if (!('material_ids_to_import' in body) || !Array.isArray(body.material_ids_to_import)) {
      return c.json({ error: "Field 'material_ids_to_import' must be an array" }, 400);
    }
    materialIdsToImport = body.material_ids_to_import.filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );

    try {
      const keeper = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(keeperId).first();
      if (!keeper) return c.json({ error: 'Keeper praise not found' }, 404);

      const source = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(sourceId).first();
      if (!source) return c.json({ error: 'Source praise not found' }, 404);

      // A lista que chega é a união das tags dos dois louvores, então as tags
      // que o keeper JÁ tinha voltam aqui. Uma delas virar tag pai (alguém criou
      // uma subtag depois) não é tentativa nova de associar tag pai: é dado
      // preexistente, e recusar matava toda mesclagem daquele louvor. Tag pai
      // vinda só do louvor fonte continua barrada — aí a associação é nova.
      const jaNoKeeper = new Set(
        (
          (
            await c.env.DB.prepare('SELECT tag_id FROM praise_tags WHERE praise_id = ?')
              .bind(keeperId)
              .all<{ tag_id: string }>()
          ).results ?? []
        ).map((linha) => linha.tag_id)
      );

      for (const tagId of tagIds) {
        const tag = await c.env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(tagId).first();
        if (!tag) return c.json({ error: 'Tag not found' }, 400);
        if (jaNoKeeper.has(tagId)) continue;
        if (await tagHasChildren(c.env.DB, tagId)) {
          // Sem o nome não havia como saber qual das tags do lote era a culpada.
          const nome = await c.env.DB.prepare('SELECT name FROM tags WHERE id = ?')
            .bind(tagId)
            .first<{ name: string }>();
          return c.json(
            { error: `Cannot attach a parent tag; use a subtag: ${nome?.name ?? tagId}` },
            400
          );
        }
      }

      for (const materialId of materialIdsToImport) {
        const mat = await c.env.DB.prepare(
          'SELECT id, praise_id FROM praise_materials WHERE id = ?'
        ).bind(materialId).first() as { id: string; praise_id: string } | null;
        if (!mat) {
          return c.json({ error: `Material not found: ${materialId}` }, 409);
        }
        if (mat.praise_id !== sourceId) {
          return c.json({ error: `Material ${materialId} does not belong to source praise` }, 409);
        }
      }

      // Lido antes da escrita: depois do DELETE a cascata já levou as linhas.
      const orfas = await chavesQueFicaraoOrfas(c.env, sourceId, materialIdsToImport);

      // Fase 1 — banco, tudo ou nada. O D1 executa o lote em transação: se um
      // statement falha, a sequência inteira é revertida. Antes eram cinco
      // escritas soltas, e falhar entre a segunda e a terceira deixava o keeper
      // sem nenhuma tag.
      await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE praises SET name = ?, number = ?, author = ?, rhythm = ?, tonality = ?, category = ?, lyrics = ?,
           updated_at = datetime('now') WHERE id = ?`
        ).bind(
          metaValues.name,
          metaValues.number,
          metaValues.author,
          metaValues.rhythm,
          metaValues.tonality,
          metaValues.category,
          metaValues.lyrics,
          keeperId
        ),
        // As tags do keeper passam a ser exatamente a lista recebida: apaga e
        // repõe. Lista vazia deixa o louvor sem tag, e isso é deliberado — é
        // como a tela de merge expressa "nenhuma tag no resultado".
        c.env.DB.prepare('DELETE FROM praise_tags WHERE praise_id = ?').bind(keeperId),
        ...tagIds.map((tagId) =>
          c.env.DB
            .prepare('INSERT OR IGNORE INTO praise_tags (praise_id, tag_id) VALUES (?, ?)')
            .bind(keeperId, tagId)
        ),
        ...materialIdsToImport.map((materialId) =>
          c.env.DB
            .prepare(
              `UPDATE praise_materials SET praise_id = ?, merged_from_praise_id = ? WHERE id = ? AND praise_id = ?`
            )
            .bind(keeperId, sourceId, materialId, sourceId)
        ),
        c.env.DB.prepare('DELETE FROM praises WHERE id = ?').bind(sourceId),
      ]);

      // Fase 2 — só depois do commit.
      await apagarDoR2(c.env, orfas);
    } catch (error) {
      console.error('Error merging praises:', error);
      return c.json({ error: 'Failed to merge praises' }, 500);
    }

    try {
      const res = await app.request(`/api/praises/${keeperId}`, { method: 'GET' }, c.env as Env);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error re-fetching praise after merge:', error);
      return c.json({ ok: true });
    }
  });

  // DELETE /api/praises/:id/tags/:tagId - Detach a tag from a praise (admin)
  app.delete('/api/praises/:id/tags/:tagId', requireAuth, async (c) => {
    const praiseId = c.req.param('id');
    const tagId = c.req.param('tagId');

    try {
      const praise = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?').bind(praiseId).first();
      if (!praise) return c.json({ error: 'Praise not found' }, 404);

      await c.env.DB.prepare(
        'DELETE FROM praise_tags WHERE praise_id = ? AND tag_id = ?'
      ).bind(praiseId, tagId).run();
    } catch (error) {
      console.error('Error removing praise tag:', error);
      return c.json({ error: 'Failed to remove tag' }, 500);
    }

    try {
      const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
      const json = await res.json();
      return c.json(json, res.status as ContentfulStatusCode);
    } catch (error) {
      console.error('Error re-fetching praise after removing tag:', error);
      return c.json({ ok: true });
    }
  });

  // POST /api/praises/:id/materials - Create a material (admin, JSON)
  app.post('/api/praises/:id/materials', requireAuth, async (c) => {
    const praiseId = c.req.param('id');
    const body = await c.req.json().catch(() => null) as any;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);

    const material_kind = body.material_kind;
    const type = body.type;
    const url = body.url;

    if (typeof material_kind !== 'string' || !material_kind) return c.json({ error: "Field 'material_kind' is required" }, 400);
    if (!isSafeMaterialType(type)) {
      return c.json({ error: "Field 'type' is required" }, 400);
    }

    const hasUrl = typeof url === 'string' && url.trim().length > 0;
    const isYouTube = (u: string) => {
      try {
        const parsed = new URL(u);
        const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
        return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
      } catch {
        return false;
      }
    };

    if (type === 'youtube') {
      if (!hasUrl) return c.json({ error: "Field 'url' is required for type youtube" }, 400);
      if (!isYouTube(url)) return c.json({ error: 'Invalid YouTube URL' }, 400);
    }

    const foraDoCatalogo = await materialKindsForaDoCatalogo(c.env.DB, [material_kind]);
    if (foraDoCatalogo.length > 0) {
      return c.json({ error: erroDeCategoriaDesconhecida(foraDoCatalogo) }, 400);
    }

    const id = crypto.randomUUID();

    try {
      await c.env.DB.prepare(
        `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        praiseId,
        material_kind,
        type,
        null,
        '',
        null,
        null,
        hasUrl ? url.trim() : null
      ).run();
    } catch (error) {
      console.error('Error creating material:', error);
      return c.json({ error: 'Failed to create material' }, 500);
    }

    const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  });

  // POST /api/praises/:id/materials/bulk-upload - Bulk upload files for a praise (admin, multipart)
  app.post('/api/praises/:id/materials/bulk-upload', requireAuth, async (c) => {
    const praiseId = c.req.param('id');

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: 'Expected multipart/form-data' }, 400);
    }

    const itemsRaw = form.get('items');
    if (typeof itemsRaw !== 'string') return c.json({ error: "Missing 'items' field" }, 400);

    let items: Array<{ key: string; material_kind: string; type: string; file_path_legacy?: string }>;
    try {
      items = JSON.parse(itemsRaw);
      if (!Array.isArray(items)) throw new Error('items must be an array');
    } catch {
      return c.json({ error: 'Invalid items JSON' }, 400);
    }

    if (items.length > MAX_UPLOAD_ITEMS) {
      return c.json({ error: `Máximo de ${MAX_UPLOAD_ITEMS} arquivos por lote` }, 400);
    }

    // O louvor tinha que existir antes de qualquer upload: sem esta leitura os
    // objetos subiam ao R2 e só então o INSERT batia na FK, deixando arquivo
    // órfão. O drive-import já checava; esta rota, não.
    const louvor = await c.env.DB.prepare('SELECT id FROM praises WHERE id = ?')
      .bind(praiseId)
      .first<{ id: string }>();
    if (!louvor) return c.json({ error: 'Praise not found' }, 404);

    // Valida o lote INTEIRO antes de escrever qualquer coisa. O laço antigo
    // validava e gravava item a item: um lote com o segundo item inválido já
    // tinha gravado o primeiro no R2 e no banco.
    const validados: { item: (typeof items)[number]; file: File }[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') return c.json({ error: 'Invalid item' }, 400);
      if (typeof item.key !== 'string') return c.json({ error: "Item missing 'key'" }, 400);
      if (typeof item.material_kind !== 'string' || !item.material_kind) {
        return c.json({ error: "Item missing 'material_kind'" }, 400);
      }
      if (!isSafeMaterialType(item.type)) {
        return c.json(
          { error: `Tipo de material inválido: ${String(item.type).slice(0, 32)}` },
          400
        );
      }

      const fileEntry = form.get(item.key);
      if (fileEntry === null || typeof fileEntry === 'string') {
        return c.json({ error: `Missing file for key ${item.key}` }, 400);
      }
      // Remainder of FormData.get() is File (see Cloudflare FormData typings)
      const file = fileEntry as File;

      if (file.size > MAX_UPLOAD_BYTES) {
        return c.json(
          {
            error: `Arquivo acima do limite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB: ${file.name}`,
          },
          413
        );
      }

      validados.push({ item, file });
    }

    const categoriasInvalidas = await materialKindsForaDoCatalogo(
      c.env.DB,
      validados.map(({ item }) => item.material_kind)
    );
    if (categoriasInvalidas.length > 0) {
      return c.json({ error: erroDeCategoriaDesconhecida(categoriasInvalidas) }, 400);
    }

    // O INSERT precisa da chave do R2, então os objetos sobem primeiro. Como o
    // R2 não participa da transação do D1, guardamos as chaves para desfazer à
    // mão se o banco recusar o lote.
    const subidos: { materialId: string; r2_key: string; item: (typeof items)[number]; file: File }[] = [];
    try {
      for (const { item, file } of validados) {
        const materialId = crypto.randomUUID();
        const r2_key = `assets/praises/${praiseId}/${materialId}.${item.type}`;

        await c.env.ASSETS.put(`storage/${r2_key}`, file.stream(), {
          httpMetadata: {
            contentType: file.type || undefined,
          },
        });
        subidos.push({ materialId, r2_key, item, file });
      }

      // Banco, tudo ou nada. O D1 executa o lote em transação: se um statement
      // falha, a sequência inteira é abortada. Antes era um INSERT solto por
      // arquivo, e cair no arquivo 40 de 60 devolvia 500 com 39 materiais já
      // gravados — o usuário reclicava e ganhava 39 duplicatas.
      await c.env.DB.batch(
        subidos.map(({ materialId, r2_key, item, file }) =>
          c.env.DB.prepare(
            `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, merged_from_praise_id, url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            materialId,
            praiseId,
            item.material_kind,
            item.type,
            r2_key,
            item.file_path_legacy || file.name,
            null,
            null,
            null
          )
        )
      );
    } catch (error) {
      console.error('Error bulk uploading materials:', error);
      // Sem linha no banco, o objeto no R2 é lixo que ninguém mais alcança.
      await apagarDoR2(c.env, subidos.map((s) => s.r2_key));
      return c.json({ error: 'Failed to bulk upload materials' }, 500);
    }

    const res = await app.request(`/api/praises/${praiseId}`, { method: 'GET' }, c.env as any);
    const json = await res.json();
    return c.json(json, res.status as ContentfulStatusCode);
  });

  // --- Google Drive import ---
}
