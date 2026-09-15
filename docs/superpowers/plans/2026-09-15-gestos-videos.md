# Vídeos por gesto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada gesto do dicionário aponta para os vídeos youtube dos louvores em que aparece, com os segundos das ocorrências; o coldigom grava, expõe no dicionário e gere na página do gesto.

**Architecture:** Tabela nova `gesture_video_occurrences` (uma linha por ocorrência, `seconds` nulo = só ligado). Campo aditivo `videos` em cada entrada do contrato `coldigom.gesture-dictionary/1`; toda escrita passa por `escreverNoDicionario` (bump de versão → ETag muda). Duas rotas autenticadas (`PUT`/`DELETE …/videos/:materialId`); a tela usa a busca de louvores existente para escolher o vídeo.

**Tech Stack:** Hono + Cloudflare Workers + D1 (API, vitest com D1 falso por trecho de SQL); React 19 + Vite + Testing Library (web, vitest). `wrangler` global, nunca `npx wrangler`.

**Spec:** `docs/superpowers/specs/2026-09-15-gestos-videos-design.md`

## Global Constraints

- Branch `feat/gestos-videos`, nascida de `feat/gestos-novo-no-seletor` (PR #25). PR para `develop`.
- Toda escrita no dicionário e nas ocorrências vai por `escreverNoDicionario(db, statements)` — nunca `db.batch` direto sem o bump.
- Schema do dicionário continua `coldigom.gesture-dictionary/1`; `videos` é campo aditivo.
- Mensagens de erro da API em inglês (o web traduz); textos da tela em pt-BR.
- Migração aplicada à mão: `cd api && wrangler d1 execute coldigom --remote --file=migrations/020_gesture_videos.sql`. Nunca `wrangler d1 migrations apply`.
- Catraca de cobertura do web (`web/vitest.config.ts`: 91 / 83 / 90 / 94) não pode cair; `npm run verify:strict` na raiz tem que passar antes do PR.
- Commits terminam com:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Aq3JSaYD81hmB6n4pQU9Cy
  ```
- Rodar testes de um lado só: `cd api && npx vitest run <arquivo>` / `cd web && npx vitest run <arquivo>`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/migrations/020_gesture_videos.sql` (criar) | Tabela + índices. |
| `api/src/gestures/dictionaryTypes.ts` (modificar) | `GestureVideo`, `GestureEntry.videos`, `LinhaDeOcorrencia`. |
| `api/src/gestures/dicionario.ts` (modificar) | `agruparVideos` (puro), `videosDoDicionario`, `videosDoGesto`, `linhaParaEntrada(l, videos)`. |
| `api/src/routes/gestures.ts` (modificar) | GETs com `videos`; `PUT`/`DELETE …/videos/:materialId`. |
| `api/src/routes/materials.ts` (modificar) | `DELETE /api/materials/:materialId` apaga ocorrências e bumpa quando havia. |
| `api/src/__tests__/gesturesVideos.test.ts` (criar) | Leitura com `videos`, PUT, DELETE. |
| `api/src/__tests__/gesturesDictionaryRead.test.ts`, `gesturesMaterialLifecycle.test.ts`, `routes.inventory.test.ts` (modificar) | Fixtures/inventário. |
| `web/src/lib/gestures/dictionary.ts` (modificar) | `GestureVideo`, `GestureEntry.videos`. |
| `web/src/lib/gestures/youtube.ts` (criar) + `__tests__/youtube.test.ts` | `linkNoTempo`, `parseTempos`, `formatarTempo`. |
| `web/src/services/api.ts` (modificar) + `web/src/__tests__/api.extra.test.ts` | `putGestureVideo`, `deleteGestureVideo`. |
| `web/src/components/gestures/SecaoVideosDoGesto.tsx` (criar) + `__tests__/SecaoVideosDoGesto.test.tsx` | Seção "Vídeos": lista, tempos, desligar, adicionar via busca. |
| `web/src/pages/GestureDetailPage.tsx` (modificar) + `__tests__/GestureDetailPage.test.tsx` | Monta a seção e recebe a entrada atualizada. |
| `web/src/styles/global.css` (modificar) | `.gd-videos*`. |

---

### Task 1: Migração, tipos e leitura de `videos` no dicionário

**Files:**
- Create: `api/migrations/020_gesture_videos.sql`
- Modify: `api/src/gestures/dictionaryTypes.ts`
- Modify: `api/src/gestures/dicionario.ts`
- Modify: `api/src/routes/gestures.ts:56-92` (os dois GET)
- Test: `api/src/__tests__/gesturesVideos.test.ts` (criar), `api/src/__tests__/gesturesDictionaryRead.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // dictionaryTypes.ts
  export type GestureVideo = { materialId: string; praiseId: string; praiseNumber: string | null; praiseName: string; url: string; seconds: number[] };
  export type GestureEntry = { …campos atuais…; videos: GestureVideo[] };
  export type LinhaDeOcorrencia = { gesture_id: string; material_id: string; praise_id: string; praise_number: string | null; praise_name: string; url: string; seconds: number | null };
  // dicionario.ts
  export function agruparVideos(linhas: LinhaDeOcorrencia[]): Map<string, GestureVideo[]>;
  export async function videosDoDicionario(db: D1Database): Promise<Map<string, GestureVideo[]>>;
  export async function videosDoGesto(db: D1Database, gestureId: string): Promise<GestureVideo[]>;
  export function linhaParaEntrada(l: LinhaDoDicionario, videos?: GestureVideo[]): GestureEntry; // default []
  ```

- [ ] **Step 1: Escrever a migração**

`api/migrations/020_gesture_videos.sql`:

```sql
-- Vídeos por gesto (spec docs/superpowers/specs/2026-09-15-gestos-videos-design.md).
--
-- Uma linha por ocorrência de um gesto num vídeo youtube de um louvor
-- (praise_materials.type = 'youtube'). seconds NULL = o par gesto↔vídeo está
-- ligado mas o tempo ainda não foi mapeado; ao gravar tempos, a rota troca as
-- linhas do par (a nula some). Toda escrita aqui passa por escreverNoDicionario()
-- (api/src/gestures/dicionario.ts) para o ETag do dicionário mudar.
--
-- Aplicar: cd api && wrangler d1 execute coldigom --remote --file=migrations/020_gesture_videos.sql

CREATE TABLE IF NOT EXISTS gesture_video_occurrences (
  gesture_id  TEXT NOT NULL REFERENCES gesture_dictionary(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES praise_materials(id)  ON DELETE CASCADE,
  seconds     INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gvo_gesture  ON gesture_video_occurrences (gesture_id);
CREATE INDEX IF NOT EXISTS idx_gvo_material ON gesture_video_occurrences (material_id);
```

- [ ] **Step 2: Escrever os testes que falham (agrupar + GET)**

`api/src/__tests__/gesturesVideos.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

import { app } from '../index';
import { agruparVideos } from '../gestures/dicionario';

const SEGREDO = '0123456789abcdef0123456789abcdef';
const ORIGEM = 'https://web.example';

async function sessao() {
  const jwt = await new SignJWT({ email: 'admin@test.com', jti: 'j-videos' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject('sub-admin').setIssuedAt().setExpirationTime('2h')
    .sign(new TextEncoder().encode(SEGREDO));
  return { origin: ORIGEM, cookie: `coldigom_access=${encodeURIComponent(jwt)}`, 'content-type': 'application/json' };
}

const LINHA = {
  id: 'c687580e7682', name: 'Quero', description: '', example_triggers: '[]',
  image_key: 'assets/cia/gestures/c687580e7682.png', gif_key: null,
  status: 'active', replaced_by: null, created_at: 't0', updated_at: 't0',
};

/** Linhas da consulta de ocorrências, já com o JOIN feito. */
const OCORRENCIAS = [
  { gesture_id: 'c687580e7682', material_id: 'y2', praise_id: 'p2', praise_number: '10', praise_name: 'Dez', url: 'https://youtu.be/bbb', seconds: 141 },
  { gesture_id: 'c687580e7682', material_id: 'y2', praise_id: 'p2', praise_number: '10', praise_name: 'Dez', url: 'https://youtu.be/bbb', seconds: 83 },
  { gesture_id: 'c687580e7682', material_id: 'y1', praise_id: 'p1', praise_number: '9', praise_name: 'Nove', url: 'https://youtu.be/aaa', seconds: null },
];

/**
 * Banco falso: responde às leituras pelos trechos de SQL e guarda os lotes.
 * `materiais` alimenta a checagem de material da rota PUT; `ocorrencias` a
 * leitura de vídeos; `par` diz se o par (gesto, vídeo) já existe (DELETE 404).
 */
function banco(opts: {
  linhas?: Record<string, unknown>[];
  materiais?: Record<string, unknown>[];
  ocorrencias?: Record<string, unknown>[];
  par?: boolean;
} = {}) {
  const linhas = opts.linhas ?? [LINHA];
  const materiais = opts.materiais ?? [{ id: 'y1', type: 'youtube', url: 'https://youtu.be/aaa' }];
  const ocorrencias = opts.ocorrencias ?? [];
  const lotes: { sql: string; args: unknown[] }[][] = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const stmt = (args: unknown[]) => ({
        first: vi.fn(async () => {
          if (sql.includes('FROM gesture_dictionary_meta')) return { version: 1 };
          if (sql.includes('FROM gesture_dictionary WHERE id')) return linhas.find((l) => l.id === args[0]) ?? null;
          if (sql.includes('FROM praise_materials WHERE id')) return materiais.find((m) => m.id === args[0]) ?? null;
          if (sql.includes('FROM gesture_video_occurrences WHERE gesture_id = ? AND material_id = ?')) return opts.par ? { um: 1 } : null;
          return null;
        }),
        all: vi.fn(async () => {
          if (sql.includes('FROM gesture_video_occurrences')) {
            return { results: args.length ? ocorrencias.filter((o) => o.gesture_id === args[0]) : ocorrencias };
          }
          if (sql.includes('FROM gesture_dictionary')) return { results: linhas };
          return { results: [] };
        }),
        run: vi.fn(async () => ({})),
        __sql: sql,
        __args: args,
      });
      return { bind: vi.fn((...args: unknown[]) => stmt(args)), ...stmt([]) };
    }),
    batch: vi.fn(async (stmts: { __sql: string; __args: unknown[] }[]) => {
      lotes.push(stmts.map((s) => ({ sql: s.__sql, args: s.__args })));
      return [];
    }),
  };
  return { db, lotes };
}

function env(db: unknown) {
  return { DB: db, ASSETS: { put: vi.fn(), get: vi.fn(), head: vi.fn(), delete: vi.fn() }, AUTH_JWT_SECRET: SEGREDO, AUTH_ALLOWED_EMAILS: '*', WEB_ORIGIN: ORIGEM } as never;
}

const bumpNoFim = (lote: { sql: string }[]) =>
  expect(lote[lote.length - 1].sql).toMatch(/UPDATE gesture_dictionary_meta SET version = version \+ 1/);

const VIDEOS_ESPERADOS = [
  { materialId: 'y1', praiseId: 'p1', praiseNumber: '9', praiseName: 'Nove', url: 'https://youtu.be/aaa', seconds: [] },
  { materialId: 'y2', praiseId: 'p2', praiseNumber: '10', praiseName: 'Dez', url: 'https://youtu.be/bbb', seconds: [83, 141] },
];

describe('agruparVideos', () => {
  it('junta as ocorrências por gesto e vídeo, ordena por número do louvor (numérico) e os segundos', () => {
    const mapa = agruparVideos(OCORRENCIAS as never);
    expect(mapa.get('c687580e7682')).toEqual(VIDEOS_ESPERADOS);
  });

  it('número não numérico vai para o fim, em ordem de texto; gesto sem ocorrência não aparece', () => {
    const mapa = agruparVideos([
      { gesture_id: 'g', material_id: 'a', praise_id: 'pa', praise_number: 'X', praise_name: 'Xis', url: 'u', seconds: null },
      { gesture_id: 'g', material_id: 'b', praise_id: 'pb', praise_number: '2', praise_name: 'Dois', url: 'u', seconds: null },
      { gesture_id: 'g', material_id: 'c', praise_id: 'pc', praise_number: null, praise_name: 'Sem', url: 'u', seconds: null },
    ]);
    expect(mapa.get('g')!.map((v) => v.materialId)).toEqual(['b', 'c', 'a']);
    expect(mapa.has('outro')).toBe(false);
  });
});

describe('GET com videos', () => {
  it('o dicionário inteiro traz videos em cada entrada (vazio quando não há)', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    const res = await app.request('/api/gestures/dictionary', {}, env(db));
    const json = (await res.json()) as { gestures: { id: string; videos: unknown }[] };
    expect(json.gestures[0].videos).toEqual(VIDEOS_ESPERADOS);
    const semNada = await app.request('/api/gestures/dictionary', {}, env(banco().db));
    expect(((await semNada.json()) as { gestures: { videos: unknown }[] }).gestures[0].videos).toEqual([]);
  });

  it('a entrada traz videos junto dos usos', async () => {
    const { db } = banco({ ocorrencias: OCORRENCIAS });
    const res = await app.request('/api/gestures/dictionary/c687580e7682', {}, env(db));
    const { data } = (await res.json()) as { data: { videos: unknown; usages: unknown } };
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
    expect(data.usages).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesVideos.test.ts`
Expected: FAIL — `agruparVideos` não é exportado; nos GET, `videos` é `undefined`.

- [ ] **Step 4: Tipos**

Em `api/src/gestures/dictionaryTypes.ts`, acima de `GestureEntry`:

```ts
/** Um vídeo youtube de um louvor em que o gesto aparece; seconds vazio = só ligado. */
export type GestureVideo = {
  materialId: string;
  praiseId: string;
  praiseNumber: string | null;
  praiseName: string;
  url: string;
  seconds: number[];
};
```

Em `GestureEntry`, depois de `updatedAt: string;`: `videos: GestureVideo[];`

No fim do arquivo:

```ts
/** Linha de gesture_video_occurrences já com o JOIN em praise_materials e praises. */
export type LinhaDeOcorrencia = {
  gesture_id: string;
  material_id: string;
  praise_id: string;
  praise_number: string | null;
  praise_name: string;
  url: string;
  seconds: number | null;
};
```

- [ ] **Step 5: Agrupar e ler**

Em `api/src/gestures/dicionario.ts`: acrescentar `GestureVideo, LinhaDeOcorrencia` aos dois `import`/`export type`. Trocar a assinatura de `linhaParaEntrada` para `(l: LinhaDoDicionario, videos: GestureVideo[] = [])` e, no objeto devolvido, depois de `updatedAt: l.updated_at,` pôr `videos,`. Depois de `usosDoGesto`, acrescentar:

```ts
const SQL_OCORRENCIAS = `SELECT o.gesture_id, o.material_id, pm.praise_id, p.number AS praise_number, p.name AS praise_name, pm.url, o.seconds
     FROM gesture_video_occurrences o
     JOIN praise_materials pm ON pm.id = o.material_id
     JOIN praises p ON p.id = pm.praise_id`;

/** "9" antes de "10"; o que não é número vai para o fim, em ordem de texto. */
function compararNumero(a: string | null, b: string | null): number {
  const na = a !== null && /^\d+$/.test(a) ? Number(a) : Number.POSITIVE_INFINITY;
  const nb = b !== null && /^\d+$/.test(b) ? Number(b) : Number.POSITIVE_INFINITY;
  if (na !== nb) return na - nb;
  return (a ?? '').localeCompare(b ?? '', 'pt-BR');
}

/** Ocorrências → vídeos por gesto: um item por (gesto, vídeo), segundos ordenados, nulo descartado. */
export function agruparVideos(linhas: LinhaDeOcorrencia[]): Map<string, GestureVideo[]> {
  const porGesto = new Map<string, Map<string, GestureVideo>>();
  for (const l of linhas) {
    let videos = porGesto.get(l.gesture_id);
    if (!videos) porGesto.set(l.gesture_id, (videos = new Map()));
    let v = videos.get(l.material_id);
    if (!v) {
      v = { materialId: l.material_id, praiseId: l.praise_id, praiseNumber: l.praise_number, praiseName: l.praise_name, url: l.url, seconds: [] };
      videos.set(l.material_id, v);
    }
    if (l.seconds !== null) v.seconds.push(l.seconds);
  }
  const resultado = new Map<string, GestureVideo[]>();
  for (const [gestureId, videos] of porGesto) {
    const lista = [...videos.values()];
    for (const v of lista) v.seconds.sort((a, b) => a - b);
    lista.sort((a, b) => compararNumero(a.praiseNumber, b.praiseNumber) || a.praiseName.localeCompare(b.praiseName, 'pt-BR'));
    resultado.set(gestureId, lista);
  }
  return resultado;
}

export async function videosDoDicionario(db: D1Database): Promise<Map<string, GestureVideo[]>> {
  const r = await db.prepare(SQL_OCORRENCIAS).all<LinhaDeOcorrencia>();
  return agruparVideos(r.results ?? []);
}

export async function videosDoGesto(db: D1Database, gestureId: string): Promise<GestureVideo[]> {
  const r = await db.prepare(`${SQL_OCORRENCIAS} WHERE o.gesture_id = ?`).bind(gestureId).all<LinhaDeOcorrencia>();
  return agruparVideos(r.results ?? []).get(gestureId) ?? [];
}
```

- [ ] **Step 6: GETs com `videos`**

Em `api/src/routes/gestures.ts`, acrescentar `videosDoDicionario, videosDoGesto` ao import de `../gestures/dicionario`. No `GET /api/gestures/dictionary`, depois da leitura de `linhas`:

```ts
      const videos = await videosDoDicionario(c.env.DB);
      const corpo = {
        schema: DICTIONARY_SCHEMA,
        version,
        generatedAt: new Date().toISOString(),
        gestures: (linhas.results ?? []).map((l) => linhaParaEntrada(l, videos.get(l.id))),
      };
```

No `GET /api/gestures/dictionary/:id`:

```ts
      const usages = await usosDoGesto(c.env.DB, id);
      const videos = await videosDoGesto(c.env.DB, id);
      return c.json({ data: { ...linhaParaEntrada(linha, videos), usages } });
```

O `POST /api/gestures/dictionary` monta uma entrada literal na mão (linha ~164, `gif: null, status: 'active', …`): acrescentar `videos: []` nesse objeto.

- [ ] **Step 7: Fixtures dos testes de leitura existentes**

Em `api/src/__tests__/gesturesDictionaryRead.test.ts`, no objeto esperado do primeiro teste (`expect(json.gestures).toEqual([...])`), acrescentar `videos: [],` depois de `updatedAt`. Se outro `toEqual` de entrada inteira falhar, acrescentar `videos: []` do mesmo jeito.

- [ ] **Step 8: Rodar tudo da API**

Run: `cd api && npx tsc --noEmit -p . && npx vitest run`
Expected: tudo verde (o `all` dos bancos falsos antigos devolve `{ results: [] }` para SQL desconhecido, então `videos` sai `[]`).

- [ ] **Step 9: Commit**

```bash
git add api/migrations/020_gesture_videos.sql api/src/gestures api/src/routes/gestures.ts api/src/__tests__/gesturesVideos.test.ts api/src/__tests__/gesturesDictionaryRead.test.ts
git commit -m "feat(api): vídeos por gesto — migração 020 e campo aditivo videos no dicionário"
```

---

### Task 2: `PUT /api/gestures/dictionary/:id/videos/:materialId`

**Files:**
- Modify: `api/src/routes/gestures.ts` (antes do bloco `replace-with`)
- Test: `api/src/__tests__/gesturesVideos.test.ts`

**Interfaces:**
- Consumes: `lerLinha`, `escreverNoDicionario`, `videosDoGesto`, `linhaParaEntrada` (Task 1).
- Produces: rota `PUT …/videos/:materialId` com corpo `{ seconds: number[] }`, resposta `{ data: GestureEntry }`.

- [ ] **Step 1: Testes que falham**

Acrescentar ao fim de `gesturesVideos.test.ts`:

```ts
describe('PUT /api/gestures/dictionary/:id/videos/:materialId', () => {
  async function ligar(corpo: unknown, opts: Parameters<typeof banco>[0] = {}, materialId = 'y1') {
    const { db, lotes } = banco(opts);
    const res = await app.request(
      `/api/gestures/dictionary/c687580e7682/videos/${materialId}`,
      { method: 'PUT', headers: await sessao(), body: JSON.stringify(corpo) },
      env(db)
    );
    return { res, lotes };
  }

  it('exige sessão', async () => {
    const res = await app.request('/api/gestures/dictionary/c687580e7682/videos/y1', { method: 'PUT', headers: { origin: ORIGEM, 'content-type': 'application/json' }, body: '{"seconds":[]}' }, env(banco().db));
    expect(res.status).toBe(401);
  });

  it('seconds vazio liga o par com uma linha nula, num batch com o bump', async () => {
    const { res, lotes } = await ligar({ seconds: [] });
    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
    const [apaga, insere] = lotes[0];
    expect(apaga.sql).toMatch(/DELETE FROM gesture_video_occurrences WHERE gesture_id = \? AND material_id = \?/);
    expect(apaga.args).toEqual(['c687580e7682', 'y1']);
    expect(insere.sql).toMatch(/INSERT INTO gesture_video_occurrences \(gesture_id, material_id, seconds\) VALUES \(\?, \?, \?\)/);
    expect(insere.args).toEqual(['c687580e7682', 'y1', null]);
    bumpNoFim(lotes[0]);
  });

  it('tempos são deduplicados, ordenados e gravados um por linha; a resposta traz a entrada com videos', async () => {
    const { res, lotes } = await ligar({ seconds: [141, 83, 83] }, { ocorrencias: OCORRENCIAS });
    expect(res.status).toBe(200);
    const inserts = lotes[0].filter((s) => s.sql.startsWith('INSERT'));
    expect(inserts.map((s) => s.args[2])).toEqual([83, 141]);
    const { data } = (await res.json()) as { data: { id: string; videos: unknown } };
    expect(data.id).toBe('c687580e7682');
    expect(data.videos).toEqual(VIDEOS_ESPERADOS);
  });

  it('404 para gesto e material inexistentes; 400 para material que não é youtube', async () => {
    expect((await ligar({ seconds: [] }, { linhas: [] })).res.status).toBe(404);
    expect((await ligar({ seconds: [] }, {}, 'nao-existe')).res.status).toBe(404);
    const pdf = await ligar({ seconds: [] }, { materiais: [{ id: 'y1', type: 'pdf', url: null }] });
    expect(pdf.res.status).toBe(400);
    expect(((await pdf.res.json()) as { error: string }).error).toBe('Material is not a youtube video');
    expect(pdf.lotes).toHaveLength(0);
  });

  it('400 para seconds ausente, não lista, negativo ou não inteiro', async () => {
    for (const corpo of [{}, { seconds: 'x' }, { seconds: [-1] }, { seconds: [1.5] }, { seconds: ['1'] }]) {
      const { res, lotes } = await ligar(corpo);
      expect(res.status).toBe(400);
      expect(lotes).toHaveLength(0);
    }
    expect((await ligar('nao é json')).res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesVideos.test.ts`
Expected: FAIL — 404 do Hono em todos (rota não existe); o de sessão passa por acaso (401 vem antes? não — sem rota é 404). Confirmar que a falha é por rota ausente.

- [ ] **Step 3: Implementar a rota**

Em `api/src/routes/gestures.ts`, antes do comentário `// POST …/:id/replace-with`:

```ts
  // PUT …/:id/videos/:materialId — liga o gesto a um vídeo youtube de um louvor e
  // substitui as ocorrências do par pelo que veio. `seconds: []` só liga (uma
  // linha com seconds NULL); tempos apagam a nula. Tudo num batch com o bump.
  app.put('/api/gestures/dictionary/:id/videos/:materialId', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const materialId = c.req.param('materialId') as string;
    const body = (await c.req.json().catch(() => null)) as { seconds?: unknown } | null;
    if (!body || typeof body !== 'object') return c.json({ error: 'Invalid JSON body' }, 400);
    const seconds = body.seconds;
    if (!Array.isArray(seconds) || !seconds.every((s) => Number.isInteger(s) && (s as number) >= 0)) {
      return c.json({ error: "Field 'seconds' must be an array of non-negative integers" }, 400);
    }
    const tempos = [...new Set(seconds as number[])].sort((a, b) => a - b);

    try {
      const linha = await lerLinha(c.env.DB, id);
      if (!linha) return c.json({ error: 'Gesture not found' }, 404);
      const material = await c.env.DB
        .prepare(`SELECT id, type FROM praise_materials WHERE id = ?`)
        .bind(materialId)
        .first<{ id: string; type: string }>();
      if (!material) return c.json({ error: 'Material not found' }, 404);
      if (material.type !== 'youtube') return c.json({ error: 'Material is not a youtube video' }, 400);

      const valores: (number | null)[] = tempos.length ? tempos : [null];
      await escreverNoDicionario(c.env.DB, [
        c.env.DB.prepare(`DELETE FROM gesture_video_occurrences WHERE gesture_id = ? AND material_id = ?`).bind(id, materialId),
        ...valores.map((s) =>
          c.env.DB.prepare(`INSERT INTO gesture_video_occurrences (gesture_id, material_id, seconds) VALUES (?, ?, ?)`).bind(id, materialId, s)
        ),
      ]);
      return c.json({ data: linhaParaEntrada(linha, await videosDoGesto(c.env.DB, id)) });
    } catch (error) {
      console.error('Error linking gesture video:', error);
      return c.json({ error: 'Failed to link gesture video' }, 500);
    }
  });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/gesturesVideos.test.ts`
Expected: PASS.

- [ ] **Step 5: Inventário de rotas**

Em `api/src/__tests__/routes.inventory.test.ts`, logo antes de `'POST /api/gestures/dictionary/:id/replace-with'` (a primeira das duas), inserir:

```ts
  'PUT /api/gestures/dictionary/:id/videos/:materialId',
  'PUT /api/gestures/dictionary/:id/videos/:materialId',
```

Run: `cd api && npx vitest run src/__tests__/routes.inventory.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/gestures.ts api/src/__tests__/gesturesVideos.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(api): PUT …/videos/:materialId liga gesto a vídeo youtube e grava as ocorrências"
```

---

### Task 3: `DELETE /api/gestures/dictionary/:id/videos/:materialId`

**Files:**
- Modify: `api/src/routes/gestures.ts` (logo depois do PUT)
- Test: `api/src/__tests__/gesturesVideos.test.ts`, `routes.inventory.test.ts`

**Interfaces:**
- Produces: rota `DELETE …/videos/:materialId`, resposta `{ data: GestureEntry }`; 404 se o par não existia.

- [ ] **Step 1: Testes que falham**

Acrescentar ao fim de `gesturesVideos.test.ts`:

```ts
describe('DELETE /api/gestures/dictionary/:id/videos/:materialId', () => {
  it('apaga o par num batch com o bump e responde a entrada', async () => {
    const { db, lotes } = banco({ par: true });
    const res = await app.request('/api/gestures/dictionary/c687580e7682/videos/y1', { method: 'DELETE', headers: await sessao() }, env(db));
    expect(res.status).toBe(200);
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].sql).toMatch(/DELETE FROM gesture_video_occurrences WHERE gesture_id = \? AND material_id = \?/);
    expect(lotes[0][0].args).toEqual(['c687580e7682', 'y1']);
    bumpNoFim(lotes[0]);
    expect(((await res.json()) as { data: { videos: unknown } }).data.videos).toEqual([]);
  });

  it('404 quando o par não existe ou o gesto não existe; nada é escrito', async () => {
    const semPar = banco({ par: false });
    expect((await app.request('/api/gestures/dictionary/c687580e7682/videos/y1', { method: 'DELETE', headers: await sessao() }, env(semPar.db))).status).toBe(404);
    expect(semPar.lotes).toHaveLength(0);
    const semGesto = banco({ linhas: [], par: true });
    expect((await app.request('/api/gestures/dictionary/c687580e7682/videos/y1', { method: 'DELETE', headers: await sessao() }, env(semGesto.db))).status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesVideos.test.ts`
Expected: FAIL — 404 do Hono no primeiro (rota ausente).

- [ ] **Step 3: Implementar**

Depois do PUT em `api/src/routes/gestures.ts`:

```ts
  // DELETE …/:id/videos/:materialId — desliga o par inteiro (todas as ocorrências).
  app.delete('/api/gestures/dictionary/:id/videos/:materialId', requireAuth, async (c) => {
    const id = c.req.param('id') as string;
    const materialId = c.req.param('materialId') as string;
    try {
      const linha = await lerLinha(c.env.DB, id);
      if (!linha) return c.json({ error: 'Gesture not found' }, 404);
      const par = await c.env.DB
        .prepare(`SELECT 1 AS um FROM gesture_video_occurrences WHERE gesture_id = ? AND material_id = ? LIMIT 1`)
        .bind(id, materialId)
        .first();
      if (!par) return c.json({ error: 'Video is not linked to this gesture' }, 404);
      await escreverNoDicionario(c.env.DB, [
        c.env.DB.prepare(`DELETE FROM gesture_video_occurrences WHERE gesture_id = ? AND material_id = ?`).bind(id, materialId),
      ]);
      return c.json({ data: linhaParaEntrada(linha, await videosDoGesto(c.env.DB, id)) });
    } catch (error) {
      console.error('Error unlinking gesture video:', error);
      return c.json({ error: 'Failed to unlink gesture video' }, 500);
    }
  });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/gesturesVideos.test.ts` → PASS.

- [ ] **Step 5: Inventário**

Em `routes.inventory.test.ts`, logo depois das duas linhas `PUT …/videos/:materialId`:

```ts
  'DELETE /api/gestures/dictionary/:id/videos/:materialId',
  'DELETE /api/gestures/dictionary/:id/videos/:materialId',
```

Run: `cd api && npx vitest run` → tudo PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/gestures.ts api/src/__tests__/gesturesVideos.test.ts api/src/__tests__/routes.inventory.test.ts
git commit -m "feat(api): DELETE …/videos/:materialId desliga o gesto do vídeo"
```

---

### Task 4: Exclusão de material limpa ocorrências e bumpa o dicionário

**Files:**
- Modify: `api/src/routes/materials.ts:369-386` (`DELETE /api/materials/:materialId`)
- Test: `api/src/__tests__/gesturesMaterialLifecycle.test.ts`

**Interfaces:**
- Consumes: nada novo (o bump é o mesmo SQL de `escreverNoDicionario`, mas aqui o batch já existe — o statement vai inline para manter a exclusão do material no mesmo lote).

- [ ] **Step 1: Testes que falham**

Em `gesturesMaterialLifecycle.test.ts`, na função `ambiente`, trocar a assinatura para `ambiente(opts: { fonte?: { id: string; praise_id: string } | null; ocorrencias?: number } = {})` e, dentro de `first`, antes de `return null;`, acrescentar:

```ts
          if (/COUNT\(\*\) AS n FROM gesture_video_occurrences WHERE material_id/i.test(sql)) return { n: opts.ocorrencias ?? 0 };
```

Substituir o `describe('DELETE /api/materials/:materialId — limpa gesture_usage', …)` por:

```ts
describe('DELETE /api/materials/:materialId — limpa gesture_usage e ocorrências de vídeo', () => {
  it('apaga uso, ocorrências e a linha num único batch, nessa ordem; sem ocorrências não mexe na versão', async () => {
    const ctx = ambiente();
    const res = await app.request('/api/materials/g1', { method: 'DELETE', headers: await cabecalhos() }, ctx.env);
    expect(res.status).toBe(200);
    expect(ctx.lotes).toHaveLength(1);
    const sqls = ctx.lotes[0].map((s) => s.sql);
    expect(sqls).toHaveLength(3);
    expect(sqls[0]).toMatch(/DELETE FROM gesture_usage WHERE material_id = \?/);
    expect(sqls[1]).toMatch(/DELETE FROM gesture_video_occurrences WHERE material_id = \?/);
    expect(sqls[2]).toMatch(/DELETE FROM praise_materials WHERE id = \?/);
  });

  it('um vídeo com ocorrências bumpa a versão do dicionário no mesmo batch, para o ETag mudar', async () => {
    const ctx = ambiente({ ocorrencias: 2 });
    const res = await app.request('/api/materials/g1', { method: 'DELETE', headers: await cabecalhos() }, ctx.env);
    expect(res.status).toBe(200);
    const sqls = ctx.lotes[0].map((s) => s.sql);
    expect(sqls).toHaveLength(4);
    expect(sqls[3]).toMatch(/UPDATE gesture_dictionary_meta SET version = version \+ 1/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/gesturesMaterialLifecycle.test.ts`
Expected: FAIL — `sqls` tem 2 statements.

- [ ] **Step 3: Implementar**

Em `api/src/routes/materials.ts`, no `DELETE`, substituir o bloco do comentário `// gesture_usage tem ON DELETE CASCADE…` até o `await c.env.DB.batch([...]);` por:

```ts
      // gesture_usage e gesture_video_occurrences têm ON DELETE CASCADE, mas a
      // migração 018 caiu sobre um banco já existente: apagamos explicitamente, e
      // tudo vai no MESMO batch — como statements separadas, uma janela entre
      // elas deixava a contagem de uso do dicionário mentir sobre um material
      // que já não existe mais. Um vídeo com ocorrências muda o dicionário que
      // os clientes têm em cache: o bump de versão vai junto, senão o ETag não
      // mudaria e o coldigui ficaria com um vídeo morto até o cache vencer.
      const ocorrencias = await c.env.DB
        .prepare(`SELECT COUNT(*) AS n FROM gesture_video_occurrences WHERE material_id = ?`)
        .bind(materialId)
        .first<{ n: number }>();
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM gesture_usage WHERE material_id = ?`).bind(materialId),
        c.env.DB.prepare(`DELETE FROM gesture_video_occurrences WHERE material_id = ?`).bind(materialId),
        c.env.DB.prepare(`DELETE FROM praise_materials WHERE id = ?`).bind(materialId),
        ...((ocorrencias?.n ?? 0) > 0
          ? [c.env.DB.prepare(`UPDATE gesture_dictionary_meta SET version = version + 1 WHERE id = 1`)]
          : []),
      ]);
```

- [ ] **Step 4: Rodar tudo da API**

Run: `cd api && npx tsc --noEmit -p . && npx vitest run && npm run lint --silent`
Expected: PASS (só os 2 avisos pré-existentes de `importGestures.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/materials.ts api/src/__tests__/gesturesMaterialLifecycle.test.ts
git commit -m "fix(api): apagar material youtube limpa as ocorrências de gesto e bumpa o dicionário"
```

---

### Task 5: Web — tipo `videos`, cliente e fixtures

**Files:**
- Modify: `web/src/lib/gestures/dictionary.ts:1-12`
- Modify: `web/src/services/api.ts` (depois de `uploadGestureImage`)
- Modify: fixtures de teste (8 arquivos, ver Step 3)
- Test: `web/src/__tests__/api.extra.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/gestures/dictionary.ts
  export type GestureVideo = { materialId: string; praiseId: string; praiseNumber: string | null; praiseName: string; url: string; seconds: number[] };
  // GestureEntry ganha videos: GestureVideo[]
  // services/api.ts
  export async function putGestureVideo(id: string, materialId: string, seconds: number[]): Promise<GestureEntry>;
  export async function deleteGestureVideo(id: string, materialId: string): Promise<GestureEntry>;
  ```

- [ ] **Step 1: Testes do cliente que falham**

Em `web/src/__tests__/api.extra.test.ts`, acrescentar `putGestureVideo, deleteGestureVideo` ao `import { … } from '../services/api'` do topo, e dentro de `describe('API Service — dicionário de gestos', …)`, depois do teste de `uploadGestureImage`:

```ts
  it('putGestureVideo manda PUT JSON com os segundos e devolve a entrada', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', videos: [{ materialId: 'y1', seconds: [83] }] }));
    const r = await putGestureVideo('g1', 'y1', [83]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/gestures/dictionary/g1/videos/y1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ seconds: [83] });
    expect(init).toEqual(withCreds);
    expect(r.videos[0].materialId).toBe('y1');
  });

  it('deleteGestureVideo manda DELETE e devolve a entrada', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', videos: [] }));
    const r = await deleteGestureVideo('g1', 'y1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/gestures/dictionary/g1/videos/y1');
    expect(init.method).toBe('DELETE');
    expect(r.videos).toEqual([]);
  });
```

Run: `cd web && npx vitest run src/__tests__/api.extra.test.ts` → FAIL (funções não exportadas).

- [ ] **Step 2: Tipo e cliente**

Em `web/src/lib/gestures/dictionary.ts`, antes de `GestureEntry`:

```ts
/** Vídeo youtube de um louvor em que o gesto aparece; seconds vazio = só ligado. */
export type GestureVideo = {
  materialId: string;
  praiseId: string;
  praiseNumber: string | null;
  praiseName: string;
  url: string;
  seconds: number[];
};
```

Em `GestureEntry`, depois de `updatedAt: string;`: `videos: GestureVideo[];`

Em `web/src/services/api.ts`, depois de `uploadGestureImage`:

```ts
export async function putGestureVideo(id: string, materialId: string, seconds: number[]): Promise<GestureEntry> {
  const r = await fetchJson<ApiResponse<GestureEntry>>(
    `${API_BASE_URL}/api/gestures/dictionary/${id}/videos/${encodeURIComponent(materialId)}`,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seconds }) }
  );
  return r.data;
}

export async function deleteGestureVideo(id: string, materialId: string): Promise<GestureEntry> {
  const r = await fetchJson<ApiResponse<GestureEntry>>(
    `${API_BASE_URL}/api/gestures/dictionary/${id}/videos/${encodeURIComponent(materialId)}`,
    { method: 'DELETE' }
  );
  return r.data;
}
```

- [ ] **Step 3: Fixtures**

Todos os objetos `GestureEntry` dos testes têm `gif: null,`. Na raiz do repositório:

```bash
grep -rl "gif: null" web/src | xargs sed -i '' 's/gif: null,/gif: null, videos: [],/g'
git diff --stat   # 8 arquivos de teste, 16 trocas
```

Se o `sed` alterar algum arquivo que não seja teste, reverter esse com `git checkout -- <arquivo>` e ajustar à mão.

- [ ] **Step 4: Rodar tipos e testes do web**

Run: `cd web && npx tsc --noEmit -p tsconfig.app.json && npx vitest run`
Expected: PASS. Se o `tsc` apontar um objeto `GestureEntry` sem `videos` fora dos testes (ex.: `adicionarAoIndice` só repassa, não constrói — não deve), acrescentar `videos: []` ali.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): tipo GestureVideo e cliente das rotas de vídeo por gesto"
```

---

### Task 6: Ajudantes puros de YouTube e tempos

**Files:**
- Create: `web/src/lib/gestures/youtube.ts`
- Test: `web/src/lib/gestures/__tests__/youtube.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function linkNoTempo(url: string, seconds: number | null): string;
  export function formatarTempo(seconds: number): string;                // 83 → "1:23"; 3661 → "1:01:01"
  export type Tempos = { ok: true; seconds: number[] } | { ok: false; erro: string };
  export function parseTempos(texto: string): Tempos;
  ```

- [ ] **Step 1: Testes que falham**

`web/src/lib/gestures/__tests__/youtube.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatarTempo, linkNoTempo, parseTempos } from '../youtube';

describe('linkNoTempo', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtube.com/watch?list=PL1&v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://m.youtube.com/watch?v=abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtu.be/abc123XYZ_-', 'abc123XYZ_-'],
    ['https://youtu.be/abc123XYZ_-?si=xyz', 'abc123XYZ_-'],
    ['https://www.youtube.com/shorts/abc123XYZ_-', 'abc123XYZ_-'],
  ])('%s → watch canônico com t=', (url, id) => {
    expect(linkNoTempo(url, 83)).toBe(`https://www.youtube.com/watch?v=${id}&t=83s`);
    expect(linkNoTempo(url, null)).toBe(`https://www.youtube.com/watch?v=${id}`);
  });

  it('URL que não reconhece volta como veio, com ou sem tempo', () => {
    expect(linkNoTempo('https://vimeo.com/123', 83)).toBe('https://vimeo.com/123');
    expect(linkNoTempo('lixo', null)).toBe('lixo');
  });
});

describe('formatarTempo', () => {
  it.each([[0, '0:00'], [7, '0:07'], [83, '1:23'], [600, '10:00'], [3661, '1:01:01']])('%d → %s', (s, esperado) => {
    expect(formatarTempo(s)).toBe(esperado);
  });
});

describe('parseTempos', () => {
  it('aceita m:ss, h:mm:ss e inteiros, misturados; ordena e deduplica', () => {
    expect(parseTempos('2:21, 83; 1:23\n1:01:01, 0')).toEqual({ ok: true, seconds: [0, 83, 141, 3661] });
  });

  it('vazio ou só separadores é lista vazia', () => {
    expect(parseTempos('')).toEqual({ ok: true, seconds: [] });
    expect(parseTempos(' , ; ')).toEqual({ ok: true, seconds: [] });
  });

  it('recusa o que não é tempo, dizendo qual', () => {
    expect(parseTempos('1:23, abc')).toEqual({ ok: false, erro: 'Tempo inválido: "abc"' });
    expect(parseTempos('1:75')).toEqual({ ok: false, erro: 'Tempo inválido: "1:75"' });
    expect(parseTempos('-5')).toEqual({ ok: false, erro: 'Tempo inválido: "-5"' });
    expect(parseTempos('1.5')).toEqual({ ok: false, erro: 'Tempo inválido: "1.5"' });
  });
});
```

Run: `cd web && npx vitest run src/lib/gestures/__tests__/youtube.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar**

`web/src/lib/gestures/youtube.ts`:

```ts
/**
 * Links e tempos de vídeo do YouTube — funções puras da seção "Vídeos" da
 * página do gesto. Sem player embutido: o clique abre o YouTube no segundo
 * certo (`t=`), que é o único parâmetro de posição que a URL aceita.
 */

const ID = /^[A-Za-z0-9_-]{6,}$/;

function idDoVideo(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice('/shorts/'.length).split('/')[0];
  }
  return id && ID.test(id) ? id : null;
}

/** URL canônica do vídeo no segundo dado; sem tempo, só o vídeo. URL desconhecida volta intacta. */
export function linkNoTempo(url: string, seconds: number | null): string {
  const id = idDoVideo(url);
  if (!id) return url;
  return `https://www.youtube.com/watch?v=${id}${seconds === null ? '' : `&t=${seconds}s`}`;
}

/** 83 → "1:23"; 3661 → "1:01:01". */
export function formatarTempo(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type Tempos = { ok: true; seconds: number[] } | { ok: false; erro: string };

function segundosDe(pedaco: string): number | null {
  if (/^\d+$/.test(pedaco)) return Number(pedaco);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(pedaco);
  if (!m) return null;
  const [, h, mm, ss] = m;
  if (Number(mm) > 59 || Number(ss) > 59) return null;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}

/** "1:23, 141; 2:21" → [83, 141] ordenado e sem repetição. Separa por vírgula, ponto-e-vírgula ou quebra de linha. */
export function parseTempos(texto: string): Tempos {
  const pedacos = texto.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const seconds: number[] = [];
  for (const p of pedacos) {
    const s = segundosDe(p);
    if (s === null) return { ok: false, erro: `Tempo inválido: "${p}"` };
    seconds.push(s);
  }
  return { ok: true, seconds: [...new Set(seconds)].sort((a, b) => a - b) };
}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `cd web && npx vitest run src/lib/gestures/__tests__/youtube.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/gestures/youtube.ts web/src/lib/gestures/__tests__/youtube.test.ts
git commit -m "feat(web): ajudantes puros de link no tempo e parse de tempos do YouTube"
```

---

### Task 7: `SecaoVideosDoGesto` — lista (leitura) e ações de tempos/desligar

**Files:**
- Create: `web/src/components/gestures/SecaoVideosDoGesto.tsx`
- Modify: `web/src/styles/global.css` (depois de `.gd-usos`, linha ~3771)
- Test: `web/src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx`

**Interfaces:**
- Consumes: `GestureVideo` (Task 5), `putGestureVideo`/`deleteGestureVideo` (Task 5), `linkNoTempo`/`formatarTempo`/`parseTempos` (Task 6).
- Produces:
  ```ts
  type Props = { gestureId: string; videos: GestureVideo[]; podeEditar: boolean; onAlterado: (entrada: GestureEntry) => void };
  export function SecaoVideosDoGesto(props: Props): JSX.Element;
  ```
  "Adicionar vídeo" entra na Task 8; esta task entrega a seção sem esse botão.

- [ ] **Step 1: Testes que falham**

`web/src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GestureEntry, GestureVideo } from '../../../lib/gestures/dictionary';
import * as api from '../../../services/api';
import { SecaoVideosDoGesto } from '../SecaoVideosDoGesto';

const videos: GestureVideo[] = [
  { materialId: 'y1', praiseId: 'p1', praiseNumber: '9', praiseName: 'Nove', url: 'https://youtu.be/aaaaaaaaaaa', seconds: [] },
  { materialId: 'y2', praiseId: 'p2', praiseNumber: '10', praiseName: 'Dez', url: 'https://youtu.be/bbbbbbbbbbb', seconds: [83, 141] },
];
const entrada = {
  id: 'aaaaaaaaaaaa', name: 'Quero', description: '', exampleTriggers: [], image: 'a.png', gif: null,
  status: 'active', replacedBy: null, updatedAt: 't', videos,
} as GestureEntry;

function montar(podeEditar = true, lista = videos) {
  const onAlterado = vi.fn();
  render(<MemoryRouter><SecaoVideosDoGesto gestureId="aaaaaaaaaaaa" videos={lista} podeEditar={podeEditar} onAlterado={onAlterado} /></MemoryRouter>);
  return { onAlterado };
}

afterEach(() => vi.restoreAllMocks());

describe('SecaoVideosDoGesto — leitura', () => {
  it('lista os vídeos com link para o louvor, "Abrir no YouTube" no primeiro tempo e um chip por ocorrência', () => {
    montar(false);
    expect(screen.getByRole('link', { name: '9 - Nove' })).toHaveAttribute('href', '/praise/p1');
    const abrir = screen.getAllByRole('link', { name: 'Abrir no YouTube' });
    expect(abrir[0]).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    expect(abrir[1]).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=83s');
    expect(abrir[1]).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: '1:23' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=83s');
    expect(screen.getByRole('link', { name: '2:21' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=141s');
    expect(screen.getByText('tempos não mapeados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar tempos' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desligar' })).toBeNull();
  });

  it('sem vídeos avisa', () => {
    montar(false, []);
    expect(screen.getByText('Nenhum vídeo ligado a este gesto.')).toBeInTheDocument();
  });
});

describe('SecaoVideosDoGesto — edição', () => {
  it('o campo de tempos nasce com os tempos formatados; salvar manda os segundos e avisa a página', async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, 'putGestureVideo').mockResolvedValue(entrada);
    const { onAlterado } = montar();
    const campo = screen.getAllByRole('textbox', { name: 'Tempos' })[1];
    expect(campo).toHaveValue('1:23, 2:21');
    await user.clear(campo);
    await user.type(campo, '2:21, 10, 0:10');
    await user.click(screen.getAllByRole('button', { name: 'Salvar tempos' })[1]);
    await waitFor(() => expect(put).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y2', [10, 141]));
    expect(onAlterado).toHaveBeenCalledWith(entrada);
    expect(screen.getByRole('status')).toHaveTextContent('Tempos salvos.');
  });

  it('tempo inválido mostra o motivo e não chama a API', async () => {
    const user = userEvent.setup();
    const put = vi.spyOn(api, 'putGestureVideo');
    montar();
    const campo = screen.getAllByRole('textbox', { name: 'Tempos' })[0];
    await user.type(campo, 'abc');
    await user.click(screen.getAllByRole('button', { name: 'Salvar tempos' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Tempo inválido: "abc"');
    expect(put).not.toHaveBeenCalled();
  });

  it('Desligar chama a API e avisa a página; erro da API aparece', async () => {
    const user = userEvent.setup();
    const del = vi.spyOn(api, 'deleteGestureVideo').mockResolvedValueOnce({ ...entrada, videos: [videos[1]] }).mockRejectedValueOnce(new Error('Video is not linked to this gesture'));
    const { onAlterado } = montar();
    await user.click(screen.getAllByRole('button', { name: 'Desligar' })[0]);
    await waitFor(() => expect(del).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y1'));
    expect(onAlterado).toHaveBeenCalledWith({ ...entrada, videos: [videos[1]] });
    await user.click(screen.getAllByRole('button', { name: 'Desligar' })[1]);
    expect(await screen.findByRole('status')).toHaveTextContent('Video is not linked to this gesture');
  });
});
```

Run: `cd web && npx vitest run src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar o componente**

`web/src/components/gestures/SecaoVideosDoGesto.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { GestureEntry, GestureVideo } from '../../lib/gestures/dictionary';
import { formatarTempo, linkNoTempo, parseTempos } from '../../lib/gestures/youtube';
import { deleteGestureVideo, putGestureVideo } from '../../services/api';

type Props = {
  gestureId: string;
  videos: GestureVideo[];
  podeEditar: boolean;
  /** A API devolve a entrada inteira a cada escrita; a página troca a dela. */
  onAlterado: (entrada: GestureEntry) => void;
};

const rotuloDoLouvor = (v: GestureVideo) => `${v.praiseNumber ? `${v.praiseNumber} - ` : ''}${v.praiseName}`;

/**
 * Seção "Vídeos" da página do gesto: em quais vídeos youtube de louvores o
 * gesto aparece e em que segundos. Um item por vídeo; os tempos são chips que
 * abrem o YouTube no momento certo — não há player embutido (decisão da spec).
 */
export function SecaoVideosDoGesto({ gestureId, videos, podeEditar, onAlterado }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const executar = async (acao: () => Promise<GestureEntry>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      onAlterado(await acao());
      setAviso(ok);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Falha');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cp-panel">
      <h2 className="cp-panel-title">Vídeos</h2>
      {videos.length === 0 ? (
        <p className="materials-placeholder">Nenhum vídeo ligado a este gesto.</p>
      ) : (
        <ul className="gd-videos">
          {videos.map((v) => (
            <ItemDeVideo
              key={v.materialId}
              video={v}
              podeEditar={podeEditar}
              ocupado={ocupado}
              onSalvarTempos={(seconds) => executar(() => putGestureVideo(gestureId, v.materialId, seconds), 'Tempos salvos.')}
              onDesligar={() => executar(() => deleteGestureVideo(gestureId, v.materialId), 'Vídeo desligado.')}
              onErroLocal={setAviso}
            />
          ))}
        </ul>
      )}
      {aviso ? <span className="cp-edit-issues" role="status" aria-live="polite">{aviso}</span> : null}
    </section>
  );
}

function ItemDeVideo({ video, podeEditar, ocupado, onSalvarTempos, onDesligar, onErroLocal }: {
  video: GestureVideo;
  podeEditar: boolean;
  ocupado: boolean;
  onSalvarTempos: (seconds: number[]) => Promise<void>;
  onDesligar: () => Promise<void>;
  onErroLocal: (erro: string) => void;
}) {
  // Texto do campo é estado próprio: o que a pessoa digita só vira `seconds` ao salvar.
  const [texto, setTexto] = useState(video.seconds.map(formatarTempo).join(', '));
  const primeiro = video.seconds[0] ?? null;
  const campoId = `gd-tempos-${video.materialId}`;

  return (
    <li className="gd-video">
      <div className="gd-video-cabeca">
        <Link to={`/praise/${video.praiseId}`}>{rotuloDoLouvor(video)}</Link>
        <a href={linkNoTempo(video.url, primeiro)} target="_blank" rel="noopener noreferrer" className="ge-btn">Abrir no YouTube</a>
      </div>
      <div className="gd-video-tempos">
        {video.seconds.length === 0 ? (
          <span className="cp-number">tempos não mapeados</span>
        ) : (
          video.seconds.map((s) => (
            <a key={s} href={linkNoTempo(video.url, s)} target="_blank" rel="noopener noreferrer" className="gd-chip">{formatarTempo(s)}</a>
          ))
        )}
      </div>
      {podeEditar ? (
        <div className="edit-actions">
          <label htmlFor={campoId} className="cp-number">Tempos</label>
          <input id={campoId} aria-label="Tempos" placeholder="1:23, 2:21" value={texto} onChange={(e) => setTexto(e.target.value)} className="ge-input" />
          <button
            type="button"
            className="ge-btn"
            disabled={ocupado}
            onClick={() => {
              const r = parseTempos(texto);
              if (!r.ok) onErroLocal(r.erro);
              else void onSalvarTempos(r.seconds);
            }}
          >
            Salvar tempos
          </button>
          <button type="button" className="ge-btn ge-btn--perigo" disabled={ocupado} onClick={() => void onDesligar()}>Desligar</button>
        </div>
      ) : null}
    </li>
  );
}
```

Nota: o `<label htmlFor>` e o `aria-label="Tempos"` juntos fazem o nome acessível ser "Tempos" (o `aria-label` vence) — os testes buscam por `{ name: 'Tempos' }`.

- [ ] **Step 3: CSS**

Em `web/src/styles/global.css`, logo depois da linha `.gd-usos { … }`:

```css
.gd-videos { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.gd-video { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--border-default); }
.gd-video:first-child { border-top: 0; padding-top: 0; }
.gd-video-cabeca { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.gd-video-tempos { display: flex; gap: 6px; flex-wrap: wrap; }
.gd-chip { font-size: 0.85rem; padding: 2px 8px; border: 1px solid var(--border-default); border-radius: 999px; text-decoration: none; color: var(--text-primary); background: var(--bg-surface); }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/gestures/SecaoVideosDoGesto.tsx web/src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx web/src/styles/global.css
git commit -m "feat(web): seção Vídeos do gesto — lista, chips no tempo, salvar tempos e desligar"
```

---

### Task 8: "Adicionar vídeo" — busca de louvor e escolha do material youtube

**Files:**
- Modify: `web/src/components/gestures/SecaoVideosDoGesto.tsx`
- Test: `web/src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx`

**Interfaces:**
- Consumes: `searchPraises({ query, limit })` → `{ data: Praise[] }` e `getPraise(id)` → `PraiseDetail` (com `materials[]`, cada um com `type` e `url`), já em `services/api.ts`; `putGestureVideo` (Task 5).

- [ ] **Step 1: Testes que falham**

Acrescentar ao fim do arquivo de teste (imports de `Praise`/`PraiseDetail` de `'../../../types'`):

```tsx
describe('SecaoVideosDoGesto — adicionar vídeo', () => {
  const louvores = [
    { id: 'p3', name: 'Três', number: '3' },
    { id: 'p1', name: 'Nove', number: '9' },
  ] as unknown as Praise[];
  const detalheComYoutube = {
    id: 'p3', name: 'Três', number: '3', materials: [
      { id: 'pdf3', type: 'pdf', material_kind_name: 'Partitura', url: null },
      { id: 'y3', type: 'youtube', material_kind_name: 'Vídeo CIAs', url: 'https://youtu.be/ccccccccccc' },
    ],
  } as unknown as PraiseDetail;

  it('busca o louvor, mostra só os materiais youtube e liga com seconds vazio', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'searchPraises').mockResolvedValue({ data: louvores, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } as never);
    vi.spyOn(api, 'getPraise').mockResolvedValue(detalheComYoutube);
    const put = vi.spyOn(api, 'putGestureVideo').mockResolvedValue(entrada);
    const { onAlterado } = montar();
    await user.click(screen.getByRole('button', { name: 'Adicionar vídeo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar louvor' }), 'tr');
    await user.click(await screen.findByRole('button', { name: '3 - Três' }));
    expect(screen.queryByText('Partitura')).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Vídeo CIAs' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('aaaaaaaaaaaa', 'y3', []));
    expect(onAlterado).toHaveBeenCalledWith(entrada);
    expect(screen.getByRole('status')).toHaveTextContent('Vídeo ligado.');
    expect(screen.queryByRole('searchbox', { name: 'Buscar louvor' })).toBeNull();
  });

  it('louvor sem youtube avisa; material já ligado aparece desabilitado', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'searchPraises').mockResolvedValue({ data: louvores, pagination: { page: 1, limit: 10, total: 2, totalPages: 1 } } as never);
    vi.spyOn(api, 'getPraise')
      .mockResolvedValueOnce({ id: 'p3', name: 'Três', number: '3', materials: [{ id: 'pdf3', type: 'pdf', url: null }] } as unknown as PraiseDetail)
      .mockResolvedValueOnce({ id: 'p1', name: 'Nove', number: '9', materials: [{ id: 'y1', type: 'youtube', material_kind_name: 'Vídeo', url: 'https://youtu.be/aaaaaaaaaaa' }] } as unknown as PraiseDetail);
    montar();
    await user.click(screen.getByRole('button', { name: 'Adicionar vídeo' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar louvor' }), 'x');
    await user.click(await screen.findByRole('button', { name: '3 - Três' }));
    expect(await screen.findByText('Este louvor não tem vídeo do YouTube.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '9 - Nove' }));
    const jaLigado = await screen.findByRole('button', { name: /Vídeo.*já ligado/ });
    expect(jaLigado).toBeDisabled();
  });

  it('sem sessão não há "Adicionar vídeo"', () => {
    montar(false);
    expect(screen.queryByRole('button', { name: 'Adicionar vídeo' })).toBeNull();
  });
});
```

Run: `cd web && npx vitest run src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx` → FAIL (botão não existe).

- [ ] **Step 2: Implementar**

No componente, acrescentar imports: `import { useEffect } from 'react'` (junto do `useState`), `import type { Praise, PraiseDetail } from '../../types';` e `getPraise, searchPraises` no import de `services/api`. Em `SecaoVideosDoGesto`, depois de `const [aviso, …]`, acrescentar `const [adicionando, setAdicionando] = useState(false);` e, antes do `{aviso ? …}` no JSX:

```tsx
      {podeEditar ? (
        adicionando ? (
          <AdicionarVideo
            jaLigados={new Set(videos.map((v) => v.materialId))}
            ocupado={ocupado}
            onEscolher={(materialId) => {
              setAdicionando(false);
              void executar(() => putGestureVideo(gestureId, materialId, []), 'Vídeo ligado.');
            }}
            onCancelar={() => setAdicionando(false)}
          />
        ) : (
          <button type="button" className="ge-btn" onClick={() => setAdicionando(true)}>Adicionar vídeo</button>
        )
      ) : null}
```

E no fim do arquivo:

```tsx
/** Busca de louvor → materiais youtube dele → escolhe um. Mesmo `searchPraises` da Home. */
function AdicionarVideo({ jaLigados, ocupado, onEscolher, onCancelar }: {
  jaLigados: Set<string>;
  ocupado: boolean;
  onEscolher: (materialId: string) => void;
  onCancelar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [louvores, setLouvores] = useState<Praise[]>([]);
  const [escolhido, setEscolhido] = useState<PraiseDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Busca a cada termo digitado; `cancelado` descarta respostas de termos velhos.
  useEffect(() => {
    if (!termo.trim()) return;
    let cancelado = false;
    searchPraises({ query: termo.trim(), limit: 10 })
      .then((r) => { if (!cancelado) setLouvores(r.data); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha na busca'); });
    return () => { cancelado = true; };
  }, [termo]);

  const abrirLouvor = async (id: string) => {
    setErro(null);
    try {
      setEscolhido(await getPraise(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o louvor');
    }
  };
  const youtubes = escolhido?.materials.filter((m) => m.type === 'youtube') ?? [];

  return (
    <div className="gd-adicionar-video">
      <div className="edit-actions">
        <input type="search" aria-label="Buscar louvor" placeholder="Número ou nome do louvor" value={termo} onChange={(e) => setTermo(e.target.value)} className="ge-picker-busca" autoFocus />
        <button type="button" className="ge-btn" onClick={onCancelar}>Cancelar</button>
      </div>
      {louvores.length > 0 ? (
        <ul className="gd-lista-louvores">
          {louvores.map((p) => (
            <li key={p.id}>
              <button type="button" className="ge-btn" aria-pressed={escolhido?.id === p.id} onClick={() => void abrirLouvor(p.id)}>
                {p.number ? `${p.number} - ` : ''}{p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {escolhido ? (
        youtubes.length === 0 ? (
          <p className="materials-placeholder">Este louvor não tem vídeo do YouTube.</p>
        ) : (
          <ul className="gd-lista-louvores">
            {youtubes.map((m) => {
              const ligado = jaLigados.has(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className="ge-btn" disabled={ocupado || ligado} onClick={() => onEscolher(m.id)}>
                    {m.material_kind_name || m.url || m.id}{ligado ? ' · já ligado' : ''}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
      {erro ? <span className="cp-review-error" role="status">{erro}</span> : null}
    </div>
  );
}
```

CSS, depois de `.gd-chip`:

```css
.gd-adicionar-video { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.gd-lista-louvores { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 3: Rodar e ver passar**

Run: `cd web && npx vitest run src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx` → PASS (todos os describes).

Se o teste "já ligado" não achar o botão pelo nome, é porque o texto do material fica `Vídeo · já ligado` — o regex `/Vídeo.*já ligado/` casa; conferir que `role="status"` não duplica (há um `status` no pai e outro no filho só quando há erro).

- [ ] **Step 4: Commit**

```bash
git add web/src/components/gestures/SecaoVideosDoGesto.tsx web/src/components/gestures/__tests__/SecaoVideosDoGesto.test.tsx web/src/styles/global.css
git commit -m "feat(web): adicionar vídeo ao gesto pela busca de louvor"
```

---

### Task 9: Montar a seção na página do gesto

**Files:**
- Modify: `web/src/pages/GestureDetailPage.tsx`
- Test: `web/src/pages/__tests__/GestureDetailPage.test.tsx`

**Interfaces:**
- Consumes: `SecaoVideosDoGesto` (Tasks 7–8).

- [ ] **Step 1: Teste que falha**

Em `GestureDetailPage.test.tsx`, na constante `entrada`, trocar `videos: []` (que o `sed` da Task 5 pôs em `base`) por dados: alterar `base` para ter

```ts
videos: [{ materialId: 'y1', praiseId: 'p1', praiseNumber: '182', praiseName: 'Quero viver', url: 'https://youtu.be/aaaaaaaaaaa', seconds: [83] }],
```

e acrescentar um teste:

```tsx
  it('mostra a seção Vídeos com o link no tempo e, ao desligar, troca a entrada pela resposta', async () => {
    const user = userEvent.setup();
    montar();
    vi.spyOn(api, 'deleteGestureVideo').mockResolvedValue({ ...base, videos: [] });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vídeos' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Abrir no YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aaaaaaaaaaa&t=83s');
    await user.click(screen.getByRole('button', { name: 'Desligar' }));
    expect(await screen.findByText('Nenhum vídeo ligado a este gesto.')).toBeInTheDocument();
    // a lista de usos continua: a resposta da rota não traz usages, a página preserva os dela
    expect(screen.getByRole('link', { name: /182/ })).toBeInTheDocument();
  });
```

Run: `cd web && npx vitest run src/pages/__tests__/GestureDetailPage.test.tsx` → FAIL (não há heading "Vídeos").

- [ ] **Step 2: Implementar**

Em `GestureDetailPage.tsx`: `import { SecaoVideosDoGesto } from '../components/gestures/SecaoVideosDoGesto';`. Entre a seção "Dados" e "Usado em":

```tsx
      <SecaoVideosDoGesto
        gestureId={id}
        videos={entrada.videos}
        podeEditar={isAuthenticated}
        onAlterado={(e) => setEntrada({ ...e, usages: entrada.usages })}
      />
```

- [ ] **Step 3: Rodar a página e o web inteiro**

Run: `cd web && npx vitest run src/pages/__tests__/GestureDetailPage.test.tsx && npx vitest run` → PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/GestureDetailPage.tsx web/src/pages/__tests__/GestureDetailPage.test.tsx
git commit -m "feat(web): página do gesto ganha a seção Vídeos"
```

---

### Task 10: Verificação completa, spec e PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-gestos-videos-design.md` (linha `Status:`)
- Modify: `scripts/README.md` ou `api/README.md` só se listarem as migrações (conferir com `grep -rn "018_gestures" --include=*.md .`)

- [ ] **Step 1: `verify:strict`**

Run na raiz: `npm run verify:strict`
Expected: exit 0; API 435 + novos; web 921 + novos; cobertura do web ≥ 91 / 83 / 90 / 94. Se algum limiar cair, cobrir o trecho descoberto (o `npx vitest run --coverage` do web imprime por arquivo) antes de seguir — a catraca nunca baixa.

- [ ] **Step 2: Catraca**

Se os quatro números do web subiram ≥ 1 ponto sobre os limiares em `web/vitest.config.ts`, subir os limiares para os novos inteiros (regra da casa: só sobe). Senão, deixar.

- [ ] **Step 3: Spec**

Em `docs/superpowers/specs/2026-09-15-gestos-videos-design.md`, trocar `Status: aprovado em conversa; aguardando revisão do texto` por `Status: implementado (PR feat/gestos-videos → develop)`.

- [ ] **Step 4: Commit e PR**

```bash
git add -A docs web/vitest.config.ts
git commit -m "docs(gestos): spec dos vídeos marcada como implementada"
git push -u origin feat/gestos-videos
gh pr create --base develop --head feat/gestos-videos --title "Gestos: vídeos por gesto (ocorrências no YouTube)" --body "$(cat <<'EOF'
## O que muda

- Migração **020** `gesture_video_occurrences` — **aplicar à mão antes do deploy do Worker**: `cd api && wrangler d1 execute coldigom --remote --file=migrations/020_gesture_videos.sql`.
- Cada entrada do dicionário ganha `videos` (aditivo; schema segue `/1`; o coldigui ignora até usar).
- `PUT`/`DELETE /api/gestures/dictionary/:id/videos/:materialId`; apagar um material youtube com ocorrências bumpa a versão.
- Página do gesto: seção **Vídeos** — lista com "Abrir no YouTube" no primeiro tempo, chips por ocorrência, tempos editáveis (`1:23, 2:21`), desligar, e "Adicionar vídeo" pela busca de louvor.

Spec: `docs/superpowers/specs/2026-09-15-gestos-videos-design.md`. Depende do #25.

## Como testar

1. `/gestos/dicionario/<id>` logado → **Adicionar vídeo** → buscar um louvor com material youtube → clicar no vídeo. Ele aparece em "Vídeos" com "tempos não mapeados".
2. Digitar `1:23, 2:21` em **Tempos** → **Salvar tempos** → chips `1:23` e `2:21`; "Abrir no YouTube" leva a `&t=83s`.
3. `curl -I …/api/gestures/dictionary` → ETag subiu a cada passo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Aq3JSaYD81hmB6n4pQU9Cy
EOF
)"
```

- [ ] **Step 5: Avisar o dono**

Na resposta final: a migração 020 é dele (`wrangler d1 execute … --remote`), tem que ir **antes** do deploy do Worker; o deploy só dispara quando `develop` for mesclado em `main`.
