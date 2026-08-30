import type { Cell, Line, Song, SongHeader, Stanza } from './types';

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

/**
 * Quebra a linha em células, lendo a adjacência de cada acorde na linha ORIGINAL.
 *
 *   attachLeft  = existe caractere anterior e não é espaço
 *   attachRight = existe caractere seguinte e não é espaço
 *   attached    = attachLeft || attachRight
 *
 * `attached` é o que desenha a barra vermelha: no hinário impresso a barra marca a
 * sílaba do acorde, e só existe quando o acorde encosta em texto.
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

    current.push({ kind: 'cells', cells: parseCells(raw) });
  }

  flush();

  const hasLyrics = stanzas.some((s) => s.lines.some((l) => l.kind === 'cells'));
  return { header, stanzas, notes, hasLyrics };
}
