import type { Cell, HeaderEntry, Line, RawLine, Song, SongHeader, Stanza } from './types';

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
export function parseCells(line: string): Cell[] {
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

/**
 * ChordPro → Song.
 *
 * Tudo que a estrutura não representa (`{meta: ...}`, diretiva desconhecida, diretiva
 * de valor ausente, nota ";", linha em branco a mais) é guardado LITERAL, na posição em
 * que estava: em `headerLines` enquanto o corpo não começou, em `rawLines` depois disso.
 * É o que permite a `serialize` devolver o arquivo byte a byte — abrir uma cifra e
 * salvar sem mudar nada não pode reescrever o que o pipeline gerou nem o que o dono
 * revisou à mão, porque o R2 não versiona.
 */
export function parse(source: string): Song {
  const header: SongHeader = {};
  const notes: string[] = [];
  const stanzas: Stanza[] = [];
  const headerLines: HeaderEntry[] = [];
  const rawLines: RawLine[] = [];
  let current: Line[] = [];
  // O corpo começa na primeira linha estrutural (células ou {comment}); antes dela,
  // linha crua é cabeçalho e sai no topo; depois, tem endereço dentro do corpo.
  let corpoComecou = false;

  const flush = () => {
    if (current.length > 0) {
      stanzas.push({ lines: current });
      current = [];
    }
  };

  const guardaCrua = (text: string) => {
    if (corpoComecou) rawLines.push({ stanza: stanzas.length, line: current.length, text });
    else headerLines.push({ kind: 'raw', text });
  };

  const guardaLinha = (line: Line) => {
    current.push(line);
    corpoComecou = true;
  };

  // O "\n" final do arquivo não é uma linha em branco — sem isto todo arquivo ganharia
  // uma linha crua vazia no fim.
  const linhas = source.split(/\r?\n/);
  if (linhas.length > 0 && linhas[linhas.length - 1] === '') linhas.pop();

  for (const raw of linhas) {
    const directive = DIRECTIVE_RE.exec(raw.trim());
    if (directive) {
      const key = directive[1].trim().toLowerCase();
      if (isHeaderKey(key)) {
        const value = directiveValue(directive[2]);
        if (value !== undefined) header[key] = value;
        headerLines.push({ kind: 'field', key, value, text: raw });
      } else if (key === 'comment' && directive[2].trim() !== '') {
        // Sem trim no valor: `{comment: Coro }` existe no acervo e o espaço tem de
        // voltar. Espaço à esquerda o próprio DIRECTIVE_RE já comeu.
        guardaLinha({ kind: 'comment', text: directive[2] });
      } else {
        guardaCrua(raw);
      }
      continue;
    }

    const note = NOTE_RE.exec(raw);
    if (note) {
      // `notes` é o que o painel do material exibe (por isso o trim); a linha crua é
      // o que volta para o arquivo, com o espaçamento e a posição originais.
      notes.push(note[1].trim());
      guardaCrua(raw);
      continue;
    }

    if (raw.trim() === '') {
      flush();
      guardaCrua(raw);
      continue;
    }

    guardaLinha({ kind: 'cells', cells: parseCells(raw) });
  }

  flush();

  const hasLyrics = stanzas.some((s) => s.lines.some((l) => l.kind === 'cells'));
  return { header, stanzas, notes, hasLyrics, headerLines, rawLines };
}
