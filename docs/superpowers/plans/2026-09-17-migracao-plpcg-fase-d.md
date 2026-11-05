# Migração PLPCG — Fase D (destino: manifest e resolve no coldigom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O coldigom passa a servir o que o PLPCG servia — `GET /api/plpcg/manifest` (o `louvores-manifest.json`, gerado de `plpcg_crosswalk`), `GET /api/plpcg/manifest/checksum` e `GET /api/plpcg/resolve/:shortId` (o `?s=` dos links antigos) — para o coldigui e o plpcjf poderem trocar de fonte só mudando a URL base, e o `core.plpcg` guarda a exportação final do catálogo do PLPCG em `gabaritos/`.

**Architecture:** Três rotas públicas novas num módulo de rota próprio (`api/src/routes/plpcg.ts`), com a montagem do manifest e a resolução do `short_id` em módulos puros testáveis com um D1 falso (`api/src/plpcgManifest.ts`, `api/src/plpcgResolve.ts`), no mesmo desenho de `plpcgPraises.ts` / `/api/plpcg/catalog`. O manifest é **uma entrada por linha de `plpcg_crosswalk`** (JOIN interno com `praise_materials` e `praises`): `pdfId`, `groupId` e `shortId` são os do PLPCG (as chaves de cache e os links antigos sobrevivem); `nome`, `numero`, `classificacao`, `categoria` vêm do coldigom; `pdf` é a URL absoluta do arquivo no coldigom. ETag = sha256 do corpo, e o checksum é o mesmo hex — o coldigui compara textualmente, como faz hoje com `/api/catalog/checksum` do Worker `plpcg-catalog`. Nada muda no `web/`, no `plpcg_apply` nem no site de revisão.

**Tech Stack:** Hono 4 + Cloudflare Workers (D1), TypeScript, vitest (D1 falso por texto da query, como em `index.test.ts`); Python 3.9 stdlib + pytest para o `core.plpcg`.

**Spec:** `docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md` — §3 (D6, D10, D11), §8 (tabela, endpoints, desligamento), §9 (fase D e portão), §12.

## Global Constraints

- Branch de trabalho a partir de `develop` (é onde estão a migração 019, o `/api/plpcg/catalog`, o spec e o README da migração; `main` não tem nenhum dos quatro). Nada de `git push`; nada de trocar de branch no checkout principal (`/Volumes/SSD 2TB SD/dev/coldigom`, outra sessão usa).
- Entra no coldigom **só o resultado** (D6/D11): as três rotas, os dois módulos, `schema.sql`, testes. Nenhuma lógica de decisão/migração em `api/`; nada em `web/`.
- As rotas são públicas (sem `requireAuth`), como `/api/plpcg/praises` e `/api/plpcg/catalog`: o coldigui e o plpcjf leem sem sessão. O CORS já cobre `https://*plpcg.com`, `https://plpcjf.org`, `https://plpcg-v2.pages.dev` (`api/wrangler.toml` `WEB_ORIGIN`); não mexer.
- Formato do manifest = o do `dev/plpcjf/louvores-manifest.json` (array JSON puro; chaves `nome`, `classificacao`, `numero`, `categoria`, `pdf`, `pdfId`, `groupId`, `shortId`, todas string), mais `praiseId` e `materialId`. Chaves extras não quebram os clientes (`LouvorDto.fromJson` do coldigui lê só as conhecidas).
- `categoria` é uma das cinco do PLPCG (`plpcg-admin/worker/src/types.ts` `CATEGORIAS`): `Partitura`, `Cifra`, `Cifra nível I`, `Cifra nível II`, `Gestos em Gravura`. Inverso do `KIND_PADRAO` do site (D10): `Chord Chart` → `Cifra`, `Chord Chart I` → `Cifra nível I`, `Chord Chart II` → `Cifra nível II`, `CIAs Gestures` → `Gestos em Gravura`, **qualquer outro kind (ou nenhum)** → `Partitura`.
- `pdf` e `url` são absolutos na origem da requisição (`new URL(c.req.url).origin`) + `/` + `praise_materials.r2_key` (todos os PDFs do acervo têm `r2_key = assets/praises/<praise_id>/<material_id>.pdf`; a rota `GET /assets/*` serve isso). Sem `r2_key`, deriva `assets/praises/<praise_id>/<material_id>.pdf`.
- Inventário de rotas (`api/src/__tests__/routes.inventory.test.ts`) atualizado **no mesmo commit** que registra cada rota; `registerPlpcgRoutes(app)` entra logo depois de `registerPraisesRoutes(app)` em `api/src/index.ts`.
- Catraca de cobertura do `api/vitest.config.ts` (78 / 73 / 80 / 81) não pode cair: `cd api && npx vitest run --coverage` verde antes de cada commit de `api/`. `npm run lint` limpo.
- Comandos: `cd api && npm ci` uma vez no worktree (não há `node_modules`); testes TS: `cd api && npx vitest run <arquivo>`; testes Python: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`.
- Mensagens de commit em português, no padrão do repo (`feat(api): …`, `test(api): …`, `docs(validate-acervo): …`), terminando com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## Arquivos

| arquivo | responsabilidade |
|---|---|
| `api/schema.sql` (modificar) | ganha a tabela `plpcg_crosswalk` e os dois índices da migração 019 — o bootstrap de um D1 novo tem que conhecer a tabela que as rotas leem |
| `api/src/__tests__/schemaSync.test.ts` (modificar) | caso `019` — migração e `schema.sql` com os mesmos trechos |
| `api/src/etag.ts` (criar) | `sha256Hex(text)` e `etagMatches(ifNoneMatch, etag)` — o par que o manifest e o checksum usam |
| `api/src/plpcgManifest.ts` (criar) | `categoriaPlpcg`, `classificacaoPlpcg`, `pdfUrl`, `MANIFEST_SQL`, `MANIFEST_TAGS_SQL`, `buildPlpcgManifest(db, {origin}, ifNoneMatch)` |
| `api/src/plpcgResolve.ts` (criar) | `normalizarShortId`, `RESOLVE_SQL`, `resolvePlpcgShortId(db, shortId, origin)` |
| `api/src/routes/plpcg.ts` (criar) | `registerPlpcgRoutes(app)`: `GET /api/plpcg/manifest`, `GET /api/plpcg/manifest/checksum`, `GET /api/plpcg/resolve/:shortId` |
| `api/src/index.ts` (modificar) | importa e registra `registerPlpcgRoutes` depois de `registerPraisesRoutes` |
| `api/src/__tests__/routes.inventory.test.ts` (modificar) | três linhas novas depois do segundo `POST /api/praises/:id/materials/bulk-upload` |
| `api/src/__tests__/plpcgManifest.test.ts` (criar) | funções puras + `buildPlpcgManifest` com D1 falso |
| `api/src/__tests__/plpcgRoutes.test.ts` (criar) | as três rotas via `app.request` (status, headers, CORS, 304/204, 302, 400/404, 500) |
| `scripts/validate-acervo/core/plpcg.py` (modificar) | `guardar_exportacao_final(dumps_dir, destino, quando)` + flag `--guardar-final` |
| `scripts/validate-acervo/tests/test_plpcg.py` (modificar) | teste da exportação final |
| `docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md` (modificar) | §8.2 com o contrato concreto; §8.3 e §12 ajustados; §9 linha D |
| `scripts/validate-acervo/README.md` (modificar) | seção **Fase D** com os `curl` e o `--guardar-final` |

---

### Task 1: `schema.sql` conhece a `plpcg_crosswalk` (migração 019)

**Files:**
- Modify: `api/schema.sql` (fim do arquivo)
- Modify: `api/src/__tests__/schemaSync.test.ts` (novo `it` depois do `018`)

**Interfaces:**
- Consumes: `api/migrations/019_plpcg_crosswalk.sql` (já existe em `develop`, aplicada em produção em 15/09/2026).
- Produces: nada em código; a tabela passa a existir num D1 criado do zero com `npm run d1:execute`.

- [ ] **Step 1: Escrever o teste que falha**

Em `api/src/__tests__/schemaSync.test.ts`, depois do bloco `it('018: …')` e antes do `});` que fecha o `describe`, acrescentar:

```ts
  it('019: a tabela plpcg_crosswalk e os dois índices estão nos dois', () => {
    const schema = normal(readFileSync(resolve(RAIZ, 'schema.sql'), 'utf8'));
    const mig = normal(readFileSync(resolve(RAIZ, 'migrations', '019_plpcg_crosswalk.sql'), 'utf8'));
    for (const trecho of [
      'CREATE TABLE IF NOT EXISTS plpcg_crosswalk (',
      'CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_short ON plpcg_crosswalk(short_id)',
      'CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_praise ON plpcg_crosswalk(praise_id)',
    ]) {
      expect(mig, `migração sem: ${trecho}`).toContain(trecho);
      expect(schema, `schema.sql sem: ${trecho}`).toContain(trecho);
    }
    const colunas = ['pdf_id TEXT PRIMARY KEY', 'short_id TEXT NOT NULL', 'group_id TEXT NOT NULL',
      'praise_id TEXT NOT NULL', 'praise_material_id TEXT NOT NULL', 'evidencia TEXT NOT NULL',
      'confianca TEXT NOT NULL', 'decidido_por TEXT NOT NULL', 'run_id TEXT NOT NULL',
      "created_at TEXT NOT NULL DEFAULT (datetime('now'))"];
    for (const c of colunas) {
      expect(mig).toContain(c);
      expect(schema).toContain(c);
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: FAIL em `schema.sql sem: CREATE TABLE IF NOT EXISTS plpcg_crosswalk (` (a migração já tem tudo; o `schema.sql` não).

- [ ] **Step 3: Acrescentar a tabela ao `schema.sql`**

No fim de `api/schema.sql`, colar exatamente (é o corpo da migração 019, sem o cabeçalho de comentários dela):

```sql

-- Crosswalk PLPCG → coldigom (migração 019; spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md §8.1).
-- Uma linha por pdf_id do PLPCG apontando o material do coldigom que o substitui.
-- Sem FK, como o resto: quem escreve é scripts/validate-acervo/core/plpcg_apply.py;
-- quem lê é GET /api/plpcg/manifest e /api/plpcg/resolve/:shortId.
CREATE TABLE IF NOT EXISTS plpcg_crosswalk (
  pdf_id             TEXT PRIMARY KEY,                       -- base64 urlsafe do caminho do PDF no PLPCG
  short_id           TEXT NOT NULL,                          -- o ?s= dos links antigos
  group_id           TEXT NOT NULL,                          -- 'NNN:slug' | 'avulso:slug' — o louvor no PLPCG
  praise_id          TEXT NOT NULL,
  praise_material_id TEXT NOT NULL,
  evidencia          TEXT NOT NULL,                          -- 'num+slug+hash+path' | 'site:é este' …
  confianca          TEXT NOT NULL,                          -- alta | media | humano
  decidido_por       TEXT NOT NULL,                          -- detector | jairo
  run_id             TEXT NOT NULL,                          -- o run do apply que escreveu (undo)
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_short ON plpcg_crosswalk(short_id);
CREATE INDEX IF NOT EXISTS idx_plpcg_crosswalk_praise ON plpcg_crosswalk(praise_id);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/schemaSync.test.ts`
Expected: PASS (3 casos: 017, 018, 019).

- [ ] **Step 5: Commit**

```bash
git add api/schema.sql api/src/__tests__/schemaSync.test.ts
git commit -m "feat(api): schema.sql ganha a plpcg_crosswalk da migração 019

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `etag.ts` e `plpcgManifest.ts` — o manifest montado do crosswalk

**Files:**
- Create: `api/src/etag.ts`
- Create: `api/src/plpcgManifest.ts`
- Test: `api/src/__tests__/plpcgManifest.test.ts`

**Interfaces:**
- Consumes: `TAG_LABEL_SQL` de `api/src/praiseQuery.ts` (`CASE WHEN tp.name IS NOT NULL THEN tp.name || ' · ' || t.name ELSE t.name END`) — o mesmo rótulo `pai · filha` do `/api/plpcg/catalog`.
- Produces (Task 3 e 4 dependem disto):
  - `sha256Hex(text: string): Promise<string>` — 64 hex minúsculos.
  - `etagMatches(ifNoneMatch: string | undefined, etag: string): boolean` — aceita lista separada por vírgula, `W/`, `*`.
  - `categoriaPlpcg(kind: string | null): string`
  - `classificacaoPlpcg(labels: string[]): string` — `labels.join(', ')`.
  - `pdfUrl(origin: string, praiseId: string, materialId: string, r2Key: string | null): string`
  - `MANIFEST_SQL`, `MANIFEST_TAGS_SQL` (strings exportadas — os testes de rota casam pelo texto).
  - `type PlpcgManifestEntry = { nome; classificacao; numero; categoria; pdf; pdfId; groupId; shortId; praiseId; materialId }` (todas `string`).
  - `buildPlpcgManifest(db: D1Database, deps: { origin: string }, ifNoneMatch: string | undefined): Promise<{ status: 200 | 304; headers: Record<string, string>; body: string; checksum: string }>` — `headers` = `{ ETag: '"<checksum>"', 'Cache-Control': 'public, max-age=300' }`; em 304 o `body` é `''`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `api/src/__tests__/plpcgManifest.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { etagMatches, sha256Hex } from '../etag';
import {
  MANIFEST_SQL,
  MANIFEST_TAGS_SQL,
  buildPlpcgManifest,
  categoriaPlpcg,
  classificacaoPlpcg,
  pdfUrl,
} from '../plpcgManifest';

/** Linha do JOIN de MANIFEST_SQL, como o D1 devolve. */
const LINHA = {
  pdf_id: 'TG91dm9yZXMgQ29sZXTDom5lYSBDSUFzLzAwMSAtIE1ldSBEZXVzLCBtZXUgcGFpL0NpZnJhIEkucGRm',
  short_id: '0453',
  group_id: '001:meu-deus-meu-pai',
  praise_id: 'p1',
  material_id: 'm1',
  nome: 'Meu Deus, meu pai',
  numero: '001',
  kind: 'Chord Chart I',
  r2_key: 'assets/praises/p1/m1.pdf',
};

/** D1 falso: despacha pelo texto da query. praise_tags antes de plpcg_crosswalk — a query de tags cita as duas. */
function fakeDb(opts: { crosswalk?: unknown[]; tags?: unknown[]; falha?: Error } = {}) {
  const results = (sql: string) => {
    if (opts.falha) throw opts.falha;
    if (sql.includes('FROM praise_tags')) return opts.tags ?? [];
    if (sql.includes('FROM plpcg_crosswalk')) return opts.crosswalk ?? [];
    return [];
  };
  return {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(async () => ({ results: results(sql) })),
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: results(sql) })),
        first: vi.fn(async () => null),
      })),
    })),
  } as unknown as D1Database;
}

describe('etag', () => {
  it('sha256Hex: 64 hex do texto em UTF-8', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex('ção')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('etagMatches: forte, fraco, lista e curinga', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"x", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
    expect(etagMatches('"abd"', '"abc"')).toBe(false);
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });
});

describe('categoriaPlpcg — as cinco categorias do PLPCG a partir do kind do coldigom', () => {
  it.each([
    ['Chord Chart', 'Cifra'],
    ['Chord Chart I', 'Cifra nível I'],
    ['Chord Chart II', 'Cifra nível II'],
    ['CIAs Gestures', 'Gestos em Gravura'],
    ['Choir', 'Partitura'],
    ['Sheet Music', 'Partitura'],
    ['Choir and Piano', 'Partitura'],
    ['Unknown', 'Partitura'],
    [null, 'Partitura'],
  ])('%s → %s', (kind, categoria) => {
    expect(categoriaPlpcg(kind)).toBe(categoria);
  });
});

describe('classificacaoPlpcg e pdfUrl', () => {
  it('classificacao junta os rótulos das tags na ordem recebida; sem tag fica em branco', () => {
    expect(classificacaoPlpcg(['CIAs', 'Coletânea'])).toBe('CIAs, Coletânea');
    expect(classificacaoPlpcg([])).toBe('');
  });

  it('pdfUrl: origem + r2_key; sem r2_key deriva o caminho padrão', () => {
    expect(pdfUrl('https://api.exemplo', 'p1', 'm1', 'assets/praises/p1/m1.pdf')).toBe(
      'https://api.exemplo/assets/praises/p1/m1.pdf',
    );
    expect(pdfUrl('https://api.exemplo', 'p1', 'm1', null)).toBe('https://api.exemplo/assets/praises/p1/m1.pdf');
    expect(pdfUrl('https://api.exemplo/', 'p1', 'm1', '/assets/praises/p1/m1.pdf')).toBe(
      'https://api.exemplo/assets/praises/p1/m1.pdf',
    );
  });
});

describe('buildPlpcgManifest', () => {
  it('uma entrada por linha do crosswalk, no formato do louvores-manifest.json', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({
        crosswalk: [LINHA],
        tags: [
          { praise_id: 'p1', label: 'CIAs' },
          { praise_id: 'p1', label: 'Coletânea' },
          { praise_id: 'outro', label: 'PES' },
        ],
      }),
      { origin: 'http://localhost' },
      undefined,
    );
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual([
      {
        nome: 'Meu Deus, meu pai',
        classificacao: 'CIAs, Coletânea',
        numero: '001',
        categoria: 'Cifra nível I',
        pdf: 'http://localhost/assets/praises/p1/m1.pdf',
        pdfId: LINHA.pdf_id,
        groupId: '001:meu-deus-meu-pai',
        shortId: '0453',
        praiseId: 'p1',
        materialId: 'm1',
      },
    ]);
  });

  it('numero nulo vira "", praise sem tag tem classificacao "", kind nulo é Partitura', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({ crosswalk: [{ ...LINHA, numero: null, kind: null, r2_key: null }] }),
      { origin: 'http://localhost' },
      undefined,
    );
    const [e] = JSON.parse(r.body);
    expect(e.numero).toBe('');
    expect(e.classificacao).toBe('');
    expect(e.categoria).toBe('Partitura');
    expect(e.pdf).toBe('http://localhost/assets/praises/p1/m1.pdf');
  });

  it('preserva a ordem que o SQL devolveu (a ordenação é do ORDER BY, não do JS)', async () => {
    const r = await buildPlpcgManifest(
      fakeDb({ crosswalk: [{ ...LINHA, pdf_id: 'B', short_id: '0002' }, { ...LINHA, pdf_id: 'A', short_id: '0001' }] }),
      { origin: 'http://localhost' },
      undefined,
    );
    expect(JSON.parse(r.body).map((e: { pdfId: string }) => e.pdfId)).toEqual(['B', 'A']);
  });

  it('ETag e checksum são o sha256 do corpo; If-None-Match igual dá 304 sem corpo', async () => {
    const db = fakeDb({ crosswalk: [LINHA] });
    const cheio = await buildPlpcgManifest(db, { origin: 'http://localhost' }, undefined);
    expect(cheio.checksum).toBe(await sha256Hex(cheio.body));
    expect(cheio.headers).toEqual({ ETag: `"${cheio.checksum}"`, 'Cache-Control': 'public, max-age=300' });

    const igual = await buildPlpcgManifest(db, { origin: 'http://localhost' }, `W/"${cheio.checksum}"`);
    expect(igual.status).toBe(304);
    expect(igual.body).toBe('');
    expect(igual.checksum).toBe(cheio.checksum);
    expect(igual.headers.ETag).toBe(cheio.headers.ETag);

    const outro = await buildPlpcgManifest(db, { origin: 'http://localhost' }, '"nada"');
    expect(outro.status).toBe(200);
  });

  it('crosswalk vazio: "[]" com ETag, nunca erro', async () => {
    const r = await buildPlpcgManifest(fakeDb(), { origin: 'http://localhost' }, undefined);
    expect(r.status).toBe(200);
    expect(r.body).toBe('[]');
    expect(r.headers.ETag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it('o SQL faz JOIN interno com praise_materials e praises e restringe as tags ao crosswalk', () => {
    // Linha cujo material ou praise sumiu do app não entra: melhor faltar no manifest que apontar 404.
    expect(MANIFEST_SQL).toMatch(/JOIN praise_materials pm ON pm\.id = cw\.praise_material_id/);
    expect(MANIFEST_SQL).toMatch(/JOIN praises p ON p\.id = cw\.praise_id/);
    expect(MANIFEST_SQL).not.toMatch(/LEFT JOIN praise/);
    expect(MANIFEST_SQL).toMatch(/ORDER BY p\.number, p\.name, cw\.pdf_id/);
    expect(MANIFEST_TAGS_SQL).toMatch(/WHERE pt\.praise_id IN \(SELECT praise_id FROM plpcg_crosswalk\)/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/plpcgManifest.test.ts`
Expected: FAIL — `Cannot find module '../etag'`.

- [ ] **Step 3: Criar `api/src/etag.ts`**

```ts
/** sha256 do texto em UTF-8, 64 hex minúsculos — o ETag e o checksum do manifest PLPCG. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tira o `W/` de um ETag fraco — compressão de borda pode enfraquecer o ETag no caminho. */
function forte(value: string): string {
  const v = value.trim();
  return v.startsWith('W/') ? v.slice(2) : v;
}

/** `If-None-Match` casa com `etag`? Aceita lista separada por vírgula, ETag fraco e `*`. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  const alvo = forte(etag);
  return ifNoneMatch.split(',').some((candidato) => forte(candidato) === alvo);
}
```

- [ ] **Step 4: Criar `api/src/plpcgManifest.ts`**

```ts
import { sha256Hex, etagMatches } from './etag';
import { TAG_LABEL_SQL } from './praiseQuery';

/**
 * GET /api/plpcg/manifest — o `louvores-manifest.json` do PLPCG gerado do
 * coldigom (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md §8.2).
 *
 * Uma entrada por linha de `plpcg_crosswalk`. `pdfId`, `groupId` e `shortId`
 * são os do PLPCG — as chaves de cache do coldigui/plpcjf e os links `?s=`
 * sobrevivem à troca de fonte. `nome`, `numero`, `classificacao` (tags) e
 * `categoria` (kind) vêm do coldigom; `pdf` é a URL absoluta do arquivo aqui.
 * Linha cujo material ou praise sumiu do app não entra (JOIN interno): melhor
 * faltar no manifest do que apontar para um 404.
 */
export type PlpcgManifestEntry = {
  nome: string;
  classificacao: string;
  numero: string;
  categoria: string;
  pdf: string;
  pdfId: string;
  groupId: string;
  shortId: string;
  praiseId: string;
  materialId: string;
};

type CrosswalkRow = {
  pdf_id: string;
  short_id: string;
  group_id: string;
  praise_id: string;
  material_id: string;
  nome: string;
  numero: string | null;
  kind: string | null;
  r2_key: string | null;
};

type TagRow = { praise_id: string; label: string };

export const MANIFEST_SQL = `
  SELECT cw.pdf_id, cw.short_id, cw.group_id, cw.praise_id,
         cw.praise_material_id AS material_id,
         p.name AS nome, p.number AS numero, mk.name AS kind, pm.r2_key
  FROM plpcg_crosswalk cw
  JOIN praise_materials pm ON pm.id = cw.praise_material_id
  JOIN praises p ON p.id = cw.praise_id
  LEFT JOIN material_kinds mk ON mk.id = pm.material_kind
  ORDER BY p.number, p.name, cw.pdf_id`;

/** Mesmo rótulo `pai · filha` do /api/plpcg/catalog; só dos praises que estão no crosswalk. */
export const MANIFEST_TAGS_SQL = `
  SELECT DISTINCT pt.praise_id, ${TAG_LABEL_SQL} AS label
  FROM praise_tags pt
  JOIN tags t ON t.id = pt.tag_id
  LEFT JOIN tags tp ON t.parent_id = tp.id
  WHERE pt.praise_id IN (SELECT praise_id FROM plpcg_crosswalk)
  ORDER BY pt.praise_id, label`;

/**
 * O PLPCG só tinha cinco categorias; o kind do coldigom é mais fino. Inverso
 * do KIND_PADRAO do site de revisão (D10): cifras e gestos têm nome próprio,
 * todo o resto (Choir, Sheet Music, Choir and Piano, …) era "Partitura" lá.
 */
export function categoriaPlpcg(kind: string | null): string {
  switch (kind) {
    case 'Chord Chart':
      return 'Cifra';
    case 'Chord Chart I':
      return 'Cifra nível I';
    case 'Chord Chart II':
      return 'Cifra nível II';
    case 'CIAs Gestures':
      return 'Gestos em Gravura';
    default:
      return 'Partitura';
  }
}

/** A `classificacao` do PLPCG era a coletânea ("Coletânea CIAs", "PES"); aqui são as tags do praise. */
export function classificacaoPlpcg(labels: string[]): string {
  return labels.join(', ');
}

/** URL absoluta do PDF no coldigom: a rota GET /assets/* serve `r2_key` tal qual. */
export function pdfUrl(origin: string, praiseId: string, materialId: string, r2Key: string | null): string {
  const path = (r2Key ?? `assets/praises/${praiseId}/${materialId}.pdf`).replace(/^\//, '');
  return `${origin.replace(/\/$/, '')}/${path}`;
}

export type PlpcgManifestDeps = {
  /** Origem da requisição (`new URL(c.req.url).origin`) — base de `pdf`. */
  origin: string;
};

export type PlpcgManifestResult = {
  status: 200 | 304;
  headers: Record<string, string>;
  body: string;
  /** sha256 do corpo, o mesmo hex do ETag — GET /api/plpcg/manifest/checksum devolve isto. */
  checksum: string;
};

export async function buildPlpcgManifest(
  db: D1Database,
  deps: PlpcgManifestDeps,
  ifNoneMatch: string | undefined,
): Promise<PlpcgManifestResult> {
  const linhas = ((await db.prepare(MANIFEST_SQL).all()).results ?? []) as CrosswalkRow[];
  const tags = ((await db.prepare(MANIFEST_TAGS_SQL).all()).results ?? []) as TagRow[];

  const tagsPorPraise = new Map<string, string[]>();
  for (const t of tags) {
    const lista = tagsPorPraise.get(t.praise_id) ?? [];
    lista.push(t.label);
    tagsPorPraise.set(t.praise_id, lista);
  }

  const entradas: PlpcgManifestEntry[] = linhas.map((r) => ({
    nome: r.nome,
    classificacao: classificacaoPlpcg(tagsPorPraise.get(r.praise_id) ?? []),
    numero: r.numero ?? '',
    categoria: categoriaPlpcg(r.kind),
    pdf: pdfUrl(deps.origin, r.praise_id, r.material_id, r.r2_key),
    pdfId: r.pdf_id,
    groupId: r.group_id,
    shortId: r.short_id,
    praiseId: r.praise_id,
    materialId: r.material_id,
  }));

  const body = JSON.stringify(entradas);
  const checksum = await sha256Hex(body);
  const headers: Record<string, string> = {
    ETag: `"${checksum}"`,
    'Cache-Control': 'public, max-age=300',
  };
  if (etagMatches(ifNoneMatch, headers.ETag)) {
    return { status: 304, headers, body: '', checksum };
  }
  return { status: 200, headers, body, checksum };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/plpcgManifest.test.ts && npm run lint`
Expected: PASS (todos os casos); lint limpo.

- [ ] **Step 6: Commit**

```bash
git add api/src/etag.ts api/src/plpcgManifest.ts api/src/__tests__/plpcgManifest.test.ts
git commit -m "feat(api): manifest PLPCG montado do plpcg_crosswalk — entradas, categoria, ETag/checksum

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rotas `GET /api/plpcg/manifest` e `GET /api/plpcg/manifest/checksum`

**Files:**
- Create: `api/src/routes/plpcg.ts`
- Modify: `api/src/index.ts` (import + `registerPlpcgRoutes(app)` logo após `registerPraisesRoutes(app)`)
- Modify: `api/src/__tests__/routes.inventory.test.ts`
- Test: `api/src/__tests__/plpcgRoutes.test.ts`

**Interfaces:**
- Consumes: `buildPlpcgManifest`, `MANIFEST_SQL` (Task 2); `App` de `api/src/env.ts`.
- Produces: `registerPlpcgRoutes(app: App): void`. A Task 4 acrescenta a terceira rota **neste mesmo arquivo** e a terceira linha do inventário.

Contrato das duas rotas (vai para o spec na Task 6):

| rota | 200 | condicional |
|---|---|---|
| `GET /api/plpcg/manifest` | `application/json; charset=utf-8`, array de `PlpcgManifestEntry`, `ETag: "<sha256>"`, `Cache-Control: public, max-age=300` | `If-None-Match` igual → `304` sem corpo, com `ETag` |
| `GET /api/plpcg/manifest/checksum` | `text/plain; charset=utf-8`, corpo = o hex do sha256 (sem aspas), `ETag: "<sha256>"`, `Cache-Control: public, max-age=300` | `If-None-Match` igual → `204` sem corpo, com `ETag` (o mesmo contrato do `/api/catalog/checksum` do Worker `plpcg-catalog`) |

Erro do D1 → `500 {"error": "Failed to build manifest"}` (com `console.error`, como as rotas vizinhas).

- [ ] **Step 1: Inventário de rotas — as duas linhas novas**

Em `api/src/__tests__/routes.inventory.test.ts`, logo depois do **segundo** `'POST /api/praises/:id/materials/bulk-upload',` e antes de `'GET /api/materials/kinds',`, inserir:

```ts
  'GET /api/plpcg/manifest',
  'GET /api/plpcg/manifest/checksum',
```

- [ ] **Step 2: Escrever os testes de rota que falham**

Criar `api/src/__tests__/plpcgRoutes.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { sha256Hex } from '../etag';

const LINHA = {
  pdf_id: 'TG91dm9yZXMgQ29sZXTDom5lYSBDSUFzLzAwMSAtIE1ldSBEZXVzLCBtZXUgcGFpL0NpZnJhIEkucGRm',
  short_id: '0453',
  group_id: '001:meu-deus-meu-pai',
  praise_id: 'p1',
  material_id: 'm1',
  nome: 'Meu Deus, meu pai',
  numero: '001',
  kind: 'Chord Chart I',
  r2_key: 'assets/praises/p1/m1.pdf',
};

const WEB_ORIGIN = 'https://coldigom-web.pages.dev,https://*plpcg.com,https://plpcjf.org';

/**
 * D1 falso das três rotas: `.all()` despacha pelo texto da query (praise_tags
 * antes de plpcg_crosswalk, porque a query de tags cita as duas);
 * `.bind(x).first()` é o resolve — devolve `resolve` e registra o `x` em `binds`.
 */
function fakeDb(opts: { crosswalk?: unknown[]; tags?: unknown[]; resolve?: unknown; falha?: Error } = {}) {
  const binds: unknown[][] = [];
  const results = (sql: string) => {
    if (opts.falha) throw opts.falha;
    if (sql.includes('FROM praise_tags')) return opts.tags ?? [];
    if (sql.includes('FROM plpcg_crosswalk')) return opts.crosswalk ?? [];
    return [];
  };
  const db = {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(async () => ({ results: results(sql) })),
      bind: vi.fn((...args: unknown[]) => {
        binds.push(args);
        return {
          all: vi.fn(async () => ({ results: results(sql) })),
          first: vi.fn(async () => {
            if (opts.falha) throw opts.falha;
            return opts.resolve ?? null;
          }),
        };
      }),
    })),
  } as unknown as D1Database;
  return { db, binds };
}

describe('GET /api/plpcg/manifest', () => {
  it('array no formato do louvores-manifest.json, com ETag e cache de 5 min', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA], tags: [{ praise_id: 'p1', label: 'Coletânea' }] });
    const res = await app.request('/api/plpcg/manifest', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      nome: 'Meu Deus, meu pai',
      classificacao: 'Coletânea',
      numero: '001',
      categoria: 'Cifra nível I',
      pdf: 'http://localhost/assets/praises/p1/m1.pdf',
      pdfId: LINHA.pdf_id,
      groupId: '001:meu-deus-meu-pai',
      shortId: '0453',
      praiseId: 'p1',
      materialId: 'm1',
    });
  });

  it('If-None-Match igual ao ETag → 304 sem corpo', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const primeiro = await app.request('/api/plpcg/manifest', {}, { DB: db });
    const etag = primeiro.headers.get('etag')!;
    const segundo = await app.request('/api/plpcg/manifest', { headers: { 'If-None-Match': etag } }, { DB: db });
    expect(segundo.status).toBe(304);
    expect(segundo.headers.get('etag')).toBe(etag);
    expect(await segundo.text()).toBe('');
  });

  it('CORS: o plpcjf e o plpcg.com leem, e o ETag é exposto ao JavaScript deles', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    for (const origin of ['https://plpcjf.org', 'https://v2.plpcg.com']) {
      const res = await app.request('/api/plpcg/manifest', { headers: { origin } }, { DB: db, WEB_ORIGIN });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-expose-headers')).toContain('ETag');
    }
  });

  it('D1 fora do ar → 500 com erro genérico', async () => {
    const { db } = fakeDb({ falha: new Error('D1_ERROR: no such table: plpcg_crosswalk') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/manifest', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build manifest' });
    spy.mockRestore();
  });
});

describe('GET /api/plpcg/manifest/checksum', () => {
  it('texto com o sha256 do manifest — o mesmo hex do ETag do manifest', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const manifest = await app.request('/api/plpcg/manifest', {}, { DB: db });
    const corpo = await manifest.text();
    const res = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    const hex = await res.text();
    expect(hex).toBe(await sha256Hex(corpo));
    expect(res.headers.get('etag')).toBe(`"${hex}"`);
    expect(manifest.headers.get('etag')).toBe(`"${hex}"`);
  });

  it('If-None-Match igual → 204 sem corpo, com ETag (contrato do /api/catalog/checksum do plpcg-catalog)', async () => {
    const { db } = fakeDb({ crosswalk: [LINHA] });
    const primeiro = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });
    const etag = primeiro.headers.get('etag')!;
    const res = await app.request('/api/plpcg/manifest/checksum', { headers: { 'If-None-Match': etag } }, { DB: db });
    expect(res.status).toBe(204);
    expect(res.headers.get('etag')).toBe(etag);
    expect(await res.text()).toBe('');
  });

  it('D1 fora do ar → 500', async () => {
    const { db } = fakeDb({ falha: new Error('boom') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/manifest/checksum', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to build manifest' });
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/plpcgRoutes.test.ts src/__tests__/routes.inventory.test.ts`
Expected: FAIL — as rotas respondem 404 e o inventário não bate.

- [ ] **Step 4: Criar `api/src/routes/plpcg.ts`**

```ts
import type { App } from '../env';
import { buildPlpcgManifest } from '../plpcgManifest';

/**
 * Destino da migração PLPCG (spec docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md §8.2):
 * o que o plpcg.com servia, agora gerado do coldigom. Públicas, como
 * /api/plpcg/praises — o coldigui e o plpcjf leem sem sessão.
 */
export function registerPlpcgRoutes(app: App): void {
  // GET /api/plpcg/manifest — o louvores-manifest.json, uma entrada por linha do crosswalk (ETag/304)
  app.get('/api/plpcg/manifest', async (c) => {
    try {
      const r = await buildPlpcgManifest(
        c.env.DB,
        { origin: new URL(c.req.url).origin },
        c.req.header('If-None-Match'),
      );
      if (r.status === 304) {
        return new Response(null, { status: 304, headers: r.headers });
      }
      return new Response(r.body, {
        status: 200,
        headers: { ...r.headers, 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch (error) {
      console.error('Error building PLPCG manifest:', error);
      return c.json({ error: 'Failed to build manifest' }, 500);
    }
  });

  // GET /api/plpcg/manifest/checksum — o hex do ETag em texto; 204 se o cliente já o tem.
  // É o contrato do /api/catalog/checksum do Worker plpcg-catalog: o coldigui troca de fonte mudando só a URL base.
  app.get('/api/plpcg/manifest/checksum', async (c) => {
    try {
      const r = await buildPlpcgManifest(
        c.env.DB,
        { origin: new URL(c.req.url).origin },
        c.req.header('If-None-Match'),
      );
      if (r.status === 304) {
        return new Response(null, { status: 204, headers: r.headers });
      }
      return new Response(r.checksum, {
        status: 200,
        headers: { ...r.headers, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (error) {
      console.error('Error building PLPCG manifest checksum:', error);
      return c.json({ error: 'Failed to build manifest' }, 500);
    }
  });
}
```

- [ ] **Step 5: Registrar em `api/src/index.ts`**

Acrescentar o import, em ordem alfabética entre `registerMaterialsRoutes` e `registerPraisesRoutes`:

```ts
import { registerPlpcgRoutes } from './routes/plpcg';
```

E a chamada, logo depois de `registerPraisesRoutes(app);`:

```ts
registerPraisesRoutes(app);
registerPlpcgRoutes(app);
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd api && npx vitest run src/__tests__/plpcgRoutes.test.ts src/__tests__/routes.inventory.test.ts && npm run lint`
Expected: PASS; inventário igual; lint limpo.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/plpcg.ts api/src/index.ts api/src/__tests__/routes.inventory.test.ts api/src/__tests__/plpcgRoutes.test.ts
git commit -m "feat(api): GET /api/plpcg/manifest e /manifest/checksum — o louvores-manifest.json servido do coldigom

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `GET /api/plpcg/resolve/:shortId` — o `?s=` dos links antigos

**Files:**
- Create: `api/src/plpcgResolve.ts`
- Modify: `api/src/routes/plpcg.ts` (terceira rota, no fim de `registerPlpcgRoutes`)
- Modify: `api/src/__tests__/routes.inventory.test.ts` (terceira linha)
- Test: `api/src/__tests__/plpcgRoutes.test.ts` (novo `describe`)

**Interfaces:**
- Consumes: `pdfUrl` de `api/src/plpcgManifest.ts` (Task 2); `registerPlpcgRoutes` (Task 3); `fakeDb` do teste da Task 3 (`resolve` e `binds`).
- Produces:
  - `normalizarShortId(bruto: string): string | null` — trim + minúsculas; `null` se não for `^[0-9a-f]{1,16}$`.
  - `RESOLVE_SQL` (string exportada).
  - `type PlpcgResolved = { pdf_id: string; praise_id: string; material_id: string; url: string }`.
  - `resolvePlpcgShortId(db: D1Database, shortId: string, origin: string): Promise<PlpcgResolved | null>`.

Contrato da rota (vai para o spec na Task 6):

| caso | resposta |
|---|---|
| `short_id` conhecido | `200 {pdf_id, praise_id, material_id, url}`, `Cache-Control: public, max-age=300` |
| idem com `?redirect=1` | `302`, `Location: <url>` (é o que o plpcg.com pode fazer com `/?s=XXXX` quando desligar) |
| `short_id` fora de `^[0-9a-f]{1,16}$` (depois de trim/minúsculas) | `400 {"error": "short_id inválido: hex minúsculo, ex. 0453"}` sem consultar o D1 |
| sem linha no crosswalk, ou material apagado | `404 {"error": "short_id sem material no coldigom"}` |
| D1 fora do ar | `500 {"error": "Failed to resolve"}` |

- [ ] **Step 1: Inventário — a terceira linha**

Em `api/src/__tests__/routes.inventory.test.ts`, logo depois de `'GET /api/plpcg/manifest/checksum',`:

```ts
  'GET /api/plpcg/resolve/:shortId',
```

- [ ] **Step 2: Escrever os testes que falham**

No topo de `api/src/__tests__/plpcgRoutes.test.ts`, junto dos outros imports:

```ts
import { RESOLVE_SQL, normalizarShortId } from '../plpcgResolve';
```

E ao fim do arquivo:

```ts
describe('GET /api/plpcg/resolve/:shortId', () => {
  const RESOLVIDO = { pdf_id: LINHA.pdf_id, praise_id: 'p1', material_id: 'm1', r2_key: 'assets/praises/p1/m1.pdf' };

  it('200 com praise, material e a URL absoluta do PDF; consulta em minúsculas', async () => {
    const { db, binds } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/04A3', {}, { DB: db });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await res.json()).toEqual({
      pdf_id: LINHA.pdf_id,
      praise_id: 'p1',
      material_id: 'm1',
      url: 'http://localhost/assets/praises/p1/m1.pdf',
    });
    expect(binds).toEqual([['04a3']]);
  });

  it('?redirect=1 → 302 para o PDF', async () => {
    const { db } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/0453?redirect=1', {}, { DB: db });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('http://localhost/assets/praises/p1/m1.pdf');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('short_id que não é hex → 400 sem tocar no D1', async () => {
    const { db, binds } = fakeDb({ resolve: RESOLVIDO });
    for (const ruim of ['zz', '04-53', '0123456789abcdef0', '%20']) {
      const res = await app.request(`/api/plpcg/resolve/${ruim}`, {}, { DB: db });
      expect(res.status, ruim).toBe(400);
      expect(await res.json()).toEqual({ error: 'short_id inválido: hex minúsculo, ex. 0453' });
    }
    expect(binds).toEqual([]);
  });

  it('sem linha no crosswalk → 404', async () => {
    const { db } = fakeDb({ resolve: null });
    const res = await app.request('/api/plpcg/resolve/ffff', {}, { DB: db });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'short_id sem material no coldigom' });
    expect(res.headers.get('cache-control')).toBeNull();
  });

  it('CORS para o plpcg.com', async () => {
    const { db } = fakeDb({ resolve: RESOLVIDO });
    const res = await app.request('/api/plpcg/resolve/0453', { headers: { origin: 'https://plpcg.com' } }, { DB: db, WEB_ORIGIN });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://plpcg.com');
  });

  it('D1 fora do ar → 500', async () => {
    const { db } = fakeDb({ falha: new Error('boom') });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await app.request('/api/plpcg/resolve/0453', {}, { DB: db });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to resolve' });
    spy.mockRestore();
  });
});

describe('plpcgResolve — unidades', () => {
  it('normalizarShortId: trim, minúsculas, só hex até 16', () => {
    expect(normalizarShortId(' 04A3 ')).toBe('04a3');
    expect(normalizarShortId('0000')).toBe('0000');
    expect(normalizarShortId('10000')).toBe('10000');
    expect(normalizarShortId('')).toBeNull();
    expect(normalizarShortId('g1')).toBeNull();
    expect(normalizarShortId('0123456789abcdef0')).toBeNull();
    // JOIN interno: material apagado no app = 404, não uma URL para um 404.
    expect(RESOLVE_SQL).toMatch(/JOIN praise_materials pm ON pm\.id = cw\.praise_material_id/);
    expect(RESOLVE_SQL).toMatch(/WHERE cw\.short_id = \?/);
    expect(RESOLVE_SQL).toMatch(/LIMIT 1/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd api && npx vitest run src/__tests__/plpcgRoutes.test.ts src/__tests__/routes.inventory.test.ts`
Expected: FAIL — 404 em todas as chamadas de resolve; `Cannot find module '../plpcgResolve'`; inventário não bate.

- [ ] **Step 4: Criar `api/src/plpcgResolve.ts`**

```ts
import { pdfUrl } from './plpcgManifest';

/**
 * GET /api/plpcg/resolve/:shortId — o `?s=<short_id>` do plpcg.com e das
 * listas salvas do coldigui apontando para o material do coldigom (spec §8.2).
 */
export const RESOLVE_SQL = `
  SELECT cw.pdf_id, cw.praise_id, cw.praise_material_id AS material_id, pm.r2_key
  FROM plpcg_crosswalk cw
  JOIN praise_materials pm ON pm.id = cw.praise_material_id
  WHERE cw.short_id = ?
  ORDER BY cw.pdf_id
  LIMIT 1`;

type ResolveRow = { pdf_id: string; praise_id: string; material_id: string; r2_key: string | null };

export type PlpcgResolved = {
  pdf_id: string;
  praise_id: string;
  material_id: string;
  url: string;
};

/**
 * `short_id` do PLPCG é hex minúsculo ("0000" é válido; o contador
 * `short_id_next` pode passar de quatro dígitos). Fora disso, nem consulta.
 */
export function normalizarShortId(bruto: string): string | null {
  const s = bruto.trim().toLowerCase();
  return /^[0-9a-f]{1,16}$/.test(s) ? s : null;
}

export async function resolvePlpcgShortId(
  db: D1Database,
  shortId: string,
  origin: string,
): Promise<PlpcgResolved | null> {
  const row = await db.prepare(RESOLVE_SQL).bind(shortId).first<ResolveRow>();
  if (!row) return null;
  return {
    pdf_id: row.pdf_id,
    praise_id: row.praise_id,
    material_id: row.material_id,
    url: pdfUrl(origin, row.praise_id, row.material_id, row.r2_key),
  };
}
```

- [ ] **Step 5: A rota, no fim de `registerPlpcgRoutes` em `api/src/routes/plpcg.ts`**

Import no topo do arquivo:

```ts
import { normalizarShortId, resolvePlpcgShortId } from '../plpcgResolve';
```

E, depois da rota do checksum, ainda dentro da função:

```ts
  // GET /api/plpcg/resolve/:shortId — o ?s= dos links antigos; ?redirect=1 manda direto para o PDF
  app.get('/api/plpcg/resolve/:shortId', async (c) => {
    const shortId = normalizarShortId(c.req.param('shortId'));
    if (!shortId) {
      return c.json({ error: 'short_id inválido: hex minúsculo, ex. 0453' }, 400);
    }
    try {
      const r = await resolvePlpcgShortId(c.env.DB, shortId, new URL(c.req.url).origin);
      if (!r) {
        return c.json({ error: 'short_id sem material no coldigom' }, 404);
      }
      c.header('Cache-Control', 'public, max-age=300');
      if (c.req.query('redirect') === '1') {
        return c.redirect(r.url, 302);
      }
      return c.json(r);
    } catch (error) {
      console.error('Error resolving PLPCG short_id:', error);
      return c.json({ error: 'Failed to resolve' }, 500);
    }
  });
```

- [ ] **Step 6: Rodar tudo e ver passar**

Run: `cd api && npx vitest run --coverage && npm run lint`
Expected: suíte inteira verde; catraca (78 / 73 / 80 / 81) mantida ou acima; lint limpo. Se a catraca subiu, **não** mexer nos thresholds neste plano (o dono é quem fecha setor).

- [ ] **Step 7: Commit**

```bash
git add api/src/plpcgResolve.ts api/src/routes/plpcg.ts api/src/__tests__/routes.inventory.test.ts api/src/__tests__/plpcgRoutes.test.ts
git commit -m "feat(api): GET /api/plpcg/resolve/:shortId — o ?s= do PLPCG aponta o material do coldigom

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `core.plpcg --guardar-final` — a exportação final do catálogo do PLPCG em `gabaritos/`

**Files:**
- Modify: `scripts/validate-acervo/core/plpcg.py` (nova função depois de `montar_db`; flag em `main`)
- Test: `scripts/validate-acervo/tests/test_plpcg.py`

**Interfaces:**
- Consumes: `TABELAS = ("louvores", "catalog_meta")`, `meta(conn)`, `exportar_d1`, `montar_db`, `PLPCG_OUT` — já existem no módulo.
- Produces: `guardar_exportacao_final(dumps_dir: str, destino: str, quando: str | None = None) -> dict[str, str]` — escreve um `.sql` único (cabeçalho + `louvores.sql` + `catalog_meta.sql`) e devolve `{"louvores": "<n>", **catalog_meta}`. Flag `--guardar-final [DESTINO]` (padrão `gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql`), que exporta (a menos de `--pular-download`), grava e **para** — não hasheia nem baixa PDF.

Por quê: spec §8.3 — quando o plpcg-admin parar de publicar, a última exportação do D1 `plpcg-catalog` fica no git, ao lado das decisões e das `execucao/`; é a prova de contra qual catálogo o crosswalk é completo (§12).

- [ ] **Step 1: Escrever o teste que falha**

No fim de `scripts/validate-acervo/tests/test_plpcg.py`:

```python
def test_guardar_exportacao_final_junta_os_dumps_com_cabecalho(tmp_path):
    from core.plpcg import guardar_exportacao_final
    import sqlite3

    dumps = tmp_path / "dumps"
    dumps.mkdir()
    (dumps / "louvores.sql").write_text(
        "PRAGMA defer_foreign_keys=TRUE;\n"
        "CREATE TABLE louvores (pdf_id TEXT PRIMARY KEY, nome TEXT);\n"
        "INSERT INTO louvores VALUES ('a','x');\n"
        "INSERT INTO louvores VALUES ('b','y');\n",
        encoding="utf-8",
    )
    (dumps / "catalog_meta.sql").write_text(
        "CREATE TABLE catalog_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);\n"
        "INSERT INTO catalog_meta VALUES ('checksum','abc'),('short_id_next','0100'),('row_count','2');\n",
        encoding="utf-8",
    )
    destino = tmp_path / "gabaritos" / "plpcg_catalog_final.sql"

    info = guardar_exportacao_final(str(dumps), str(destino), quando="2026-09-17T00:00:00Z")

    texto = destino.read_text(encoding="utf-8")
    assert texto.startswith(
        "-- exportação final do D1 plpcg-catalog em 2026-09-17T00:00:00Z: "
        "2 louvores, checksum abc, short_id_next 0100\n"
    )
    assert "-- louvores.sql\n" in texto and "-- catalog_meta.sql\n" in texto
    assert "INSERT INTO louvores VALUES ('b','y');" in texto
    assert info == {"louvores": "2", "checksum": "abc", "short_id_next": "0100", "row_count": "2"}
    # o arquivo se basta: executá-lo reconstrói o catálogo
    conn = sqlite3.connect(":memory:")
    conn.executescript(texto)
    assert conn.execute("SELECT COUNT(*) FROM louvores").fetchone()[0] == 2
    assert conn.execute("SELECT value FROM catalog_meta WHERE key='checksum'").fetchone()[0] == "abc"


def test_guardar_exportacao_final_data_de_hoje_quando_nao_informada(tmp_path):
    from core.plpcg import guardar_exportacao_final

    dumps = tmp_path / "dumps"
    dumps.mkdir()
    (dumps / "louvores.sql").write_text("CREATE TABLE louvores (pdf_id TEXT PRIMARY KEY);\n", encoding="utf-8")
    (dumps / "catalog_meta.sql").write_text("CREATE TABLE catalog_meta (key TEXT, value TEXT);\n", encoding="utf-8")
    destino = tmp_path / "final.sql"

    info = guardar_exportacao_final(str(dumps), str(destino))

    primeira = destino.read_text(encoding="utf-8").splitlines()[0]
    assert primeira.startswith("-- exportação final do D1 plpcg-catalog em 20")
    assert primeira.endswith("Z: 0 louvores, checksum ?, short_id_next ?")
    assert info == {"louvores": "0"}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/test_plpcg.py -q -k guardar`
Expected: FAIL — `ImportError: cannot import name 'guardar_exportacao_final'`.

- [ ] **Step 3: Implementar em `core/plpcg.py`**

Acrescentar `from datetime import datetime, timezone` aos imports. Depois de `montar_db`:

```python
def guardar_exportacao_final(dumps_dir: str, destino: str, quando: str | None = None) -> dict[str, str]:
    """Junta os dumps (louvores + catalog_meta) num único .sql — a exportação
    final do D1 plpcg-catalog que o spec §8.3 manda guardar em gabaritos/
    quando o catálogo congela. O cabeçalho diz de quando é e contra qual
    checksum. Devolve o catalog_meta lido do dump, mais 'louvores' = contagem."""
    conn = sqlite3.connect(":memory:")
    partes_sql: list[str] = []
    for t in TABELAS:
        with open(os.path.join(dumps_dir, f"{t}.sql"), encoding="utf-8") as f:
            sql = f.read()
        conn.executescript(sql)
        partes_sql.append(f"-- {t}.sql\n{sql.rstrip()}\n")
    m = meta(conn)
    n = conn.execute("SELECT COUNT(*) FROM louvores").fetchone()[0]
    conn.close()

    quando = quando or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cabecalho = (
        f"-- exportação final do D1 plpcg-catalog em {quando}: {n} louvores, "
        f"checksum {m.get('checksum', '?')}, short_id_next {m.get('short_id_next', '?')}\n"
    )
    os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        f.write(cabecalho + "\n" + "\n".join(partes_sql))
    return {"louvores": str(n), **m}
```

Em `main`, o flag (depois de `--sem-rede`):

```python
    ap.add_argument("--guardar-final", nargs="?", const=EXPORTACAO_FINAL, metavar="DESTINO",
                    help="grava a exportação final do catálogo (louvores + catalog_meta) num .sql "
                         f"único e para; padrão {EXPORTACAO_FINAL}")
```

com a constante, junto de `DB_NAME`/`TABELAS` no topo do módulo (acrescente `PKG` à lista importada de `core.paths` — é `<repo>/scripts/validate-acervo`, o mesmo que `core/plpcg_apply.py` usa para `gabaritos/`):

```python
EXPORTACAO_FINAL = os.path.join(PKG, "gabaritos", "plpcg_crosswalk", "plpcg_catalog_final.sql")
```

E em `main`, logo depois do bloco `if not args.pular_download: … exportar_d1(...)` e **antes** de `print("montando plpcg.sqlite...")`:

```python
    if args.guardar_final:
        info = guardar_exportacao_final(dumps, args.guardar_final)
        print(f"exportação final: {args.guardar_final}\n  {info['louvores']} louvores, "
              f"checksum {info.get('checksum', '?')}, short_id_next {info.get('short_id_next', '?')}")
        return 0
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd scripts/validate-acervo && python3 -m pytest tests/ -q`
Expected: suíte inteira verde (226 + 2).

- [ ] **Step 5: Gerar o arquivo com os dumps já baixados e conferir**

Run (sem rede; `out/plpcg/dumps` existe no checkout principal — use o caminho absoluto se o worktree não tiver `out/`):

```bash
cd scripts/validate-acervo
python3 -m core.plpcg --pular-download --guardar-final
grep -c "INSERT INTO louvores" gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql
head -1 gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql
```

Expected: `4633 louvores` no cabeçalho (a exportação de 15–17/09 que alimentou a rodada 1). O arquivo (~1,4 MB) **entra no git** — é a regra desde a Fase 1: nada fica só em `out/`. Se `out/plpcg/dumps` não existir no worktree, copie de `/Volumes/SSD 2TB SD/dev/coldigom/scripts/validate-acervo/out/plpcg/dumps` (sem tocar no checkout principal).

- [ ] **Step 6: Commit**

```bash
git add scripts/validate-acervo/core/plpcg.py scripts/validate-acervo/tests/test_plpcg.py scripts/validate-acervo/gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql
git commit -m "feat(validate-acervo): core.plpcg --guardar-final — exportação final do catálogo do PLPCG em gabaritos/

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Spec §8 com o contrato concreto e README da Fase D

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md` (§8.2, §8.3, §9 linha D, §12)
- Modify: `scripts/validate-acervo/README.md` (nova subseção depois do bloco "Fase C")

**Interfaces:**
- Consumes: os contratos das Tasks 3, 4 e 5 — copiados, não parafraseados.

- [ ] **Step 1: Substituir o §8.2 do spec**

Trocar o bloco inteiro `### 8.2 Endpoints` (as duas bullets) por:

```markdown
### 8.2 Endpoints *(Fase D, 17/09)*

Três rotas públicas em `api/src/routes/plpcg.ts` (sem sessão, como
`/api/plpcg/praises`; o CORS já cobre `*plpcg.com` e `plpcjf.org`):

- `GET /api/plpcg/manifest` → **array JSON no formato do
  `louvores-manifest.json`**, uma entrada por linha de `plpcg_crosswalk`
  (JOIN interno com `praise_materials` e `praises`: material apagado no app
  some do manifest em vez de apontar 404):

  | chave | de onde vem |
  |---|---|
  | `pdfId`, `groupId`, `shortId` | os do PLPCG (`plpcg_crosswalk`) — chaves de cache e `?s=` sobrevivem |
  | `nome`, `numero` | `praises.name`, `praises.number` (`''` sem número) |
  | `classificacao` | rótulos das tags do praise (`pai · filha`, como no catálogo), separados por `, ` |
  | `categoria` | as cinco do PLPCG a partir do kind (D10 ao contrário): `Chord Chart` → `Cifra`, `Chord Chart I/II` → `Cifra nível I/II`, `CIAs Gestures` → `Gestos em Gravura`, **qualquer outro** → `Partitura` |
  | `pdf` | URL absoluta na origem da API: `<origem>/<r2_key>` (`assets/praises/<praise_id>/<material_id>.pdf`) |
  | `praiseId`, `materialId` | extras, para o cliente casar com `/api/plpcg/catalog` sem decodificar nada |

  `ETag: "<sha256 do corpo>"`, `Cache-Control: public, max-age=300`;
  `If-None-Match` igual → `304`. Ordem: `praises.number, praises.name, pdf_id`.
- `GET /api/plpcg/manifest/checksum` → o mesmo hex em `text/plain`
  (`204` com `If-None-Match` igual) — o contrato do `/api/catalog/checksum`
  do Worker `plpcg-catalog`, para o coldigui trocar de fonte mudando só a
  URL base.
- `GET /api/plpcg/resolve/:shortId` → `200 {pdf_id, praise_id, material_id,
  url}`; `?redirect=1` → `302 Location: <url>`; `400` se não for hex
  minúsculo (`^[0-9a-f]{1,16}$`); `404` sem linha no crosswalk ou material
  apagado. É o que faz `plpcg.com/?s=…` continuar vivo.

O que **não** está no manifest: as `pdf_id` decididas como `nao_levar`/
`descartar` (198) e as pendentes de Revisão 2 — por decisão do dono não
existem no coldigom. Os materiais do coldigom sem crosswalk continuam vindo
só por `/api/plpcg/catalog`.
```

- [ ] **Step 2: Ajustar §8.3, §9 e §12**

§8.3, item 3, trocar `(última exportação guardada em gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql)` por:

```markdown
(última exportação guardada por `python3 -m core.plpcg --guardar-final` em
   `gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql`, com data e checksum
   no cabeçalho — rodar de novo no dia do congelamento)
```

§9, linha **D**, trocar por:

```markdown
| **D — destino** *(API feita 17/09)* | `GET /api/plpcg/manifest`, `/manifest/checksum`, `/resolve/:shortId` (§8.2); `schema.sql` com a 019; exportação final via `--guardar-final` | coldigui apontado e em modo único por uma semana sem "não encontrado" (fora deste repo, §8.3) |
```

§12, terceira bullet, trocar por:

```markdown
- `GET /api/plpcg/manifest` devolve uma entrada por linha de `plpcg_crosswalk`
  (= `louvores` do PLPCG menos as `pdf_id` decididas como não levar) e o
  coldigui roda em modo único.
```

- [ ] **Step 3: README — subseção Fase D**

Em `scripts/validate-acervo/README.md`, logo depois do parágrafo que termina em `wrangler r2 object delete coldigom-assets/<chave> --remote`. O wrangler executa cada arquivo .sql como um batch atômico do D1 — é o que a retomada assume (chunk que falhou não escreveu nada).` e antes de "`core.plpcg` precisa do `wrangler` logado…", inserir:

```markdown
**Fase D — destino** (spec §8.2; código em `api/src/routes/plpcg.ts`, fora
deste arnês): o coldigom serve o que o plpcg.com servia.

```bash
API=https://coldigom-api.jairofilho79.workers.dev
curl -s $API/api/plpcg/manifest | python3 -c 'import json,sys; m=json.load(sys.stdin); print(len(m), m[0])'
curl -s $API/api/plpcg/manifest/checksum            # o mesmo hex do ETag do manifest
curl -s $API/api/plpcg/resolve/0453                  # {pdf_id, praise_id, material_id, url}
curl -sI "$API/api/plpcg/resolve/0453?redirect=1"    # 302 para o PDF
python3 -m core.plpcg --guardar-final                # exportação final do PLPCG → gabaritos/plpcg_crosswalk/plpcg_catalog_final.sql
```

O manifest tem uma entrada por linha de `plpcg_crosswalk` com `pdfId`,
`groupId` e `shortId` do PLPCG e `pdf` apontando para o coldigom; conferir
`len(m)` contra `SELECT COUNT(*) FROM plpcg_crosswalk` (4429 em 17/09) é o
teste de fumaça depois do deploy. `--guardar-final` junta os dumps de
`out/plpcg/dumps` (baixa antes, salvo `--pular-download`) num `.sql` único
com data e checksum no cabeçalho — rodar de novo no dia em que o
plpcg-admin parar de publicar (§8.3).
```

- [ ] **Step 4: Conferir que o markdown não quebrou**

Run: `grep -n "^### 8.2\|^### 8.3\|^## 9\|^## 12" docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md && grep -n "Fase D" scripts/validate-acervo/README.md`
Expected: as quatro âncoras do spec presentes uma vez cada; "Fase D" no README.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-migracao-plpcg-design.md scripts/validate-acervo/README.md
git commit -m "docs(plpcg): spec §8.2 com o contrato do manifest/checksum/resolve; README da Fase D

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Depois do plano (fora das tasks — decisões do dono)

- **Deploy**: `deploy-api.yml` só roda em push de `main`. Levar a Fase D a produção = PR `develop` → `main`, que hoje carrega também o trabalho de contribuições da outra sessão e o `/api/plpcg/catalog`. Alternativa: branch da Fase D a partir de `main` com cherry-pick de `894db5d` (019) — só se o dono não quiser levar o `develop` inteiro.
- **Teste de fumaça em produção** (leituras): `curl $API/api/plpcg/manifest | jq length` = `SELECT COUNT(*) FROM plpcg_crosswalk` (4429 + o que fechar da Revisão 2); `curl $API/api/plpcg/resolve/0453` = o louvor "Meu Deus, meu pai" 001.
- **§8.3 (repos irmãos)**: coldigui `PLPCG_API_BASE_URL`/`ApiEndpoints.louvoresManifest` → `<coldigom>/api/plpcg/manifest` e `…/checksum`; o `pdf` do manifest já é absoluto, então o cliente usa `pdf` em vez de montar `/assets/<rel>` do `pdfId`; plpcg.com `/?s=` → `resolve?redirect=1`. Cada um é uma tarefa no repo dele.
