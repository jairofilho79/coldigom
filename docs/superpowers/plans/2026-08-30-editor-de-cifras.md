# Editor de cifras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a página de cifra editável — sessão visível, edição na própria linha, manual de acordes e um validador que impede acorde sem sentido de entrar no acervo.

**Architecture:** Quatro módulos puros novos em `lib/chordpro/` (`chord`, `validate`, `edit`) que não sabem o que é React nem rede, e três componentes que os consomem. O editor opera sobre o `Song` — nunca sobre texto cru — então validação, preview e gravação leem a mesma estrutura. Gravar é `serialize(song)` no endpoint que já existe.

**Tech Stack:** React 19, TypeScript, react-router-dom 7, Vite 8, Vitest 4 + Testing Library (jsdom). **Zero dependências novas.**

**Spec:** `docs/superpowers/specs/2026-08-30-editor-de-cifras-design.md`

## Global Constraints

- **Nenhuma dependência nova**, de runtime ou de dev.
- **Nunca `trim()`** em nada no caminho até o texto renderizado. Espaços são dados.
- O único módulo que sabe o que é um acorde é `lib/chordpro/chord.ts`.
- Normalização acontece **só na entrada do editor**, e só nas formas declaradas: `ø`, `°`, `7M`. Espaçamento, letra e ordem nunca são normalizados.
- Anotação (`[*2x]`, `[*Coro]`) **nunca** é erro e **nunca** é acorde.
- `{key: ...}` do cabeçalho não é validado como acorde.
- Textos de UI em português. O botão de login diz exatamente **"Entrar com o Google"**.
- Testes: `cd web && npx vitest run <caminho>`. Lint: `npx eslint <caminho>`.
- Commits em português, prefixo convencional.
- **Baseline conhecido:** 9 testes já falham em `web/src/__tests__/api.test.ts` (expectativa desatualizada sobre `headers: {}`) e 1 na api (header CORP em mp3). Não são regressão; não consertar aqui.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/chordpro/chord.ts` | **novo** — o que é um acorde. `parseChordToken`, `normalizeChord` |
| `lib/chordpro/types.ts` | modificar — acrescenta `LineRef`, que validação e edição compartilham |
| `lib/chordpro/validate.ts` | **novo** — `ValidationIssue`, `validateSong` |
| `lib/chordpro/edit.ts` | **novo** — operações puras de estrutura sobre `Song` |
| `lib/chordpro/serialize.ts` | modificar — re-escapar `[` e `]` (defeito em produção) |
| `components/chordpro/ChordProView.tsx` | modificar — anotação deixa de ser desenhada como acorde |
| `components/chordpro/ChordHints.tsx` | **novo** — manual com o vocabulário do acervo |
| `components/chordpro/ChordProEditor.tsx` | **novo** — edição inline, cabeçalho, estrutura |
| `components/AuthControl.tsx` | **novo** — extraído da duplicação em HomePage e PraiseDetailPage |
| `pages/ChordProPage.tsx` | modificar — modo de edição, gravação, concorrência |
| `services/api.ts` | modificar — `putMaterialContent` |

---

### Task 1: Preparar o branch e o fixture de vocabulário

**Files:**
- Create: `web/src/__tests__/fixtures/chordpro/chord-vocabulary.json`

**Interfaces:**
- Consumes: nada
- Produces: o fixture que a Task 2 usa no teste que dá confiança ao validador.

- [ ] **Step 1: Criar o branch**

O merge anterior deixou a sessão em `main`. Não implementar em `main`.

```bash
cd "/Volumes/SSD 2TB SD/dev/coldigom"
git checkout -b feat/editor-de-cifras
git branch --show-current
```

- [ ] **Step 2: Copiar o vocabulário já extraído**

```bash
cp /private/tmp/claude-501/-Volumes-SSD-2TB-SD-dev-coldigom/a9598c90-6694-4f80-9b29-ba50cc35f8b8/scratchpad/chord-vocabulary.json \
   web/src/__tests__/fixtures/chordpro/chord-vocabulary.json
python3 -c "
import json;d=json.load(open('web/src/__tests__/fixtures/chordpro/chord-vocabulary.json'))
print('tokens:',len(d['tokens']),'ocorrencias:',d['ocorrencias'],'arquivos:',d['arquivos'])"
```

Esperado: `tokens: 109 ocorrencias: 2224 arquivos: 56`.

Se o scratchpad não existir mais, reextrair (o gabarito está em `out/`, que é gitignored, então o fixture é a única cópia versionada):

```bash
cd scripts/pdf-to-chordpro && python3 - <<'PY'
import json, re, pathlib, collections
man = json.load(open('out/gold_set/manifest.json'))
c = collections.Counter(); arquivos = 0
for j in man:
    p = pathlib.Path(j['gold_path'])
    if p.exists():
        arquivos += 1
        for m in re.finditer(r'\[([^\]]*)\]', p.read_text(encoding='utf-8', errors='replace')):
            c[m.group(1)] += 1
out = {"_origem": "56 arquivos reviewed.chordpro do gabarito humano (out/gold_set/manifest.json)",
       "_extraido_em": "2026-08-30", "arquivos": arquivos, "ocorrencias": sum(c.values()),
       "tokens": dict(sorted(c.items(), key=lambda kv: (-kv[1], kv[0])))}
pathlib.Path("../../web/src/__tests__/fixtures/chordpro/chord-vocabulary.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(len(c), sum(c.values()), arquivos)
PY
```

- [ ] **Step 3: Commit**

```bash
git add web/src/__tests__/fixtures/chordpro/chord-vocabulary.json
git commit -m "test: vocabulário de acordes extraído do gabarito humano"
```

---

### Task 2: `chord.ts` — o que é um acorde

**Files:**
- Create: `web/src/lib/chordpro/chord.ts`
- Test: `web/src/lib/chordpro/__tests__/chord.test.ts`

**Interfaces:**
- Consumes: `chord-vocabulary.json` da Task 1
- Produces: `ChordToken`, `parseChordToken(raw: string): ChordToken`, `normalizeChord(raw: string): string`. As Tasks 3, 7 e 8 consomem.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/lib/chordpro/__tests__/chord.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeChord, parseChordToken } from '../chord';

const vocab = JSON.parse(
  readFileSync(
    join(__dirname, '../../../__tests__/fixtures/chordpro/chord-vocabulary.json'),
    'utf8'
  )
) as { tokens: Record<string, number>; ocorrencias: number };

describe('o gabarito humano inteiro é reconhecido', () => {
  it('nenhum dos 109 tokens do acervo cai em unknown', () => {
    const recusados = Object.keys(vocab.tokens)
      .map((raw) => ({ raw, tok: parseChordToken(raw) }))
      .filter(({ tok }) => tok.kind === 'unknown')
      .map(({ raw, tok }) => `${raw}: ${(tok as { reason: string }).reason}`);
    expect(recusados).toEqual([]);
  });

  it('o fixture é o que se espera — 109 tokens, 2224 ocorrências', () => {
    expect(Object.keys(vocab.tokens)).toHaveLength(109);
    expect(vocab.ocorrencias).toBe(2224);
  });
});

describe('as 15 qualidades observadas no corpus', () => {
  it.each([
    ['C', '', 'maior'],
    ['Cm', 'm', 'menor'],
    ['C7', '7', 'com sétima'],
    ['Cm7', 'm7', 'menor com sétima'],
    ['C6', '6', 'com sexta'],
    ['C9', '9', 'com nona'],
    ['Cø', 'ø', 'meio-diminuto'],
    ['Cm6', 'm6', 'menor com sexta'],
    ['C7M', '7M', 'com sétima maior'],
    ['Csus4', 'sus4', 'suspenso'],
    ['Cm(b13)', 'm(b13)', 'menor com b13'],
    ['Cm7(9)', 'm7(9)', 'menor com sétima e nona'],
    ['C7(b13)', '7(b13)', 'com sétima e b13'],
    ['C(b13)', '(b13)', 'com b13'],
    ['C(#5)', '(#5)', 'aumentado'],
  ])('%s tem qualidade %s (%s)', (raw, quality) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('chord');
    if (tok.kind !== 'chord') return;
    expect(tok.root).toBe('C');
    expect(tok.quality).toBe(quality);
    expect(tok.bass).toBeNull();
  });
});

describe('raiz e alteração', () => {
  it('lê sustenido e bemol na raiz', () => {
    expect(parseChordToken('F#m')).toMatchObject({ root: 'F#', accidental: '#', quality: 'm' });
    expect(parseChordToken('Bb7')).toMatchObject({ root: 'Bb', accidental: 'b', quality: '7' });
  });

  it('aceita diminuto, que não tem precedente no corpus', () => {
    expect(parseChordToken('C°')).toMatchObject({ kind: 'chord', quality: '°' });
  });
});

describe('baixo invertido', () => {
  it.each(['G/B', 'Am/C', 'B/D#', 'C7/E', 'E7/Ab', 'F#m/E', 'Gm/Bb'])('%s', (raw) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('chord');
    if (tok.kind !== 'chord') return;
    expect(tok.bass).toBe(raw.split('/')[1]);
  });
});

describe('anotação não é acorde nem erro', () => {
  it.each(['*2x', '*Coro', '*3x'])('%s é annotation', (raw) => {
    expect(parseChordToken(raw)).toEqual({ kind: 'annotation', text: raw.slice(1), raw });
  });
});

describe('recusas', () => {
  it.each([
    ['Bmm', /qualidade/i],
    ['H', /raiz/i],
    ['Am7/', /baixo/i],
    ['C#m7(', /qualidade/i],
    ['', /vazio/i],
    ['xyz', /raiz/i],
  ])('%s é unknown com motivo legível', (raw, motivo) => {
    const tok = parseChordToken(raw);
    expect(tok.kind).toBe('unknown');
    if (tok.kind !== 'unknown') return;
    expect(tok.reason).toMatch(motivo);
  });
});

describe('normalização — só as formas declaradas', () => {
  it.each([
    ['Cm7(b5)', 'Cø'],
    ['Cm7b5', 'Cø'],
    ['Cø', 'Cø'],
    ['Cdim', 'C°'],
    ['Co', 'C°'],
    ['C°', 'C°'],
    ['Cmaj7', 'C7M'],
    ['CM7', 'C7M'],
    ['C7M', 'C7M'],
  ])('%s vira %s', (entrada, saida) => {
    expect(normalizeChord(entrada)).toBe(saida);
  });

  it('não mexe no que já está certo', () => {
    for (const raw of ['C', 'Am', 'F#m7', 'G/B', 'E7(b13)', '*2x']) {
      expect(normalizeChord(raw)).toBe(raw);
    }
  });

  it('devolve intacto o que não reconhece — normalizar não é consertar', () => {
    expect(normalizeChord('Bmm')).toBe('Bmm');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/chord.test.ts
```

Esperado: FAIL — `Failed to resolve import "../chord"`.

- [ ] **Step 3: Implementar**

`web/src/lib/chordpro/chord.ts`:

```ts
export type ChordToken =
  | {
      kind: 'chord';
      root: string;
      accidental: '' | '#' | 'b';
      quality: string;
      bass: string | null;
      raw: string;
    }
  | { kind: 'annotation'; text: string; raw: string }
  | { kind: 'unknown'; raw: string; reason: string };

const ROOT_RE = /^([A-G])([#b]?)/;
const BASS_RE = /^[A-G][#b]?$/;

/**
 * Qualidade, derivada dos 2.224 acordes do gabarito humano:
 *   ø  meio-diminuto        °  diminuto (sem precedente no corpus)
 *   m? sus(2|4)? (6|7|9|11|13|7M)? alteração*
 *   alteração := ( [#b]? número )      ex.: (b13) (#5) (9)
 */
const QUALITY_RE = /^(?:ø|°|m?(?:sus[24])?(?:7M|6|7|9|11|13)?(?:\([#b]?\d{1,2}\))*)$/;

export function parseChordToken(raw: string): ChordToken {
  if (raw === '') return { kind: 'unknown', raw, reason: 'token vazio' };

  // Anotação do acervo: [*2x], [*Coro]. Nunca é acorde, nunca é erro.
  if (raw.startsWith('*')) return { kind: 'annotation', text: raw.slice(1), raw };

  const rootMatch = ROOT_RE.exec(raw);
  if (!rootMatch) {
    return { kind: 'unknown', raw, reason: `"${raw}" não começa com uma raiz de A a G` };
  }
  const root = rootMatch[0];
  const accidental = (rootMatch[2] as '' | '#' | 'b') ?? '';

  let resto = raw.slice(root.length);
  let bass: string | null = null;

  const barra = resto.indexOf('/');
  if (barra !== -1) {
    const depois = resto.slice(barra + 1);
    if (!BASS_RE.test(depois)) {
      return {
        kind: 'unknown',
        raw,
        reason: `depois da barra, "${depois}" não é um baixo válido (esperado A a G, com # ou b)`,
      };
    }
    bass = depois;
    resto = resto.slice(0, barra);
  }

  if (!QUALITY_RE.test(resto)) {
    return {
      kind: 'unknown',
      raw,
      reason: `depois da raiz ${root}, "${resto}" não é uma qualidade válida`,
    };
  }

  return { kind: 'chord', root, accidental, quality: resto, bass, raw };
}

/**
 * Formas digitáveis viram a forma do acervo. Só isto é normalizado — espaçamento,
 * letra e ordem nunca são tocados. Token não reconhecido volta intacto:
 * normalizar não é consertar.
 */
const ALIASES: Array<[RegExp, string]> = [
  [/m7\(b5\)|m7b5/g, 'ø'],
  [/dim(?![a-z])/g, '°'],
  [/maj7|M7/g, '7M'],
];

export function normalizeChord(raw: string): string {
  if (raw.startsWith('*')) return raw;

  let out = raw;
  for (const [re, para] of ALIASES) out = out.replace(re, para);

  // "Co" → "C°" só quando o "o" é a qualidade inteira, para não estragar nada mais.
  const rootMatch = ROOT_RE.exec(out);
  if (rootMatch && out.slice(rootMatch[0].length) === 'o') out = `${rootMatch[0]}°`;

  return parseChordToken(out).kind === 'unknown' ? raw : out;
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/chord.test.ts
```

Esperado: PASS. Se o teste dos 109 tokens falhar, ele imprime exatamente quais tokens
foram recusados e por quê — **corrigir a gramática, nunca o fixture**. O fixture é o
gabarito do dono do acervo.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/chordpro/chord.ts web/src/lib/chordpro/__tests__/chord.test.ts
git commit -m "feat: gramática de acordes derivada do gabarito humano"
```

---

### Task 3: Corrigir o escape do serializer

Defeito em código já publicado: `serializeCells` não re-escapa `[` e `]`, então
`parse → serialize → parse` não é idempotente para colchete literal. Impacto em produção
hoje é zero (nada fora dos testes chama `serialize`), mas o editor da Task 8 passa a
chamar.

**Files:**
- Modify: `web/src/lib/chordpro/serialize.ts`
- Modify: `web/src/lib/chordpro/__tests__/roundtrip.test.ts`

**Interfaces:**
- Consumes: `Song`, `Cell` de `types.ts`
- Produces: `serialize` idempotente também com escapes. A Task 6 e a Task 8 dependem.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `web/src/lib/chordpro/__tests__/roundtrip.test.ts`, dentro do
`describe('round-trip parse → serialize → parse')`:

```ts
  it('preserva colchete literal escapado', () => {
    const once = parse('um \\[dois\\] tres\n');
    expect(once.stanzas[0].lines[0]).toEqual({
      kind: 'cells',
      cells: [{ chord: null, attached: false, text: 'um [dois] tres' }],
    });
    expect(serialize(once)).toContain('um \\[dois\\] tres');
    expect(parse(serialize(once))).toEqual(once);
  });

  it('colchete literal não vira acorde na volta', () => {
    const song = parse('um \\[dois\\] tres\n');
    const linha = parse(serialize(song)).stanzas[0].lines[0];
    if (linha.kind !== 'cells') throw new Error('esperava linha de células');
    expect(linha.cells.map((c) => c.chord)).toEqual([null]);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/roundtrip.test.ts
```

Esperado: FAIL — `serialize` emite `um [dois] tres` e o reparse cria um acorde `dois`.

- [ ] **Step 3: Implementar**

Em `web/src/lib/chordpro/serialize.ts`, trocar `serializeCells`:

```ts
/** Colchete no texto tem de voltar escapado, senão o reparse o lê como acorde. */
function escapeText(text: string): string {
  return text.replace(/([[\]])/g, '\\$1');
}

function serializeCells(cells: Cell[]): string {
  return cells
    .map((c) => (c.chord === null ? '' : `[${c.chord}]`) + escapeText(c.text))
    .join('');
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd web && npx vitest run src/lib/chordpro/
```

Esperado: PASS em tudo — incluindo os round-trips dos três fixtures reais, que não têm
escapes e continuam valendo.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/chordpro
git commit -m "fix: serializer re-escapa colchete literal no texto"
```

---

### Task 4: `validate.ts`

**Files:**
- Create: `web/src/lib/chordpro/validate.ts`
- Test: `web/src/lib/chordpro/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `parseChordToken` da Task 2; `Song` de `types.ts`
- Produces: `LineRef` acrescentado a **`types.ts`** (não a `validate.ts`), e `ValidationIssue = LineRef & { cell: number; raw: string; reason: string }`, `validateSong(song: Song): ValidationIssue[]` em `validate.ts`. As Tasks 5, 9 e 10 consomem.

`LineRef` mora em `types.ts` de propósito: a Task 5 (`edit.ts`) precisa dele para endereçar linha, e edição não deve depender de validação. Os dois dependem de `types.ts`, que não depende de ninguém.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/lib/chordpro/__tests__/validate.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { validateSong } from '../validate';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../__tests__/fixtures/chordpro', name), 'utf8');

describe('validateSong', () => {
  it('cifra correta não tem issue', () => {
    expect(validateSong(parse('Confio em [A]Deus [Bm]hoje\n'))).toEqual([]);
  });

  it('aponta o token e o lugar exato', () => {
    const issues = validateSong(parse('linha boa [A]ok\n\noutra [Bmm]ruim\n'));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ stanza: 1, line: 0, cell: 1, raw: 'Bmm' });
    expect(issues[0].reason).toMatch(/qualidade/i);
  });

  it('anotação nunca é issue', () => {
    expect(validateSong(parse('[*2x]\n[*Coro]\n'))).toEqual([]);
  });

  it('linha de comentário não produz issue', () => {
    expect(validateSong(parse('{comment: Refrão}\n'))).toEqual([]);
  });

  it('os três fixtures reais publicados passam limpos', () => {
    for (const nome of ['denso.chord', 'solto.chord', 'lapide.chord']) {
      expect(validateSong(parse(fixture(nome)))).toEqual([]);
    }
  });

  it('acha vários issues numa linha só', () => {
    const issues = validateSong(parse('[H]um [Bmm]dois\n'));
    expect(issues.map((i) => i.raw)).toEqual(['H', 'Bmm']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/validate.test.ts
```

Esperado: FAIL — `Failed to resolve import "../validate"`.

- [ ] **Step 3: Implementar**

Primeiro, acrescentar em `web/src/lib/chordpro/types.ts`:

```ts
/** Endereço de uma linha dentro do Song. Validação e edição falam as mesmas
 *  coordenadas; mora aqui para que edit.ts não precise depender de validate.ts. */
export type LineRef = { stanza: number; line: number };
```

Depois, `web/src/lib/chordpro/validate.ts`:

```ts
import { parseChordToken } from './chord';
import type { LineRef, Song } from './types';

export type ValidationIssue = LineRef & {
  cell: number;
  raw: string;
  reason: string;
};

/**
 * Percorre o Song e devolve os tokens que não são acorde nem anotação.
 * Anotação nunca é issue. Linha de comentário não tem células.
 * O {key:} do cabeçalho não passa por aqui: é tonalidade, não cifra.
 */
export function validateSong(song: Song): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  song.stanzas.forEach((stanza, si) => {
    stanza.lines.forEach((line, li) => {
      if (line.kind !== 'cells') return;
      line.cells.forEach((cell, ci) => {
        if (cell.chord === null) return;
        const token = parseChordToken(cell.chord);
        if (token.kind === 'unknown') {
          issues.push({
            stanza: si,
            line: li,
            cell: ci,
            raw: cell.chord,
            reason: token.reason,
          });
        }
      });
    });
  });

  return issues;
}
```

- [ ] **Step 4: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/lib/chordpro/
git add web/src/lib/chordpro
git commit -m "feat: validador de acordes sobre o Song"
```

---

### Task 5: `edit.ts` — operações de estrutura

**Files:**
- Create: `web/src/lib/chordpro/edit.ts`
- Test: `web/src/lib/chordpro/__tests__/edit.test.ts`

**Interfaces:**
- Consumes: `LineRef` de `types.ts` (acrescentado na Task 4); `parse`, `Song`, `SongHeader`, `Line`, `Stanza`
- Produces: `replaceLine`, `insertLineAfter`, `removeLine`, `splitStanzaAt`, `setHeaderField`, `lineToText`. A Task 8 consome.

`lineToText(song, at): string` devolve o texto editável de uma linha — é o par de `replaceLine`.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/lib/chordpro/__tests__/edit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import {
  insertLineAfter,
  lineToText,
  removeLine,
  replaceLine,
  setHeaderField,
  splitStanzaAt,
} from '../edit';

const song = () => parse('Confio em [A]Deus\n[E]   A linda [A]flor\n\nsegunda estrofe\n');

describe('lineToText / replaceLine', () => {
  it('lineToText devolve a linha como texto editável', () => {
    expect(lineToText(song(), { stanza: 0, line: 0 })).toBe('Confio em [A]Deus');
  });

  it('preserva os três espaços ao virar texto e voltar', () => {
    const s = song();
    const texto = lineToText(s, { stanza: 0, line: 1 });
    expect(texto).toBe('[E]   A linda [A]flor');
    const depois = replaceLine(s, { stanza: 0, line: 1 }, texto);
    expect(depois.stanzas[0].lines[1]).toEqual(s.stanzas[0].lines[1]);
  });

  it('replaceLine reparseia o texto novo', () => {
    const depois = replaceLine(song(), { stanza: 0, line: 0 }, 'Confio em [Bm]Deus');
    const linha = depois.stanzas[0].lines[0];
    if (linha.kind !== 'cells') throw new Error('esperava células');
    expect(linha.cells[1].chord).toBe('Bm');
  });

  it('não muta o Song original', () => {
    const s = song();
    const antes = JSON.stringify(s);
    replaceLine(s, { stanza: 0, line: 0 }, 'outra coisa');
    expect(JSON.stringify(s)).toBe(antes);
  });
});

describe('estrutura', () => {
  it('insertLineAfter põe uma linha vazia depois', () => {
    const depois = insertLineAfter(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas[0].lines).toHaveLength(3);
    expect(depois.stanzas[0].lines[1]).toEqual({
      kind: 'cells',
      cells: [{ chord: null, attached: false, text: '' }],
    });
  });

  it('removeLine tira a linha', () => {
    const depois = removeLine(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas[0].lines).toHaveLength(1);
    expect(lineToText(depois, { stanza: 0, line: 0 })).toBe('[E]   A linda [A]flor');
  });

  it('estrofe que esvazia é removida', () => {
    const s = parse('so uma linha\n\noutra estrofe\n');
    const depois = removeLine(s, { stanza: 0, line: 0 });
    expect(depois.stanzas).toHaveLength(1);
    expect(lineToText(depois, { stanza: 0, line: 0 })).toBe('outra estrofe');
  });

  it('splitStanzaAt manda a linha e as seguintes para uma estrofe nova', () => {
    const depois = splitStanzaAt(song(), { stanza: 0, line: 1 });
    expect(depois.stanzas).toHaveLength(3);
    expect(depois.stanzas[0].lines).toHaveLength(1);
    expect(lineToText(depois, { stanza: 1, line: 0 })).toBe('[E]   A linda [A]flor');
  });

  it('splitStanzaAt na primeira linha não cria estrofe vazia', () => {
    const depois = splitStanzaAt(song(), { stanza: 0, line: 0 });
    expect(depois.stanzas).toHaveLength(2);
  });
});

describe('cabeçalho', () => {
  it('define um campo', () => {
    expect(setHeaderField(song(), 'key', 'A').header.key).toBe('A');
  });

  it('valor vazio remove a diretiva', () => {
    const s = setHeaderField(song(), 'key', 'A');
    expect(setHeaderField(s, 'key', '').header.key).toBeUndefined();
    expect(setHeaderField(s, 'key', '   ').header.key).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/lib/chordpro/__tests__/edit.test.ts
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Expor `serializeLine` no serializer**

`edit.ts` depende disto, então vem antes. Em `web/src/lib/chordpro/serialize.ts`,
acrescentar `Line` ao import de tipos e exportar:

```ts
/** Uma linha isolada como texto — é o que torna a linha editável. */
export function serializeLine(line: Line): string {
  return line.kind === 'comment' ? `{comment: ${line.text}}` : serializeCells(line.cells);
}
```

E reusar dentro de `serialize`, no lugar do ternário que está lá hoje, para não haver
duas verdades sobre como uma linha vira texto:

```ts
    for (const line of stanza.lines) {
      out.push(serializeLine(line));
    }
```

Rodar `npx vitest run src/lib/chordpro/__tests__/roundtrip.test.ts` — deve continuar
verde, porque o comportamento é o mesmo.

- [ ] **Step 4: Implementar `edit.ts`**

`web/src/lib/chordpro/edit.ts`:

```ts
import { parse } from './parse';
import { serializeLine } from './serialize';
import type { Line, LineRef, Song, SongHeader, Stanza } from './types';

/** Todas as operações são puras: recebem Song, devolvem Song novo, nunca mutam. */

function mapStanzas(song: Song, fn: (stanzas: Stanza[]) => Stanza[]): Song {
  const stanzas = fn(song.stanzas.map((s) => ({ lines: [...s.lines] })));
  return { ...song, stanzas: stanzas.filter((s) => s.lines.length > 0) };
}

/** Texto editável de uma linha — o par de replaceLine. */
export function lineToText(song: Song, at: LineRef): string {
  const line = song.stanzas[at.stanza]?.lines[at.line];
  if (!line) return '';
  return line.kind === 'comment' ? `{comment: ${line.text}}` : serializeLine(line);
}

export function replaceLine(song: Song, at: LineRef, texto: string): Song {
  // Reparseia pelo parser de verdade: uma linha só, sem lógica de acorde nova aqui.
  const parsed = parse(texto);
  const nova: Line = parsed.stanzas[0]?.lines[0] ?? {
    kind: 'cells',
    cells: [{ chord: null, attached: false, text: '' }],
  };
  return mapStanzas(song, (stanzas) => {
    stanzas[at.stanza].lines[at.line] = nova;
    return stanzas;
  });
}

export function insertLineAfter(song: Song, at: LineRef): Song {
  const vazia: Line = { kind: 'cells', cells: [{ chord: null, attached: false, text: '' }] };
  return mapStanzas(song, (stanzas) => {
    stanzas[at.stanza].lines.splice(at.line + 1, 0, vazia);
    return stanzas;
  });
}

export function removeLine(song: Song, at: LineRef): Song {
  return mapStanzas(song, (stanzas) => {
    stanzas[at.stanza].lines.splice(at.line, 1);
    return stanzas;
  });
}

/** A linha apontada e as seguintes viram uma estrofe nova. */
export function splitStanzaAt(song: Song, at: LineRef): Song {
  return mapStanzas(song, (stanzas) => {
    const alvo = stanzas[at.stanza];
    const depois = alvo.lines.splice(at.line);
    stanzas.splice(at.stanza + 1, 0, { lines: depois });
    return stanzas;
  });
}

/** Valor vazio remove a diretiva — é o que o parser já faz com {key: } e {subtitle: ?}. */
export function setHeaderField(song: Song, campo: keyof SongHeader, valor: string): Song {
  const header: SongHeader = { ...song.header };
  if (valor.trim() === '') delete header[campo];
  else header[campo] = valor;
  return { ...song, header };
}
```

- [ ] **Step 5: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/lib/chordpro/
git add web/src/lib/chordpro
git commit -m "feat: operações puras de edição sobre o Song"
```

---

### Task 6: Anotação deixa de parecer acorde

Defeito em produção: `ChordProView` desenha `[*2x]` como rótulo vermelho de acorde.

**Files:**
- Modify: `web/src/components/chordpro/ChordProView.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/components/chordpro/__tests__/ChordProView.test.tsx`

**Interfaces:**
- Consumes: `parseChordToken` da Task 2
- Produces: classe CSS `cp-cell--annotation` nas células de anotação.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `web/src/components/chordpro/__tests__/ChordProView.test.tsx`:

```ts
describe('anotação não é acorde', () => {
  it('marca a célula de [*2x] com --annotation e não com --bar', () => {
    const { container } = renderSource('[*2x]');
    const cell = container.querySelector('.cp-cell')!;
    expect(cell.className).toContain('cp-cell--annotation');
    expect(cell.className).not.toContain('cp-cell--bar');
    expect(cell.querySelector('.cp-chord')!.textContent).toBe('*2x');
  });

  it('acorde de verdade não ganha --annotation', () => {
    const { container } = renderSource('ha[Cm]bi');
    const cells = container.querySelectorAll('.cp-cell');
    expect(cells[1].className).not.toContain('cp-cell--annotation');
  });

  it('[*Coro] também', () => {
    const { container } = renderSource('[*Coro]');
    expect(container.querySelector('.cp-cell')!.className).toContain('cp-cell--annotation');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/components/chordpro/
```

Esperado: FAIL — a classe não existe.

- [ ] **Step 3: Implementar**

Em `web/src/components/chordpro/ChordProView.tsx`, importar e usar:

```tsx
import { parseChordToken } from '../../lib/chordpro/chord';
import type { Cell, Song } from '../../lib/chordpro/types';

function cellClassName(cell: Cell): string {
  const classes = ['cp-cell'];
  // Célula sem acorde não tem rótulo para alinhar, então pode quebrar linha.
  if (cell.chord === null) classes.push('cp-cell--free');
  // [*2x] e [*Coro] são anotação do acervo, não acorde — não levam a tinta de acorde.
  if (cell.chord !== null && parseChordToken(cell.chord).kind === 'annotation') {
    classes.push('cp-cell--annotation');
  }
  if (cell.attached) classes.push('cp-cell--bar');
  return classes.join(' ');
}
```

- [ ] **Step 4: Estilo**

Acrescentar em `web/src/styles/global.css`, junto ao bloco do viewer:

```css
/* Anotação do acervo ([*2x], [*Coro]): é instrução de execução, não acorde.
   Não leva a tinta vermelha, que significa "toque este acorde aqui". */
.cp-cell--annotation > .cp-chord {
  color: var(--cp-dim);
  font-style: italic;
  font-weight: 600;
}
```

- [ ] **Step 5: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/components/chordpro/
git add web/src/components/chordpro web/src/styles/global.css
git commit -m "fix: anotação do acervo deixa de ser desenhada como acorde"
```

---

### Task 7: `AuthControl`

O controle está duplicado inline em `HomePage.tsx` e `PraiseDetailPage.tsx`, com texto
divergente ("Entrar com o Google" × "Entrar com Google").

**Files:**
- Create: `web/src/components/AuthControl.tsx`
- Modify: `web/src/pages/HomePage.tsx`, `web/src/pages/PraiseDetailPage.tsx`
- Test: `web/src/components/__tests__/AuthControl.test.tsx`

**Interfaces:**
- Consumes: `useAuth` de `context/AuthContext` (expõe `user`, `ready`, `isAuthenticated`, `logout`), `getLoginUrl` de `services/api`
- Produces: `<AuthControl />`. A Task 9 usa no cabeçalho da página de cifra.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/components/__tests__/AuthControl.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthControl } from '../AuthControl';
import * as AuthContext from '../../context/AuthContext';

function mockAuth(user: { name?: string; email?: string } | null, ready = true) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user,
    ready,
    isAuthenticated: Boolean(user),
    logout: vi.fn(),
    authError: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
}

describe('AuthControl', () => {
  it('anônimo vê o botão de entrar, com o texto padronizado', () => {
    mockAuth(null);
    render(<AuthControl />);
    const link = screen.getByRole('link', { name: 'Entrar com o Google' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/auth'));
  });

  it('logado vê o nome e o sair', () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    render(<AuthControl />);
    expect(screen.getByText('Jairo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /entrar/i })).not.toBeInTheDocument();
  });

  it('cai para o email quando não há nome', () => {
    mockAuth({ email: 'j@x.com' });
    render(<AuthControl />);
    expect(screen.getByText('j@x.com')).toBeInTheDocument();
  });

  it('enquanto a sessão não resolveu, não pisca o botão de entrar', () => {
    mockAuth(null, false);
    render(<AuthControl />);
    expect(screen.queryByRole('link', { name: /entrar/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/components/__tests__/AuthControl.test.tsx
```

- [ ] **Step 3: Implementar**

`web/src/components/AuthControl.tsx`:

```tsx
import { useAuth } from '../context/AuthContext';
import { getLoginUrl } from '../services/api';

/**
 * Controle de sessão. Estava duplicado inline na HomePage e na PraiseDetailPage,
 * com textos divergentes; aqui o texto é um só.
 */
export function AuthControl({ children }: { children?: React.ReactNode }) {
  const { user, ready, logout } = useAuth();

  // Enquanto a sessão não resolveu, não mostrar nada: piscar "Entrar" para quem
  // já está logado é pior que esperar.
  if (!ready) return null;

  if (!user) {
    return (
      <a className="auth-btn" href={getLoginUrl()}>
        Entrar com o Google
      </a>
    );
  }

  return (
    <>
      <span className="auth-user">{user.name || user.email}</span>
      {children}
      <button type="button" className="auth-btn" onClick={() => void logout()}>
        Sair
      </button>
    </>
  );
}
```

- [ ] **Step 4: Usar nos dois lugares que duplicavam**

Em `web/src/pages/HomePage.tsx`, trocar o bloco `{authReady && user ? (...) : (...)}` do
cabeçalho por `<AuthControl><Link to="/praise/new" className="auth-btn">Novo louvor</Link></AuthControl>`,
removendo o `getLoginUrl` do import se ficar sem uso.

Em `web/src/pages/PraiseDetailPage.tsx`, trocar o `<a className="auth-btn" href={getLoginUrl()}>Entrar com Google</a>`
e o par autenticado correspondente por `<AuthControl />`, preservando o botão "Baixar em
ZIP" que está ao lado — ele não faz parte do controle de sessão.

- [ ] **Step 5: Rodar tudo e ver que nada quebrou**

```bash
cd web && npx vitest run && npx tsc -b --noEmit
```

Esperado: os 9 testes de `api.test.ts` continuam falhando (baseline), nada mais.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "refactor: extrai AuthControl e padroniza o texto de login"
```

---

### Task 8: `ChordHints` — o manual

**Files:**
- Create: `web/src/components/chordpro/ChordHints.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/src/components/chordpro/__tests__/ChordHints.test.tsx`

**Interfaces:**
- Consumes: nada
- Produces: `<ChordHints onInsert={(simbolo: string) => void} />`. A Task 9 passa o
  `onInsert` que injeta o símbolo no campo em edição.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/components/chordpro/__tests__/ChordHints.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordHints } from '../ChordHints';

describe('ChordHints', () => {
  it('ensina a convenção do acervo, não teoria genérica', async () => {
    render(<ChordHints onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    expect(screen.getByText('C7M')).toBeInTheDocument();
    expect(screen.getByText(/o acervo usa 7M/i)).toBeInTheDocument();
    expect(screen.getByText('Cø')).toBeInTheDocument();
    expect(screen.getByText('C(#5)')).toBeInTheDocument();
    expect(screen.getByText('[*2x]')).toBeInTheDocument();
    expect(screen.getByText(/anotação, não acorde/i)).toBeInTheDocument();
  });

  it('não sugere maj7, que é convenção alheia', async () => {
    render(<ChordHints onInsert={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));
    expect(screen.queryByText(/maj7/)).not.toBeInTheDocument();
  });

  it('insere os símbolos que não estão no teclado', async () => {
    const onInsert = vi.fn();
    render(<ChordHints onInsert={onInsert} />);
    await userEvent.click(screen.getByRole('button', { name: /como escrever/i }));

    await userEvent.click(screen.getByRole('button', { name: 'Inserir ø' }));
    expect(onInsert).toHaveBeenCalledWith('ø');

    await userEvent.click(screen.getByRole('button', { name: 'Inserir °' }));
    expect(onInsert).toHaveBeenCalledWith('°');
  });

  it('começa fechado', () => {
    render(<ChordHints onInsert={vi.fn()} />);
    expect(screen.queryByText('C7M')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/components/chordpro/__tests__/ChordHints.test.tsx
```

- [ ] **Step 3: Implementar**

`web/src/components/chordpro/ChordHints.tsx`:

```tsx
import { useState } from 'react';

/** Vocabulário do acervo, medido nos 2.224 acordes do gabarito humano —
 *  não é teoria musical genérica. */
const HINTS: Array<[string, string]> = [
  ['C', 'maior'],
  ['Cm', 'menor'],
  ['C7', 'com sétima'],
  ['C7M', 'com sétima maior — o acervo usa 7M'],
  ['Cø', 'meio-diminuto'],
  ['C°', 'diminuto'],
  ['C(#5)', 'aumentado'],
  ['Csus4', 'suspenso'],
  ['C6', 'com sexta'],
  ['C9', 'com nona'],
  ['C/E', 'baixo invertido'],
  ['[*2x]', 'repetição — anotação, não acorde'],
];

export function ChordHints({ onInsert }: { onInsert: (simbolo: string) => void }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="cp-hints">
      <button
        type="button"
        className="cp-hints-toggle"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {aberto ? '▾' : '▸'} Como escrever os acordes
      </button>

      {aberto ? (
        <div className="cp-hints-body">
          <dl className="cp-hints-list">
            {HINTS.map(([forma, oque]) => (
              <div className="cp-hints-row" key={forma}>
                <dt>{forma}</dt>
                <dd>{oque}</dd>
              </div>
            ))}
          </dl>
          <div className="cp-hints-insert">
            <span>Não estão no teclado:</span>
            <button type="button" onClick={() => onInsert('ø')}>Inserir ø</button>
            <button type="button" onClick={() => onInsert('°')}>Inserir °</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Estilo**

Acrescentar em `web/src/styles/global.css`: `.cp-hints` (borda `--border-subtle`, raio
`--radius-md`, fundo `--bg-surface`), `.cp-hints-toggle` (largura total, alinhado à
esquerda, `--text-sm`, `--text-secondary`, sem borda), `.cp-hints-list` em grade
`auto 1fr` com `gap: var(--space-1) var(--space-4)`, `dt` em monoespaçada e cor
`--cp-ink`, `dd` em `--text-secondary`, e `.cp-hints-insert` em linha com `gap:
var(--space-2)`. Reusar tokens; não inventar valores.

- [ ] **Step 5: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/components/chordpro/
git add web/src/components/chordpro web/src/styles/global.css
git commit -m "feat: manual de acordes com o vocabulário do acervo"
```

---

### Task 9: `ChordProEditor` — edição na própria linha

**Files:**
- Create: `web/src/components/chordpro/ChordProEditor.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/src/components/chordpro/__tests__/ChordProEditor.test.tsx`

**Interfaces:**
- Consumes: `edit.ts` da Task 5 (`lineToText`, `replaceLine`, `insertLineAfter`, `removeLine`, `splitStanzaAt`, `setHeaderField`), `validateSong` e `ValidationIssue` da Task 4, `normalizeChord` da Task 2, `ChordProView`, `ChordHints` da Task 8
- Produces: `<ChordProEditor song={song} onChange={(s: Song) => void} issues={ValidationIssue[]} />`. A Task 10 monta a página em volta.

O editor é **controlado**: não guarda o `Song`, recebe e devolve. Quem guarda é a página,
que também é quem grava.

- [ ] **Step 1: Escrever o teste que falha**

`web/src/components/chordpro/__tests__/ChordProEditor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChordProEditor } from '../ChordProEditor';
import { parse } from '../../../lib/chordpro/parse';
import { validateSong } from '../../../lib/chordpro/validate';

const fonte = '{title: Confio Em Deus}\n{key: A}\n\nConfio em [A]Deus\n[E]   A linda [A]flor\n';

function renderEditor(src = fonte) {
  const song = parse(src);
  const onChange = vi.fn();
  const utils = render(
    <ChordProEditor song={song} onChange={onChange} issues={validateSong(song)} />
  );
  return { ...utils, song, onChange };
}

describe('editar uma linha', () => {
  it('clicar na linha abre um campo com o texto dela', async () => {
    renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    expect(screen.getByRole('textbox', { name: /linha/i })).toHaveValue('Confio em [A]Deus');
  });

  it('confirmar devolve um Song novo com a linha reparseada', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Confio em [Bm]Deus');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onChange).toHaveBeenCalled();
    const novo = onChange.mock.calls.at(-1)![0];
    const linha = novo.stanzas[0].lines[0];
    expect(linha.cells[1].chord).toBe('Bm');
  });

  it('normaliza o acorde digitado na confirmação', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'Confio em [Cm7b5]Deus');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    const novo = onChange.mock.calls.at(-1)![0];
    expect(novo.stanzas[0].lines[0].cells[1].chord).toBe('Cø');
  });

  it('cancelar não altera nada', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    await userEvent.type(screen.getByRole('textbox', { name: /linha/i }), 'lixo');
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('o espaçamento fica visível enquanto se edita', () => {
  it('o preview da linha em edição usa as células reais', async () => {
    const { container } = renderEditor();
    await userEvent.click(screen.getByText(/A linda/));
    const preview = container.querySelector('.cp-editing-preview')!;
    expect(preview.querySelector('.cp-text')!.textContent).toBe('   A linda ');
  });

  it('o preview acompanha o que está sendo digitado', async () => {
    const { container } = renderEditor();
    await userEvent.click(screen.getByText(/Confio em/));
    const campo = screen.getByRole('textbox', { name: /linha/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, 'ab[C]cd');
    const preview = container.querySelector('.cp-editing-preview')!;
    expect(preview.querySelector('.cp-chord')!.textContent).toBe('C');
  });
});

describe('estrutura', () => {
  it('adiciona linha', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /inserir linha/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].stanzas[0].lines).toHaveLength(3);
  });

  it('remove linha', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /remover linha/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].stanzas[0].lines).toHaveLength(1);
  });

  it('separa estrofe', async () => {
    const { onChange } = renderEditor();
    await userEvent.click(screen.getAllByRole('button', { name: /separar estrofe/i })[1]);
    expect(onChange.mock.calls.at(-1)![0].stanzas).toHaveLength(2);
  });
});

describe('cabeçalho', () => {
  it('edita o tom', async () => {
    const { onChange } = renderEditor();
    const campo = screen.getByLabelText('Tom');
    await userEvent.clear(campo);
    await userEvent.type(campo, 'G');
    expect(onChange.mock.calls.at(-1)![0].header.key).toBe('G');
  });

  it('esvaziar o campo remove a diretiva', async () => {
    const { onChange } = renderEditor();
    await userEvent.clear(screen.getByLabelText('Tom'));
    expect(onChange.mock.calls.at(-1)![0].header.key).toBeUndefined();
  });
});

describe('erros de acorde', () => {
  it('marca a linha que tem token não reconhecido', () => {
    const { container } = renderEditor('Confio em [Bmm]Deus\n');
    expect(container.querySelector('.cp-line-row--invalid')).not.toBeNull();
  });

  it('mostra o motivo', () => {
    renderEditor('Confio em [Bmm]Deus\n');
    expect(screen.getByText(/Bmm/)).toBeInTheDocument();
    expect(screen.getByText(/não é uma qualidade válida/i)).toBeInTheDocument();
  });

  it('anotação não é marcada como erro', () => {
    const { container } = renderEditor('[*2x]\nletra [C]aqui\n');
    expect(container.querySelector('.cp-line-row--invalid')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/components/chordpro/__tests__/ChordProEditor.test.tsx
```

- [ ] **Step 3: Implementar**

`web/src/components/chordpro/ChordProEditor.tsx`. Estrutura obrigatória:

```tsx
import { useMemo, useRef, useState } from 'react';
import { ChordHints } from './ChordHints';
import { ChordProView } from './ChordProView';
import { normalizeChord } from '../../lib/chordpro/chord';
import {
  insertLineAfter, lineToText, removeLine, replaceLine, setHeaderField, splitStanzaAt,
} from '../../lib/chordpro/edit';
import { parse } from '../../lib/chordpro/parse';
import type { Song, SongHeader } from '../../lib/chordpro/types';
import type { LineRef, ValidationIssue } from '../../lib/chordpro/validate';

const CAMPOS: Array<[keyof SongHeader, string]> = [
  ['title', 'Título'], ['subtitle', 'Número'], ['key', 'Tom'],
  ['rhythm', 'Ritmo'], ['artist', 'Autoria'],
];

/** Normaliza só os acordes da linha, deixando letra e espaçamento intactos. */
function normalizeLine(texto: string): string {
  return texto.replace(/\[([^\]]*)\]/g, (_m, dentro) => `[${normalizeChord(dentro)}]`);
}
```

Comportamento exigido pelos testes:

- Estado local só do que está em edição: `editing: LineRef | null` e `draft: string`.
  O `Song` **nunca** é guardado aqui — vem por prop, sai por `onChange`.
- Cada linha renderiza dentro de um `.cp-line-row`; quando há issue nessa `LineRef`, a
  classe `cp-line-row--invalid` é acrescentada e o `reason` aparece ao lado.
- Clicar na linha define `editing` e `draft = lineToText(song, ref)`. O campo tem
  `aria-label="Texto da linha"` (é o que `{ name: /linha/i }` casa).
- Abaixo do campo, `<div className="cp-editing-preview">` renderiza
  `<ChordProView song={parse(draft)} />` — preview ao vivo com as células reais, que é
  o que torna o espaçamento visível.
- "Confirmar" chama `onChange(replaceLine(song, editing, normalizeLine(draft)))` e limpa
  `editing`. "Cancelar" só limpa `editing`, sem `onChange`.
- Botões por linha, com `aria-label` exatos: `Inserir linha abaixo`, `Remover linha`,
  `Separar estrofe aqui` — chamando `insertLineAfter`, `removeLine`, `splitStanzaAt`.
- Cabeçalho: um `<input>` por campo de `CAMPOS`, com `<label>` associado pelo texto da
  segunda posição, `value={song.header[campo] ?? ''}`, e `onChange` chamando
  `onChange(setHeaderField(song, campo, e.target.value))`.
- `<ChordHints onInsert={...} />` insere o símbolo na posição do cursor do campo em
  edição (guardar o `ref` do input); se nada estiver em edição, o botão não faz nada.

- [ ] **Step 4: Estilo**

Acrescentar em `web/src/styles/global.css`: `.cp-line-row` (flex, `gap: var(--space-2)`,
ações reveladas em `:hover` e em `:focus-within`), `.cp-line-row--invalid` (borda
esquerda 2px em `#ffb020` e fundo `rgba(255,176,32,.07)`), `.cp-line-issue` (`--text-xs`,
cor `#ffb020`), `.cp-editing-preview` (recuo à esquerda, borda esquerda pontilhada em
`--border-subtle`), `.cp-header-fields` em grade que colapsa em uma coluna abaixo de
640px. Reusar tokens.

- [ ] **Step 5: Rodar, ver passar, commitar**

```bash
cd web && npx vitest run src/components/chordpro/ && npx tsc -b --noEmit
git add web/src/components/chordpro web/src/styles/global.css
git commit -m "feat: editor de cifra com edição na própria linha"
```

---

### Task 10: Ligar na página — modo de edição, gravação e concorrência

**Files:**
- Modify: `web/src/pages/ChordProPage.tsx`, `web/src/services/api.ts`
- Test: `web/src/pages/__tests__/ChordProPage.test.tsx`

**Interfaces:**
- Consumes: tudo das tasks anteriores
- Produces: `putMaterialContent(materialId: string, content: string): Promise<{ ok: boolean }>` em `services/api.ts`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar em `web/src/pages/__tests__/ChordProPage.test.tsx`. O arquivo já tem
`stubFetch`, `praise` e `renderPage` — reusar.

O arquivo **não** tem helper de autenticação hoje: ele só envolve em `<AuthProvider>`.
Então acrescentar também este helper, junto dos outros, no topo:

```tsx
import userEvent from '@testing-library/user-event';
import * as AuthContext from '../../context/AuthContext';

/** O AuthProvider real faria uma chamada de rede; aqui a sessão é decidida no teste. */
function mockAuth(user: { name?: string; email?: string } | null) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user,
    ready: true,
    isAuthenticated: Boolean(user),
    logout: vi.fn(),
    authError: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
}
```

Conferir os campos reais de `AuthContextValue` em `web/src/context/AuthContext.tsx` antes
de escrever — o `as unknown as` existe para não travar em campos que o contexto tenha e o
teste não precise, mas os nomes que o componente lê (`user`, `ready`, `isAuthenticated`,
`logout`) têm de estar certos.

Os testes de edição precisam de `mockAuth` **antes** do `renderPage()`, e os testes que
já existem no arquivo continuam sem chamar `mockAuth` — o `vi.restoreAllMocks()` no
`afterEach` que já está lá cuida do isolamento.

```tsx
describe('modo de edição', () => {
  it('sem sessão não há botão de editar', async () => {
    mockAuth(null);
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'X' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('com sessão, editar abre o editor', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    expect(screen.getByLabelText('Tom')).toHaveValue('A');
  });

  it('acorde inválido desabilita o salvar e oferece o forçar', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    stubFetch(() => new Response('{title: X}\n\nletra [Bmm]aqui', { status: 200 }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));

    expect(screen.getByRole('button', { name: /^salvar$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /salvar assim mesmo/i })).toBeEnabled();
    expect(screen.getByText(/1 acorde não reconhecido/i)).toBeInTheDocument();
  });

  it('salvar manda o ChordPro serializado para o endpoint', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response('{title: X}\n{key: A}\n\n[A]letra', { status: 200 });
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    await waitFor(() => expect(calls.some(([, i]) => i?.method === 'PUT')).toBe(true));
    const put = calls.find(([, i]) => i?.method === 'PUT')!;
    expect(put[0]).toContain('/api/materials/m1/content');
    expect(String(put[1]!.body)).toContain('[A]letra');
    expect(String(put[1]!.body)).toContain('{key: A}');
  });

  it('aborta quando o arquivo mudou no servidor desde o carregamento', async () => {
    mockAuth({ name: 'Jairo', email: 'j@x.com' });
    let gets = 0;
    vi.spyOn(api, 'getPraise').mockResolvedValue(praise);
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      gets += 1;
      // o segundo GET (a checagem antes de gravar) devolve conteúdo diferente
      return new Response(
        gets === 1 ? '{title: X}\n\n[A]letra' : '{title: X}\n\n[A]OUTRA COISA',
        { status: 200 }
      );
    }));

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /editar/i }));
    await userEvent.click(screen.getByRole('button', { name: /^salvar$/i }));

    expect(await screen.findByText(/mudou no servidor/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd web && npx vitest run src/pages/__tests__/ChordProPage.test.tsx
```

- [ ] **Step 3: `putMaterialContent` em `services/api.ts`**

```ts
/** Grava o .chord revisado. O endpoint aceita corpo em texto puro e devolve
 *  { ok, material_id, praise_id, r2_key }. */
export async function putMaterialContent(
  materialId: string,
  content: string
): Promise<{ ok: boolean }> {
  const response = await fetchJson<{ ok: boolean }>(
    `${API_BASE_URL}/api/materials/${materialId}/content`,
    {
      method: 'PUT',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: content,
    }
  );
  return response;
}
```

Conferir a assinatura de `fetchJson` no arquivo antes de escrever: ela já injeta
credenciais e headers de auth, e é por ela que todas as chamadas passam.

- [ ] **Step 4: Ligar na página**

Em `web/src/pages/ChordProPage.tsx`:

- `const [draft, setDraft] = useState<Song | null>(null)` — `null` significa modo leitura.
- `const [loadedSource, setLoadedSource] = useState<string | null>(null)` — guarda o texto
  exato que veio do servidor, para a checagem de concorrência.
- Botão **Editar** ao lado do tema, só quando `useAuth().isAuthenticated`; abre
  `setDraft(song)`.
- Em modo edição, `<ChordProEditor song={draft} onChange={setDraft} issues={issues} />`
  no lugar do `<ChordProView>`, com `issues = validateSong(draft)`.
- Barra de ações: **Cancelar** (`setDraft(null)`), **Salvar** (desabilitado quando
  `issues.length > 0`), e **Salvar assim mesmo** (só aparece quando há issues). O resumo
  ao lado diz `"{n} acorde não reconhecido"` / `"{n} acordes não reconhecidos"`.
- `salvar(forcar: boolean)`:
  1. refaz `fetch(getAssetUrl(material.r2_key))` e lê o texto;
  2. se diferente de `loadedSource`, mostra **"O arquivo mudou no servidor desde que você
     abriu. Recarregue antes de salvar."** e para — inclusive quando `forcar` é `true`,
     porque "salvar assim mesmo" contorna só o validador;
  3. senão, `putMaterialContent(material.id, serialize(draft))`, depois `setLoadedSource`
     com o que foi gravado e `setDraft(null)`.
- Erro de gravação vira mensagem ao lado dos botões, sem sair do modo de edição — o
  trabalho não pode ser perdido.

- [ ] **Step 5: Rodar tudo**

```bash
cd web && npx vitest run && npx tsc -b --noEmit && npx eslint src/lib/chordpro src/components/chordpro src/components/AuthControl.tsx src/pages/ChordProPage.tsx
```

Esperado: só os 9 testes do baseline falhando; tsc e eslint limpos nos arquivos novos.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat: edição de cifra na página, com validação e detecção de escrita concorrente"
```

---

## Verificação final

- [ ] `cd web && npx vitest run` — só as 9 falhas do baseline
- [ ] `cd web && npx tsc -b --noEmit` — limpo
- [ ] `cd web && npx eslint .` — nenhum problema novo (42 pré-existentes)
- [ ] `cd api && npx vitest run` — só a falha do baseline (CORP em mp3)
- [ ] O teste dos 109 tokens passa — nenhum acorde do gabarito humano é recusado
- [ ] `npm run dev` apontando para a API publicada:
  ```bash
  cd web && VITE_API_URL=https://coldigom-api.jairofilho79.workers.dev npm run dev
  ```
  Abrir `/praise/002bbc89-cf6c-4002-b64c-c538bdbf47e2`, entrar na Cifra I:
  - anônimo: nenhum botão de editar, "Entrar com o Google" no cabeçalho
  - logado: editar, clicar em `[E]   A linda [A]flor`, ver os três espaços no preview
  - digitar `[Cm7b5]` e confirmar: vira `[Cø]`
  - digitar `[Bmm]`: salvar desabilita, motivo aparece, "salvar assim mesmo" habilitado
- [ ] Numa cifra com `[*2x]`, a anotação não aparece na tinta de acorde
