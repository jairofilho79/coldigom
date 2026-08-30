import type { Cell, Song } from './types';

const HEADER_ORDER = ['title', 'subtitle', 'key', 'rhythm', 'artist'] as const;

/** Colchete no texto tem de voltar escapado, senão o reparse o lê como acorde. */
function escapeText(text: string): string {
  return text.replace(/([[\]])/g, '\\$1');
}

function serializeCells(cells: Cell[]): string {
  return cells
    .map((c) => (c.chord === null ? '' : `[${c.chord}]`) + escapeText(c.text))
    .join('');
}

/**
 * Song → ChordPro. O par com parse é idempotente: parse(serialize(parse(x))) === parse(x),
 * espaçamento incluído.
 *
 * Não reproduz o arquivo byte a byte — as diretivas saem numa ordem canônica e as notas ";"
 * sobem para o topo — mas nenhuma informação do Song se perde. É essa propriedade que a
 * edição vai depender.
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
