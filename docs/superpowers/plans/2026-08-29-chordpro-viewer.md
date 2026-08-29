# Viewer de ChordPro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página dedicada `/praise/:praiseId/cifra/:materialId` que renderiza cifras ChordPro do acervo, com parser puro, modelo de células e as duas paletas — base para a edição e a criação que vêm depois.

**Architecture:** Três camadas isoladas. `lib/chordpro/` é puro (string → `Song` → string), sem React e sem rede. `components/chordpro/ChordProView` é puro (`Song` → DOM), sem fetch e sem rota. `hooks/useMaterialContent` é o único que sabe de rede, e distingue 404 (`absent`) de falha (`error`). `pages/ChordProPage` costura os três e é a única peça que conhece navegação.

**Tech Stack:** React 19, TypeScript, react-router-dom 7, Vite 8, Vitest 4 + Testing Library (jsdom). API em Hono sobre Cloudflare Workers (D1 + R2). **Zero dependências de runtime — não adicionar nenhuma.**

**Spec:** `docs/superpowers/specs/2026-08-29-chordpro-viewer-design.md`

## Global Constraints

- **Nenhuma dependência nova**, de runtime ou de dev. O projeto tem zero deps de runtime; manter.
- **Nunca `trim()`** em nada no caminho até o texto renderizado da cifra. Espaços são dados.
- Adjacência de acorde é lida **da linha original**, nunca de um buffer já processado.
- O viewer **não** normaliza acorde, não transpõe, não conserta OCR, não reconcilia arquivo com banco.
- Acorde e barra usam a **mesma tinta**: `#ff6b5e` (escuro) / `#d81f11` (claro).
- Textos de UI em **português**, no tom do resto do app.
- Testes rodam com `cd web && npx vitest run <caminho>`. API: `cd api && npx vitest run`.
- Commits em português, prefixo convencional (`feat:`, `test:`, `refactor:`, `chore:`).

---

### Task 1: Remover o RawChordPro

Experimento antigo de edição, 4.548 registros e zero validados. Sai a UI e os endpoints; a tabela D1 e `upload_raw.py` ficam.

**Files:**
- Delete: `web/src/pages/RawChordProListPage.tsx`, `web/src/pages/RawChordProDetailPage.tsx`, `web/src/components/ChordProPreview.tsx`, `web/src/types/rawChordpro.ts`
- Modify: `web/src/App.tsx` (2 imports + 2 rotas), `web/src/pages/HomePage.tsx:80,87` (2 links), `web/src/services/api.ts` (import da linha 2; bloco 490–540), `web/src/styles/global.css` (linhas 2817–2856), `api/src/index.ts` (bloco 1076–1240: `RawChordproRow`, `mapRawChordpro`, 3 rotas), `api/src/__tests__/index.test.ts` (blocos 1157–1194)

**Interfaces:**
- Consumes: nada
- Produces: nada. Libera o nome `ChordProPreview` e deixa `web/src/components/` sem viewer, que a Task 6 preenche.

- [ ] **Step 1: Rodar a suíte inteira antes de mexer, para ter a linha de base**

```bash
cd web && npx vitest run 2>&1 | tail -20
cd ../api && npx vitest run 2>&1 | tail -20
```

Anotar quantos testes passam. Qualquer teste que já falhe antes desta task não é regressão desta task.

- [ ] **Step 2: Apagar os arquivos do frontend**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
rm web/src/pages/RawChordProListPage.tsx \
   web/src/pages/RawChordProDetailPage.tsx \
   web/src/components/ChordProPreview.tsx \
   web/src/types/rawChordpro.ts
```

- [ ] **Step 3: Remover as referências restantes no frontend**

Em `web/src/App.tsx`, apagar os dois imports (`RawChordProListPage`, `RawChordProDetailPage`) e as duas rotas `/raw-chordPro` e `/raw-chordPro/:id`.

Em `web/src/pages/HomePage.tsx`, apagar as duas linhas `<Link to="/raw-chordPro" className="auth-btn">Raw ChordPro</Link>` (uma no ramo autenticado, outra no anônimo).

Em `web/src/services/api.ts`, apagar o import de `../types/rawChordpro` na linha 2 e o bloco `ListRawChordprosParams` / `listRawChordpros` / `getRawChordpro` / `patchRawChordpro`.

Em `web/src/styles/global.css`, apagar o bloco `.raw-chordpro-*` (linhas 2817–2856).

- [ ] **Step 4: Remover os endpoints da API e seus testes**

Em `api/src/index.ts`, apagar `type RawChordproRow`, `function mapRawChordpro` e as três rotas (`GET /api/raw-chordpros`, `GET /api/raw-chordpros/:id`, `PATCH /api/raw-chordpros/:id`) — o bloco entre o fim de `GET /api/materials/kinds` e o começo de `GET /api/tags`.

Em `api/src/__tests__/index.test.ts`, apagar os `describe('GET /api/raw-chordpros')` e `describe('PATCH /api/raw-chordpros/:id')`, incluindo o helper `createRawMockD1` se ficar sem uso.

- [ ] **Step 5: Verificar que não sobrou referência e que tudo compila**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
grep -rniI "raw.chordpro\|rawchordpro" web/src api/src ; echo "--- esperado: nenhuma linha acima ---"
cd web && npx tsc -b --noEmit && npx vitest run 2>&1 | tail -8
cd ../api && npx vitest run 2>&1 | tail -8
```

Esperado: grep sem resultados; tsc limpo; as duas suítes passando com a mesma contagem do Step 1 menos os testes de raw-chordpro removidos.

- [ ] **Step 6: Commit**

```bash
git add -A web/src api/src
git commit -m "refactor: remove o RawChordPro (UI e endpoints)"
```

---

### Task 2: Fixtures reais e o parser de diretivas

**Files:**
- Create: `web/src/__tests__/fixtures/chordpro/denso.chord`, `solto.chord`, `lapide.chord`
- Create: `web/src/lib/chordpro/types.ts`, `web/src/lib/chordpro/parse.ts`
- Test: `web/src/lib/chordpro/__tests__/parse.header.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `Cell`, `Line`, `Stanza`, `SongHeader`, `Song` de `types.ts`; `parse(source: string): Song` de `parse.ts`. Tasks 3, 4, 5, 6 e 9 dependem desses nomes exatos.

- [ ] **Step 1: Copiar os três fixtures já baixados do R2**

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
mkdir -p web/src/__tests__/fixtures/chordpro
cp /private/tmp/claude-501/-Volumes-SSD-2TB-SD-dev-coldigom/a9598c90-6694-4f80-9b29-ba50cc35f8b8/scratchpad/fx/*.chord \
   web/src/__tests__/fixtures/chordpro/
wc -c web/src/__tests__/fixtures/chordpro/*.chord
```

Esperado: `denso.chord` 1169, `solto.chord` 645, `lapide.chord` 239 bytes. Se os arquivos não estiverem mais no scratchpad, rebaixar:

```bash
npx wrangler r2 object get "coldigom-assets/storage/assets/praises/9a5d4232-00ba-4294-b204-8d1701a24894/c9e5f567-865c-425f-b454-069973dbcbee.chord" --remote --file web/src/__tests__/fixtures/chordpro/denso.chord
npx wrangler r2 object get "coldigom-assets/storage/assets/praises/002bbc89-cf6c-4002-b64c-c538bdbf47e2/e11034e9-b577-4122-880b-b000b2b21023.chord" --remote --file web/src/__tests__/fixtures/chordpro/solto.chord
npx wrangler r2 object get "coldigom-assets/storage/assets/praises/bb38bd5c-8f92-4557-8f08-8a5b3b097be5/a3b45c8d-c61e-45a5-9cb3-5935e0f17704.chord" --remote --file web/src/__tests__/fixtures/chordpro/lapide.chord
```

- [ ] **Step 2: Escrever os tipos**

`web/src/lib/chordpro/types.ts`:

```ts
export type Cell = {
  /** Nome do acorde sem colchetes, ou null na célula de texto que precede o primeiro acorde. */
  chord: string | null;
  /** true quando o acorde encosta em texto — é o que desenha a barra vermelha. */
  attached: boolean;
  /** Texto até o próximo acorde. Espaços preservados byte a byte. Nunca sofre trim. */
  text: string;
};

export type Line =
  | { kind: 'cells'; cells: Cell[] }
  | { kind: 'comment'; text: string };

export type Stanza = { lines: Line[] };

export type SongHeader = {
  title?: string;
  subtitle?: string;
  key?: string;
  rhythm?: string;
  artist?: string;
};

export type Song = {
  header: SongHeader;
  stanzas: Stanza[];
  /** Linhas ";" — recado de pipeline. Fora do corpo da cifra, exibidas no painel do material. */
  notes: string[];
  /** false quando o parse não produziu nenhuma linha de letra (regra 8). */
  hasLyrics: boolean;
};
```

- [ ] **Step 3: Escrever o teste de cabeçalho que falha**

`web/src/lib/chordpro/__tests__/parse.header.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('parse — cabeçalho', () => {
  it('lê as cinco diretivas de cabeçalho', () => {
    const song = parse('{title: Confio Em Deus}\n{subtitle: 344}\n{key: A}\n{rhythm: Básico}\n{artist: Let. W.C.M.}\n');
    expect(song.header).toEqual({
      title: 'Confio Em Deus',
      subtitle: '344',
      key: 'A',
      rhythm: 'Básico',
      artist: 'Let. W.C.M.',
    });
  });

  it('trata valor vazio como ausente', () => {
    expect(parse('{key: }\n').header.key).toBeUndefined();
    expect(parse('{key:}\n').header.key).toBeUndefined();
  });

  it('trata "?" como ausente', () => {
    expect(parse('{subtitle: ?}\n').header.subtitle).toBeUndefined();
  });

  it('ignora em silêncio diretiva desconhecida, inclusive meta', () => {
    const song = parse('{meta: column full}\n{qualquer: coisa}\n{title: X}\n');
    expect(song.header).toEqual({ title: 'X' });
    expect(song.stanzas).toEqual([]);
  });

  it('a lápide real tem os dois formatos de ausente e nenhum campo de cabeçalho', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.header.title).toBe('Clama, ó igreja');
    expect(song.header.subtitle).toBeUndefined();
    expect(song.header.key).toBeUndefined();
    expect(song.header.rhythm).toBeUndefined();
    expect(song.header.artist).toBeUndefined();
  });

  it('lê o cabeçalho do arquivo denso real, sem subtitle', () => {
    const song = parse(fixture('denso.chord'));
    expect(song.header.title).toBe('Comigo Habita, Ó Deus');
    expect(song.header.key).toBe('Eb');
    expect(song.header.rhythm).toBe('Canção');
    expect(song.header.subtitle).toBeUndefined();
    expect(song.header.artist).toContain('Let. H/F.L');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/parse.header.test.ts
```

Esperado: FAIL — `Failed to resolve import "../parse"`.

- [ ] **Step 5: Implementar o parser de diretivas**

`web/src/lib/chordpro/parse.ts`:

```ts
import type { Line, Song, SongHeader, Stanza } from './types';

const DIRECTIVE_RE = /^\{([^:}]+):\s*(.*)\}$/;
const NOTE_RE = /^\s*;(.*)$/;

const HEADER_KEYS = ['title', 'subtitle', 'key', 'rhythm', 'artist'] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

function isHeaderKey(key: string): key is HeaderKey {
  return (HEADER_KEYS as readonly string[]).includes(key);
}

/** Valor vazio ou "?" conta como ausente — os dois formatos ocorrem no corpus. */
function directiveValue(raw: string): string | undefined {
  const value = raw.trim();
  return value === '' || value === '?' ? undefined : value;
}

export function parse(source: string): Song {
  const header: SongHeader = {};
  const notes: string[] = [];
  const stanzas: Stanza[] = [];
  let current: Line[] = [];

  const flush = () => {
    if (current.length > 0) {
      stanzas.push({ lines: current });
      current = [];
    }
  };

  for (const raw of source.split(/\r?\n/)) {
    const directive = DIRECTIVE_RE.exec(raw.trim());
    if (directive) {
      const key = directive[1].trim().toLowerCase();
      const value = directiveValue(directive[2]);
      if (isHeaderKey(key)) {
        if (value !== undefined) header[key] = value;
      } else if (key === 'comment' && value !== undefined) {
        current.push({ kind: 'comment', text: value });
      }
      continue;
    }

    const note = NOTE_RE.exec(raw);
    if (note) {
      notes.push(note[1].trim());
      continue;
    }

    if (raw.trim() === '') {
      flush();
      continue;
    }

    current.push({ kind: 'cells', cells: [] }); // preenchido na Task 3
  }

  flush();

  const hasLyrics = stanzas.some((s) => s.lines.some((l) => l.kind === 'cells'));
  return { header, stanzas, notes, hasLyrics };
}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/parse.header.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 7: Commit**

```bash
git add web/src/__tests__/fixtures web/src/lib/chordpro
git commit -m "feat: parser de ChordPro — diretivas de cabeçalho e fixtures reais"
```

---

### Task 3: Células e adjacência

O núcleo. A tabela de adjacência da spec vira sete testes, um por combinação.

**Files:**
- Modify: `web/src/lib/chordpro/parse.ts`
- Test: `web/src/lib/chordpro/__tests__/parse.cells.test.ts`

**Interfaces:**
- Consumes: `Cell`, `Line` de `types.ts`; `parse` da Task 2
- Produces: `parse` passa a preencher `cells` nas linhas `kind: 'cells'`. A Task 4 e a Task 6 consomem `Cell` já preenchida.

- [ ] **Step 1: Escrever os testes que falham**

`web/src/lib/chordpro/__tests__/parse.cells.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import type { Cell } from '../types';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

/** Extrai as células da n-ésima linha de letra do documento inteiro. */
function cellsOf(source: string, index = 0): Cell[] {
  const lines = parse(source).stanzas.flatMap((s) => s.lines);
  const line = lines.filter((l) => l.kind === 'cells')[index];
  if (!line || line.kind !== 'cells') throw new Error('sem linha de letra');
  return line.cells;
}

describe('tabela de adjacência — as 7 combinações', () => {
  it('espaço → texto: tem barra', () => {
    const cells = cellsOf('é [Ab]Deus');
    expect(cells).toEqual([
      { chord: null, attached: false, text: 'é ' },
      { chord: 'Ab', attached: true, text: 'Deus' },
    ]);
  });

  it('texto → texto: tem barra', () => {
    expect(cellsOf('ha[Cm]bi')[1]).toEqual({ chord: 'Cm', attached: true, text: 'bi' });
  });

  it('início de linha → texto: tem barra', () => {
    expect(cellsOf('[Eb]Co - ')[0]).toEqual({ chord: 'Eb', attached: true, text: 'Co - ' });
  });

  it('texto → fim de linha: tem barra, com texto vazio', () => {
    expect(cellsOf('Sinai[C#m7]')[1]).toEqual({ chord: 'C#m7', attached: true, text: '' });
  });

  it('espaço → fim de linha: sem barra', () => {
    expect(cellsOf('Deus é Amor [C]')[1]).toEqual({ chord: 'C', attached: false, text: '' });
  });

  it('espaço → espaço: sem barra', () => {
    expect(cellsOf('Amor [C] eterno')[1]).toEqual({ chord: 'C', attached: false, text: ' eterno' });
  });

  it('início → espaço: sem barra', () => {
    expect(cellsOf('[E]   A linda ')[0]).toEqual({ chord: 'E', attached: false, text: '   A linda ' });
  });
});

describe('espaçamento é dado, não estilo', () => {
  it('preserva corrida de espaços dentro do texto', () => {
    expect(cellsOf('[Eb]A  [Fm]grande')[0].text).toBe('A  ');
  });

  it('preserva espaço em fim de linha', () => {
    const cells = cellsOf('[Ab]terna [C]reden[Fm]ção, ');
    expect(cells[cells.length - 1].text).toBe('ção, ');
  });

  it('distingue um espaço de três antes do acorde solto', () => {
    expect(cellsOf('Deus é Amor [C]')[0].text).toBe('Deus é Amor ');
    expect(cellsOf('Deus é Amor   [C]')[0].text).toBe('Deus é Amor   ');
  });
});

describe('colchetes literais', () => {
  it('trata \\[ e \\] escapados como texto', () => {
    expect(cellsOf('um \\[dois\\] tres')).toEqual([
      { chord: null, attached: false, text: 'um [dois] tres' },
    ]);
  });

  it('trata [] vazio como texto literal, não acorde sem nome', () => {
    expect(cellsOf('vazio [] aqui')).toEqual([
      { chord: null, attached: false, text: 'vazio [] aqui' },
    ]);
  });

  it('trata colchete sem fechamento como texto', () => {
    expect(cellsOf('aberto [ sem fim')).toEqual([
      { chord: null, attached: false, text: 'aberto [ sem fim' },
    ]);
  });
});

describe('arquivos reais', () => {
  it('a primeira linha do denso tem 5 acordes, todos encostados', () => {
    const cells = cellsOf(fixture('denso.chord'));
    expect(cells.map((c) => c.chord)).toEqual(['Eb', 'Bb', 'Cm', 'Gm', 'Ab']);
    expect(cells.every((c) => c.attached)).toBe(true);
    expect(cells[0].text).toBe('Co - ');
  });

  it('o solto tem a linha com [E] seguido de 3 espaços, sem barra', () => {
    const source = fixture('solto.chord');
    const linhas = parse(source).stanzas.flatMap((s) => s.lines);
    const alvo = linhas
      .filter((l): l is { kind: 'cells'; cells: Cell[] } => l.kind === 'cells')
      .find((l) => l.cells[0]?.chord === 'E');
    expect(alvo).toBeDefined();
    expect(alvo!.cells[0]).toEqual({ chord: 'E', attached: false, text: '   A linda ' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/parse.cells.test.ts
```

Esperado: FAIL — as células vêm vazias (`[]`) porque a Task 2 deixou o placeholder.

- [ ] **Step 3: Implementar `parseCells` e ligá-la ao parser**

Em `web/src/lib/chordpro/parse.ts`, adicionar antes de `parse` e trocar a linha placeholder:

```ts
import type { Cell, Line, Song, SongHeader, Stanza } from './types';

/**
 * Quebra a linha em células, lendo a adjacência de cada acorde na linha ORIGINAL.
 * attachLeft  = existe caractere anterior e não é espaço
 * attachRight = existe caractere seguinte e não é espaço
 * attached    = attachLeft || attachRight   → é isso que desenha a barra
 */
function parseCells(line: string): Cell[] {
  const cells: Cell[] = [];
  let chord: string | null = null;
  let attached = false;
  let text = '';
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    // regra 6 — \[ e \] são texto literal
    if (ch === '\\' && (line[i + 1] === '[' || line[i + 1] === ']')) {
      text += line[i + 1];
      i += 2;
      continue;
    }

    if (ch === '[') {
      const close = line.indexOf(']', i + 1);
      const name = close === -1 ? '' : line.slice(i + 1, close);
      // regra 7 — [] vazio, e colchete sem fechamento, são texto literal
      if (close === -1 || name === '') {
        text += ch;
        i += 1;
        continue;
      }
      cells.push({ chord, attached, text });
      const prev = i > 0 ? line[i - 1] : undefined;
      const next = close + 1 < line.length ? line[close + 1] : undefined;
      chord = name;
      attached =
        (prev !== undefined && !/\s/.test(prev)) || (next !== undefined && !/\s/.test(next));
      text = '';
      i = close + 1;
      continue;
    }

    text += ch;
    i += 1;
  }

  cells.push({ chord, attached, text });

  // A célula inicial só existe quando há texto antes do primeiro acorde.
  if (cells.length > 1 && cells[0].chord === null && cells[0].text === '') cells.shift();
  return cells;
}
```

E trocar, dentro do laço de `parse`:

```ts
    current.push({ kind: 'cells', cells: [] }); // preenchido na Task 3
```

por:

```ts
    current.push({ kind: 'cells', cells: parseCells(raw) });
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/
```

Esperado: PASS nos dois arquivos, 21 testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/chordpro
git commit -m "feat: células e tabela de adjacência do parser de ChordPro"
```

---

### Task 4: Estrofes, notas de pipeline e a lápide

**Files:**
- Test: `web/src/lib/chordpro/__tests__/parse.structure.test.ts`
- Modify: `web/src/lib/chordpro/parse.ts` apenas se algum teste falhar

**Interfaces:**
- Consumes: `parse` das Tasks 2 e 3
- Produces: garantias sobre `stanzas`, `notes` e `hasLyrics` que a Task 9 usa para escolher o estado da página.

- [ ] **Step 1: Escrever os testes que falham**

`web/src/lib/chordpro/__tests__/parse.structure.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('estrofes', () => {
  it('linha em branco separa estrofes', () => {
    const song = parse('linha um\n\nlinha dois\n');
    expect(song.stanzas).toHaveLength(2);
  });

  it('brancos consecutivos colapsam em um separador', () => {
    const song = parse('linha um\n\n\n\nlinha dois\n');
    expect(song.stanzas).toHaveLength(2);
  });

  it('separador no fim é descartado', () => {
    const song = parse('linha um\n\n\n');
    expect(song.stanzas).toHaveLength(1);
  });

  it('o denso real tem 4 estrofes', () => {
    expect(parse(fixture('denso.chord')).stanzas).toHaveLength(4);
  });
});

describe('notas de pipeline', () => {
  it('linha ";" sai do corpo e entra em notes', () => {
    const song = parse('; recado\nletra [C]aqui\n');
    expect(song.notes).toEqual(['recado']);
    expect(song.stanzas.flatMap((s) => s.lines)).toHaveLength(1);
  });

  it('a lápide real carrega as duas notas', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.notes).toHaveLength(2);
    expect(song.notes[0]).toContain('Dobro os meus joelhos');
    expect(song.notes[1]).toContain('Reanexe o PDF correto');
  });
});

describe('comentários', () => {
  it('{comment} vira linha renderizável dentro da estrofe', () => {
    const song = parse('{comment: Refrão}\nletra [C]aqui\n');
    expect(song.stanzas[0].lines[0]).toEqual({ kind: 'comment', text: 'Refrão' });
  });
});

describe('regra 8 — indisponível com HTTP 200', () => {
  it('a lápide real não tem linha de letra', () => {
    const song = parse(fixture('lapide.chord'));
    expect(song.hasLyrics).toBe(false);
    expect(song.stanzas.flatMap((s) => s.lines).filter((l) => l.kind === 'cells')).toHaveLength(0);
  });

  it('só comentário não conta como letra', () => {
    expect(parse('{comment: nada aqui}\n').hasLyrics).toBe(false);
  });

  it('os arquivos reais com letra têm hasLyrics', () => {
    expect(parse(fixture('denso.chord')).hasLyrics).toBe(true);
    expect(parse(fixture('solto.chord')).hasLyrics).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/parse.structure.test.ts
```

A implementação das Tasks 2 e 3 já deve satisfazer quase tudo. Para cada teste que falhar, corrigir `parse.ts` — não o teste. Suspeitos prováveis: a contagem de estrofes do denso (o arquivo tem brancos duplos entre estrofes, que devem colapsar) e o `NOTE_RE` capturando errado.

- [ ] **Step 3: Rodar a pasta inteira e ver tudo verde**

```bash
cd web && npx vitest run src/lib/chordpro/
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/chordpro
git commit -m "test: estrofes, notas de pipeline e o caso da lápide"
```

---

### Task 5: Serializer e round-trip

Existe agora para travar o modelo antes de a edição depender dele.

**Files:**
- Create: `web/src/lib/chordpro/serialize.ts`
- Test: `web/src/lib/chordpro/__tests__/roundtrip.test.ts`

**Interfaces:**
- Consumes: `Song` de `types.ts`, `parse` de `parse.ts`
- Produces: `serialize(song: Song): string`. A edição futura consome; nenhuma task deste plano consome.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/lib/chordpro/__tests__/roundtrip.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { serialize } from '../serialize';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('round-trip parse → serialize → parse', () => {
  it.each(['denso.chord', 'solto.chord', 'lapide.chord'])('é idempotente para %s', (name) => {
    const once = parse(fixture(name));
    const twice = parse(serialize(once));
    expect(twice).toEqual(once);
  });

  it('preserva espaçamento significativo na ida e volta', () => {
    const source = 'Deus é Amor   [C]\n[E]   A linda [A]flor\n';
    const once = parse(source);
    expect(parse(serialize(once))).toEqual(once);
    expect(serialize(once)).toContain('Deus é Amor   [C]');
    expect(serialize(once)).toContain('[E]   A linda [A]flor');
  });

  it('preserva colado e solto', () => {
    const song = parse('ha[Cm]bi\nDeus é Amor [C]\n');
    const cells = parse(serialize(song)).stanzas[0].lines;
    expect(cells).toEqual(song.stanzas[0].lines);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/roundtrip.test.ts
```

Esperado: FAIL — `Failed to resolve import "../serialize"`.

- [ ] **Step 3: Implementar o serializer**

`web/src/lib/chordpro/serialize.ts`:

```ts
import type { Cell, Song } from './types';

const HEADER_ORDER = ['title', 'subtitle', 'key', 'rhythm', 'artist'] as const;

function serializeCells(cells: Cell[]): string {
  return cells.map((c) => (c.chord === null ? '' : `[${c.chord}]`) + c.text).join('');
}

/**
 * Song → ChordPro. O par com parse é idempotente: parse(serialize(parse(x))) === parse(x),
 * espaçamento incluído. Não reproduz o arquivo byte a byte — diretivas são reordenadas e
 * as notas ";" sobem para o topo — mas nenhuma informação do Song se perde.
 */
export function serialize(song: Song): string {
  const out: string[] = [];

  for (const key of HEADER_ORDER) {
    const value = song.header[key];
    if (value !== undefined) out.push(`{${key}: ${value}}`);
  }

  for (const note of song.notes) out.push(`; ${note}`);

  if (out.length > 0) out.push('');

  song.stanzas.forEach((stanza, i) => {
    if (i > 0) out.push('');
    for (const line of stanza.lines) {
      out.push(line.kind === 'comment' ? `{comment: ${line.text}}` : serializeCells(line.cells));
    }
  });

  return out.join('\n') + '\n';
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd web && npx vitest run src/lib/chordpro/
```

Esperado: PASS, tudo verde.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/chordpro
git commit -m "feat: serializer de ChordPro com round-trip idempotente"
```

---

### Task 6: ChordProView e as duas paletas

**Files:**
- Create: `web/src/components/chordpro/ChordProView.tsx`
- Modify: `web/src/styles/global.css` (bloco novo no fim)
- Test: `web/src/components/chordpro/__tests__/ChordProView.test.tsx`

**Interfaces:**
- Consumes: `Song`, `Cell` de `lib/chordpro/types`; `parse` de `lib/chordpro/parse`
- Produces: `<ChordProView song={song} />`. A Task 9 monta a página em volta dele.

Classes CSS que os testes assertam: `.cp-line`, `.cp-cell`, `.cp-cell--free`, `.cp-cell--bar`, `.cp-chord`, `.cp-text`, `.cp-comment`.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/components/chordpro/__tests__/ChordProView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChordProView } from '../ChordProView';
import { parse } from '../../../lib/chordpro/parse';

const renderSource = (source: string) => render(<ChordProView song={parse(source)} />);

describe('ChordProView', () => {
  it('desenha uma célula por acorde, com rótulo e texto', () => {
    const { container } = renderSource('ha[Cm]bi - [Gm]ta,');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells).toHaveLength(3);
    expect(cells[1].querySelector('.cp-chord')!.textContent).toBe('Cm');
    expect(cells[1].querySelector('.cp-text')!.textContent).toBe('bi - ');
  });

  it('marca com --bar só as células de acorde encostado', () => {
    const { container } = renderSource('[E]   A linda [A]flor');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells[0].className).not.toContain('cp-cell--bar');
    expect(cells[1].className).toContain('cp-cell--bar');
  });

  it('marca com --free a célula sem acorde, que pode quebrar linha', () => {
    const { container } = renderSource('Confio em [A]Deus');
    expect(container.querySelectorAll('.cp-cell')[0].className).toContain('cp-cell--free');
    expect(container.querySelectorAll('.cp-cell')[1].className).not.toContain('cp-cell--free');
  });

  it('renderiza célula com texto vazio e barra sem colapsar', () => {
    const { container } = renderSource('Sinai[C#m7]');
    const ultima = container.querySelectorAll('.cp-cell')[1];
    expect(ultima.className).toContain('cp-cell--bar');
    expect(ultima.querySelector('.cp-text')).not.toBeNull();
  });

  it('renderiza {comment} e nunca as notas ";"', () => {
    const { container } = renderSource('{comment: Refrão}\n; recado de pipeline\nletra [C]aqui');
    expect(screen.getByText('Refrão')).toBeInTheDocument();
    expect(container.textContent).not.toContain('recado de pipeline');
  });
});

describe('espaçamento sobrevive até o DOM', () => {
  it('mantém os espaços literais no nó de texto', () => {
    const { container } = renderSource('[E]   A linda [A]flor');
    expect(container.querySelectorAll('.cp-text')[0].textContent).toBe('   A linda ');
  });

  it('um espaço e três espaços produzem nós de texto diferentes', () => {
    const um = renderSource('Deus é Amor [C]').container.querySelector('.cp-text')!.textContent;
    const tres = renderSource('Deus é Amor   [C]').container.querySelector('.cp-text')!.textContent;
    expect(um).toBe('Deus é Amor ');
    expect(tres).toBe('Deus é Amor   ');
    expect(tres).not.toBe(um);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/components/chordpro/
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar o componente**

`web/src/components/chordpro/ChordProView.tsx`:

```tsx
import type { Cell, Song } from '../../lib/chordpro/types';

function cellClassName(cell: Cell): string {
  const classes = ['cp-cell'];
  // Célula sem acorde não tem rótulo para alinhar, então pode quebrar linha.
  if (cell.chord === null) classes.push('cp-cell--free');
  if (cell.attached) classes.push('cp-cell--bar');
  return classes.join(' ');
}

export function ChordProView({ song }: { song: Song }) {
  return (
    <div className="cp-body">
      {song.stanzas.map((stanza, si) => (
        <div className="cp-stanza" key={si}>
          {stanza.lines.map((line, li) =>
            line.kind === 'comment' ? (
              <p className="cp-comment" key={li}>{line.text}</p>
            ) : (
              <div className="cp-line" key={li}>
                {line.cells.map((cell, ci) => (
                  <span className={cellClassName(cell)} key={ci}>
                    <span className="cp-chord">{cell.chord ?? ''}</span>
                    <span className="cp-text">{cell.text}</span>
                  </span>
                ))}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Escrever o CSS**

No fim de `web/src/styles/global.css`:

```css
/* ── Viewer de ChordPro ─────────────────────────────────────────────── */
/* Acorde e barra usam a mesma tinta, como no hinário impresso: distinguem-se
   por posição, não por cor. O vermelho difere entre as paletas porque o mesmo
   tom não tem o mesmo contraste sobre os dois fundos. */
.cp-scope[data-cp-theme='dark'] {
  --cp-bg: #0f0e13; --cp-text: #e7e5e4; --cp-dim: #a8a29e;
  --cp-ink: #ff6b5e; --cp-rule: #2b2a33;
}
.cp-scope[data-cp-theme='light'] {
  --cp-bg: #faf6ee; --cp-text: #2b2622; --cp-dim: #7a726a;
  --cp-ink: #d81f11; --cp-rule: #e3dbcd;
}

.cp-scope { background: var(--cp-bg); color: var(--cp-text); border-radius: var(--radius-lg); }
.cp-body { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 15px; line-height: 1.35; }
.cp-stanza { margin-bottom: var(--space-4); }
.cp-line { display: flex; flex-wrap: wrap; align-items: flex-end; }

/* Célula com acorde nunca quebra por dentro: é isso que mantém o alinhamento
   acorde↔sílaba em tela estreita. */
.cp-cell { display: flex; flex-direction: column; white-space: pre; }
/* Célula sem acorde não tem rótulo para alinhar, então pode quebrar. */
.cp-cell--free { white-space: pre-wrap; }

.cp-chord { font-size: 12px; font-weight: 700; line-height: 1.4; min-height: 1.4em; color: var(--cp-ink); }
/* min-height evita que a célula do caso "Sinai[C#m7]" (texto vazio) colapse e
   engula a barra. */
.cp-text { min-height: 1.45em; border-left: 2px solid transparent; }
.cp-cell--bar > .cp-text { border-left-color: var(--cp-ink); }

.cp-comment { color: var(--cp-dim); font-style: italic; margin: var(--space-2) 0; }
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd web && npx vitest run src/components/chordpro/
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/chordpro web/src/styles/global.css
git commit -m "feat: ChordProView com modelo de células e as duas paletas"
```

---

### Task 7: useViewerTheme

**Files:**
- Create: `web/src/hooks/useViewerTheme.ts`
- Test: `web/src/hooks/__tests__/useViewerTheme.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `useViewerTheme(): { theme: 'dark' | 'light'; toggle: () => void }`. A Task 9 usa.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/hooks/__tests__/useViewerTheme.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useViewerTheme, VIEWER_THEME_KEY } from '../useViewerTheme';

describe('useViewerTheme', () => {
  beforeEach(() => localStorage.clear());

  it('começa no escuro', () => {
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('dark');
  });

  it('alterna e persiste', () => {
    const { result } = renderHook(() => useViewerTheme());
    act(() => result.current.toggle());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem(VIEWER_THEME_KEY)).toBe('light');
  });

  it('lê a preferência salva na montagem', () => {
    localStorage.setItem(VIEWER_THEME_KEY, 'light');
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('light');
  });

  it('ignora valor inválido no storage', () => {
    localStorage.setItem(VIEWER_THEME_KEY, 'roxo');
    expect(renderHook(() => useViewerTheme()).result.current.theme).toBe('dark');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/hooks/__tests__/useViewerTheme.test.ts
```

- [ ] **Step 3: Implementar**

`web/src/hooks/useViewerTheme.ts`:

```ts
import { useCallback, useState } from 'react';

export const VIEWER_THEME_KEY = 'coldigom_chordpro_theme';
export type ViewerTheme = 'dark' | 'light';

function readStored(): ViewerTheme {
  try {
    const stored = localStorage.getItem(VIEWER_THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

/** Tema local ao viewer. Não toca no tema global da aplicação. */
export function useViewerTheme() {
  const [theme, setTheme] = useState<ViewerTheme>(readStored);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: ViewerTheme = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(VIEWER_THEME_KEY, next);
      } catch {
        // storage indisponível — o tema vale só para esta sessão
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
```

- [ ] **Step 4: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/hooks/__tests__/useViewerTheme.test.ts
git add web/src/hooks && git commit -m "feat: tema local do viewer, persistido"
```

---

### Task 8: useMaterialContent

O único módulo que sabe de rede. `absent` e `error` são estados distintos porque levam a telas e ações distintas.

**Files:**
- Create: `web/src/hooks/useMaterialContent.ts`
- Test: `web/src/hooks/__tests__/useMaterialContent.test.ts`

**Interfaces:**
- Consumes: `getAssetUrl` de `services/api`
- Produces: `ContentState` e `useMaterialContent(r2Key: string | null): { content: ContentState; retry: () => void }`. A Task 9 usa os dois — `retry` é o botão "tentar de novo" do estado `error`.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/hooks/__tests__/useMaterialContent.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMaterialContent } from '../useMaterialContent';

const mockFetch = (impl: () => Promise<Response> | Response) =>
  vi.stubGlobal('fetch', vi.fn(impl));

afterEach(() => vi.unstubAllGlobals());

describe('useMaterialContent', () => {
  it('200 vira ready com o conteúdo', async () => {
    mockFetch(() => new Response('{title: X}\n[C]letra', { status: 200 }));
    const { result } = renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(result.current.content.status).toBe('ready'));
    expect(result.current.content).toEqual({ status: 'ready', source: '{title: X}\n[C]letra' });
  });

  it('404 vira absent, não erro — é o caminho normal de 97,5% dos registros', async () => {
    mockFetch(() => new Response('{"error":"File not found"}', { status: 404 }));
    const { result } = renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(result.current.content.status).toBe('absent'));
  });

  it('falha de rede vira error, distinto de absent', async () => {
    mockFetch(() => Promise.reject(new Error('Failed to fetch')));
    const { result } = renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
    expect(result.current.content).toEqual({ status: 'error', message: 'Failed to fetch' });
  });

  it('5xx vira error, não absent', async () => {
    mockFetch(() => new Response('boom', { status: 500 }));
    const { result } = renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
  });

  it('r2_key nulo vira absent sem tocar na rede', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const { result } = renderHook(() => useMaterialContent(null));
    await waitFor(() => expect(result.current.content.status).toBe('absent'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('retry refaz o GET depois de uma falha', async () => {
    let chamadas = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      chamadas += 1;
      return chamadas === 1
        ? Promise.reject(new Error('Failed to fetch'))
        : Promise.resolve(new Response('[C]ok', { status: 200 }));
    }));
    const { result } = renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(result.current.content.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.content.status).toBe('ready'));
  });

  it('faz um único GET — nunca HEAD', async () => {
    const spy = vi.fn(() => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    renderHook(() => useMaterialContent('assets/praises/p/m.chord'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const init = spy.mock.calls[0][1] as RequestInit | undefined;
    expect(init?.method ?? 'GET').toBe('GET');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/hooks/__tests__/useMaterialContent.test.ts
```

- [ ] **Step 3: Implementar**

`web/src/hooks/useMaterialContent.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { getAssetUrl } from '../services/api';

export type ContentState =
  | { status: 'loading' }
  | { status: 'ready'; source: string }
  | { status: 'absent' }
  | { status: 'error'; message: string };

/**
 * Carrega o .chord de um material. Um GET responde "existe?" e "qual é o conteúdo?"
 * de uma vez — os arquivos têm 611 bytes em média, então HEAD não economiza nada.
 *
 * absent (404) e error são separados de propósito: "ainda não existe, crie" não é
 * "existe e a rede falhou".
 */
export function useMaterialContent(r2Key: string | null): {
  content: ContentState;
  retry: () => void;
} {
  const [state, setState] = useState<ContentState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!r2Key) {
      setState({ status: 'absent' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const response = await fetch(getAssetUrl(r2Key));
        if (cancelled) return;
        if (response.status === 404) {
          setState({ status: 'absent' });
          return;
        }
        if (!response.ok) {
          setState({ status: 'error', message: `HTTP ${response.status}` });
          return;
        }
        const source = await response.text();
        if (!cancelled) setState({ status: 'ready', source });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Falha de rede' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [r2Key, attempt]);

  return { content: state, retry };
}
```

- [ ] **Step 4: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/hooks/
git add web/src/hooks && git commit -m "feat: carga do .chord distinguindo 404 de falha de rede"
```

---

### Task 9: ChordProPage e a rota

**Files:**
- Create: `web/src/pages/ChordProPage.tsx`
- Modify: `web/src/App.tsx` (import + rota), `web/src/styles/global.css` (bloco da página)
- Test: `web/src/pages/__tests__/ChordProPage.test.tsx`

**Interfaces:**
- Consumes: `parse`, `ChordProView`, `useViewerTheme`, `useMaterialContent`, `getPraise` e `getAssetUrl` de `services/api`, `Material` e `PraiseDetail` de `types`
- Produces: rota `/praise/:praiseId/cifra/:materialId`. A Task 11 linka para ela.

A rota fica **antes** de `/praise/:id` em `App.tsx`, senão o router casa a genérica primeiro.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/pages/__tests__/ChordProPage.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordProPage } from '../ChordProPage';
import * as api from '../../services/api';

const praise = {
  id: 'p1',
  name: 'Confio em Deus',
  number: '344',
  tonality: 'G',
  rhythm: 'Básico',
  author: 'Let.: W. C. Martin',
  materials: [
    { id: 'm1', praise_id: 'p1', type: 'chord', material_kind: 'k1', material_kind_name: 'Cifra I',
      r2_key: 'assets/praises/p1/m1.chord', file_path_legacy: '', source_material_id: 'pdf1' },
    { id: 'pdf1', praise_id: 'p1', type: 'pdf', material_kind: 'k2', material_kind_name: 'Partitura',
      r2_key: 'assets/praises/p1/pdf1.pdf', file_path_legacy: '', source_material_id: null },
  ],
} as unknown as Awaited<ReturnType<typeof api.getPraise>>;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/praise/p1/cifra/m1']}>
      <Routes>
        <Route path="/praise/:praiseId/cifra/:materialId" element={<ChordProPage />} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('ChordProPage', () => {
  it('renderiza a cifra quando o arquivo existe', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() =>
      new Response('{title: Confio Em Deus}\n{key: A}\n\nConfio em [A]Deus', { status: 200 })
    ));
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cp-line')).not.toBeNull());
    expect(screen.getByText('Confio Em Deus')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('mostra o cabeçalho com os dados do arquivo, não os do banco', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 })));
    renderPage();
    // o arquivo diz A, o banco diz G — o cabeçalho mostra o do arquivo
    await waitFor(() => expect(screen.getByText(/Tom A/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it('404 vira "ainda não foi publicada", com link para o PDF de origem', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() => new Response('', { status: 404 })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/ainda não foi publicada/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /PDF de origem/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('falha de rede vira erro com botão de tentar de novo, distinto do 404', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Failed to fetch'))));
    renderPage();
    await waitFor(() => expect(screen.getByText(/falha ao carregar/i)).toBeInTheDocument());
    expect(screen.queryByText(/ainda não foi publicada/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('arquivo sem letra não vira tela em branco — mostra as notas do pipeline', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() =>
      new Response('{title: Clama}\n\n; Reanexe o PDF correto e processe de novo.', { status: 200 })
    ));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Reanexe o PDF correto/)).toBeInTheDocument());
    vi.unstubAllGlobals();
  });

  it('o painel mostra os dados do banco identificados como tal', async () => {
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/no banco/i)).toBeInTheDocument());
    expect(screen.getByText('Cifra I')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/pages/__tests__/ChordProPage.test.tsx
```

- [ ] **Step 3: Implementar a página**

`web/src/pages/ChordProPage.tsx`. Estrutura obrigatória:

- `useParams` para `praiseId` e `materialId`; `getPraise(praiseId)` num `useEffect` com flag `cancelled`, no mesmo padrão de `RawChordProDetailPage` (que a Task 1 apagou — usar `PraiseDetailPage` como referência de estilo).
- `material = praise?.materials.find(m => m.id === materialId)`; `sourcePdf = praise?.materials.find(m => m.id === material?.source_material_id)`.
- `const { content, retry } = useMaterialContent(material?.r2_key ?? null)`.
- `const song = useMemo(() => content.status === 'ready' ? parse(content.source) : null, [content])`.
- `const { theme, toggle } = useViewerTheme()`.
- Envelope: `<div className="cp-scope" data-cp-theme={theme}>` em volta do corpo da cifra.
- Cabeçalho editorial: `<Link to={'/praise/' + praiseId}>← {praise.name}</Link>`, `<h1>` com `song.header.title ?? praise.name`, número `song.header.subtitle`, chips `Tom {song.header.key}`, `{song.header.rhythm}`, `{material.material_kind_name}`. **Campo ausente no arquivo some do cabeçalho** — não cai para o banco. Botão de tema com rótulo `☀ claro` / `☾ escuro`.
- Corpo por estado: `loading` → `.loading-spinner`; `ready` com `song.hasLyrics` → `<ChordProView song={song} />`; `ready` sem `hasLyrics` ou `absent` → aviso; `error` → aviso com `<button>Tentar de novo</button>`.
- Textos exatos, que os testes casam: `"Esta cifra ainda não foi publicada."` / `"Falha ao carregar a cifra."` / `"Tentar de novo"` / link `"PDF de origem"`.
- Painel do material, sempre visível quando há material: `material_kind_name`, `r2_key`, `source_material_id` como link `PDF de origem` (`getAssetUrl(sourcePdf.r2_key)`), `merged_from_praise_name` quando houver, notas do pipeline (`song.notes`) e a coluna **"no banco"** com `praise.number`, `praise.tonality`, `praise.rhythm`, `praise.author`. Sem comparação, sem alerta.
- Estado do `getPraise`: erro → `.error-state` com a mensagem; louvor ou material não encontrado → `.no-results`.
- O botão "Tentar de novo" chama o `retry` que a Task 8 já expõe.

- [ ] **Step 4: Registrar a rota**

Em `web/src/App.tsx`, importar `ChordProPage` e adicionar **antes** da rota `/praise/:id`:

```tsx
<Route path="/praise/:praiseId/cifra/:materialId" element={<ChordProPage />} />
```

- [ ] **Step 5: Estilos da página**

Em `web/src/styles/global.css`, junto ao bloco do viewer: `.cp-page` (max-width 860px), `.cp-header`, `.cp-title` (serifa, no padrão do `.detail-*`), `.cp-chips` / `.cp-chip`, `.cp-panel` em grade de duas colunas que colapsa em uma abaixo de 640px, `.cp-notes`. Reusar tokens (`--space-*`, `--radius-*`, `--border-subtle`) — não inventar valores.

- [ ] **Step 6: Rodar e ver passar**

```bash
cd web && npx vitest run src/pages/__tests__/ChordProPage.test.tsx && npx tsc -b --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add web/src/pages web/src/App.tsx web/src/styles/global.css web/src/hooks
git commit -m "feat: página dedicada de cifra com os quatro estados"
```

---

### Task 10: `has_content` na API

**Files:**
- Modify: `api/src/index.ts` (mapeamento de materiais no `GET /api/praises/:id`, ~linha 1045)
- Modify: `web/src/types/index.ts` (`Material`)
- Test: `api/src/__tests__/index.test.ts`

**Interfaces:**
- Consumes: binding `c.env.ASSETS` (R2)
- Produces: `Material.has_content?: boolean`. A Task 11 usa.

- [ ] **Step 1: Escrever o teste que falha**

Em `api/src/__tests__/index.test.ts`, dentro do `describe('GET /api/praises/:id')` existente:

```ts
it('marca has_content nos materiais de cifra conforme o R2', async () => {
  const assets = createMockR2();
  // o mock deve responder head() com objeto para m-chord-1 e null para m-chord-2
  const res = await app.request('/api/praises/p1', {}, { DB: createMockD1(), ASSETS: assets });
  const body = await res.json() as { data: { materials: Array<{ id: string; type: string; has_content?: boolean }> } };
  const cifras = body.data.materials.filter((m) => m.type === 'chord');
  expect(cifras.find((m) => m.id === 'm-chord-1')!.has_content).toBe(true);
  expect(cifras.find((m) => m.id === 'm-chord-2')!.has_content).toBe(false);
});

it('não consulta o R2 para material que não é cifra', async () => {
  const head = vi.fn().mockResolvedValue(null);
  const res = await app.request('/api/praises/p1', {}, { DB: createMockD1(), ASSETS: { ...createMockR2(), head } });
  expect(res.status).toBe(200);
  for (const call of head.mock.calls) expect(String(call[0])).toMatch(/\.chord$/);
});
```

Ajustar `createMockD1` e `createMockR2` do arquivo para incluir os dois materiais de cifra e um `head` que responde conforme a chave. Ler os helpers existentes antes de escrever.

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd api && npx vitest run
```

- [ ] **Step 3: Implementar**

Em `api/src/index.ts`, o mapeamento de materiais é síncrono hoje. Trocar por assíncrono:

```ts
const materials = await Promise.all(
  (materialsResult.results as any[]).map(async (m) => {
    const base = {
      ...m,
      material_kind_name: labelFor(materialKindLabels, m.material_kind),
    };
    if (m.type !== 'chord') return base;
    // O r2_key está preenchido em 100% dos registros de cifra, inclusive nos
    // 2.214 sem arquivo — só o R2 sabe quais existem de verdade.
    const key = m.r2_key ? `storage/${String(m.r2_key).replace(/^\//, '')}` : null;
    const object = key ? await c.env.ASSETS.head(key) : null;
    return { ...base, has_content: object !== null };
  })
);
```

Manter as demais propriedades do objeto original — conferir o `.map` atual antes de substituir.

Em `web/src/types/index.ts`, na interface `Material`:

```ts
  /** Só em materiais type:'chord' — se o .chord existe de verdade no R2. */
  has_content?: boolean;
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd api && npx vitest run && npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add api/src web/src/types
git commit -m "feat(api): has_content nos materiais de cifra"
```

---

### Task 11: Card de cifra abre a página

**Files:**
- Modify: `web/src/pages/PraiseDetailPage.tsx:1904-1932`, `web/src/styles/global.css`
- Test: `web/src/__tests__/PraiseDetailPage.test.tsx`

**Interfaces:**
- Consumes: `Material.has_content` da Task 10; rota da Task 9
- Produces: nada

- [ ] **Step 1: Escrever o teste que falha**

Em `web/src/__tests__/PraiseDetailPage.test.tsx`, seguindo o padrão de mock já usado no arquivo:

```tsx
it('o card de cifra linka para a página dedicada, não para o arquivo cru', async () => {
  // praise com um material chord id 'm1', has_content: true
  const link = await screen.findByRole('link', { name: /Cifra I/ });
  expect(link).toHaveAttribute('href', '/praise/p1/cifra/m1');
});

it('cifra sem conteúdo aparece marcada, e continua clicável', async () => {
  // praise com material chord 'm2', has_content: false
  const link = await screen.findByRole('link', { name: /Cifra II/ });
  expect(link).toHaveAttribute('href', '/praise/p1/cifra/m2');
  expect(screen.getByText(/sem conteúdo/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/__tests__/PraiseDetailPage.test.tsx
```

- [ ] **Step 3: Implementar**

Em `PraiseDetailPage.tsx`, o bloco `{chordMaterials.length > 0 && (...)}`: trocar o `<a href={getAssetUrl(...)} target="_blank">` por `<Link to={'/praise/' + praise.id + '/cifra/' + m.id}>`, e trocar a legenda fixa `"Arquivo de acordes"` por `m.has_content === false ? 'Sem conteúdo' : 'Cifra'`. Adicionar a classe `material-link--empty` quando `has_content === false`, e uma regra discreta em `global.css` (opacidade reduzida na legenda, sem esconder o card).

`Link` já está importado no arquivo.

- [ ] **Step 4: Rodar tudo e ver passar**

```bash
cd web && npx vitest run && npx tsc -b --noEmit
cd ../api && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat: card de cifra abre o viewer e mostra se tem conteúdo"
```

---

## Verificação final

- [ ] `cd web && npx vitest run` — tudo verde
- [ ] `cd web && npx tsc -b --noEmit` — sem erro
- [ ] `cd web && npx eslint .` — sem erro novo
- [ ] `cd api && npx vitest run` — tudo verde
- [ ] `grep -rniI "raw.chordpro" web/src api/src` — nenhuma linha
- [ ] `cd web && npm run dev`, abrir `/praise/002bbc89-cf6c-4002-b64c-c538bdbf47e2` e clicar na cifra: `Confio em Deus` renderiza com `[E]   A linda` mostrando os 3 espaços e sem barra no `E`
- [ ] Estreitar a janela até ~330px: a letra quebra entre células e nada é truncado
- [ ] Alternar o tema e recarregar: a escolha persiste
