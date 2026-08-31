import { parse } from './parse';
import { serializeLine } from './serialize';
import type { Line, LineRef, RawLine, Song, SongHeader, Stanza } from './types';

/** Todas as operações são puras: recebem Song, devolvem Song novo, nunca mutam. */

/**
 * Uma linha crua (nota ";", diretiva desconhecida, linha em branco a mais) guardada
 * junto da linha estrutural que ela precede — pela **identidade** do objeto, não pelo
 * índice.
 *
 * O índice é o que muda a cada edição: inserir uma linha antes de uma nota empurrava
 * a nota para depois da linha nova, e remover a linha anterior mandava a nota para o
 * fim da cifra. A nota marca QUAL trecho está em dúvida — solta, ela mente. Como as
 * operações abaixo só movem os objetos `Line` de lugar, a identidade sobrevive a
 * todas elas, inclusive às que ainda não existem.
 */
type Ancora = { antes: Line | null; stanza: number; line: number; text: string };

function ancorar(song: Song): Ancora[] {
  return (song.rawLines ?? []).map((r) => ({
    antes: song.stanzas[r.stanza]?.lines[r.line] ?? null,
    stanza: r.stanza,
    line: r.line,
    text: r.text,
  }));
}

function reancorar(stanzas: Stanza[], ancoras: Ancora[]): RawLine[] {
  const posDe = new Map<Line, { stanza: number; line: number }>();
  stanzas.forEach((s, si) => s.lines.forEach((l, li) => posDe.set(l, { stanza: si, line: li })));

  return ancoras.map((a) => {
    const pos = a.antes ? posDe.get(a.antes) : undefined;
    if (pos) return { stanza: pos.stanza, line: pos.line, text: a.text };
    // Sem âncora: ou a linha que ela precedia foi removida/substituída, ou a âncora
    // já era o fim da estrofe. Fica onde estava, presa ao limite do que existe agora.
    const si = Math.min(a.stanza, stanzas.length);
    const li = Math.min(a.line, stanzas[si]?.lines.length ?? 0);
    return { stanza: si, line: li, text: a.text };
  });
}

function mapStanzas(song: Song, fn: (stanzas: Stanza[]) => Stanza[]): Song {
  const ancoras = ancorar(song);
  const stanzas = fn(song.stanzas.map((s) => ({ lines: [...s.lines] }))).filter(
    (s) => s.lines.length > 0
  );
  return {
    ...song,
    stanzas,
    // Song montado à mão (no editor, num teste) não tem linhas cruas; não inventa.
    ...(song.rawLines ? { rawLines: reancorar(stanzas, ancoras) } : {}),
  };
}

/** Texto editável de uma linha — o par de replaceLine. */
export function lineToText(song: Song, at: LineRef): string {
  const line = song.stanzas[at.stanza]?.lines[at.line];
  return line ? serializeLine(line) : '';
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
