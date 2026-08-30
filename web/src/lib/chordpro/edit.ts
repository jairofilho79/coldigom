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
