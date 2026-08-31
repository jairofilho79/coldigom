import { parseCells } from './parse';
import type { Cell, HeaderEntry, Line, RawLine, Song } from './types';

const HEADER_ORDER = ['title', 'subtitle', 'key', 'rhythm', 'artist'] as const;

/** Colchete no texto tem de voltar escapado, senão o reparse o lê como acorde. */
function escapeText(text: string): string {
  return text.replace(/([[\]])/g, '\\$1');
}

function mesmasCelulas(a: Cell[], b: Cell[]): boolean {
  return (
    a.length === b.length &&
    a.every((c, i) => c.chord === b[i].chord && c.attached === b[i].attached && c.text === b[i].text)
  );
}

/**
 * Escapar TODO colchete do texto reescrevia letra legítima: `Ds [Usa-m` voltava
 * `Ds \[Usa-m` em 3491 arquivos do acervo. O parser lê colchete sem par e `[]` vazio
 * como texto (regra 7) e não registra que vieram sem escape — então quem decide é o
 * resultado: se a linha crua reparseia nas mesmas células, ela sai crua. O escape só
 * entra quando é obrigatório, e aí vale para a linha inteira, porque a decisão depende
 * do que vem depois (um `[` do texto pode abocanhar o `]` de um acorde seguinte).
 *
 * O texto da letra vem do PDF e não sofre correção automática — regra do dono do acervo.
 */
function serializeCells(cells: Cell[]): string {
  const chord = (c: Cell) => (c.chord === null ? '' : `[${c.chord}]`);
  const cru = cells.map((c) => chord(c) + c.text).join('');
  if (mesmasCelulas(parseCells(cru), cells)) return cru;
  return cells.map((c) => chord(c) + escapeText(c.text)).join('');
}

/** Uma linha isolada como texto — é o que torna a linha editável. */
export function serializeLine(line: Line): string {
  return line.kind === 'comment' ? `{comment: ${line.text}}` : serializeCells(line.cells);
}

/** A linha de uma diretiva de cabeçalho, quando não há linha crua para reaproveitar. */
function linhaDeCampo(key: (typeof HEADER_ORDER)[number], valor: string): string {
  return `{${key}: ${valor}}`;
}

/**
 * O topo, na ordem literal do arquivo. Uma entrada de campo devolve a linha crua
 * enquanto o valor não mudou — inclusive quando o valor é ausente (`{key: }` continua
 * `{key: }`, não some). Campo editado sai na forma canônica; campo apagado não sai.
 */
function serializeHeader(song: Song, headerLines: HeaderEntry[], out: string[]): void {
  // Rede de segurança: campo que ganhou valor sem ter linha própria (o arquivo não
  // trazia `{rhythm}` e o editor preencheu) sai no topo, na ordem canônica.
  const temEntrada = new Set(
    headerLines.flatMap((e) => (e.kind === 'field' ? [e.key as string] : []))
  );
  for (const key of HEADER_ORDER) {
    const valor = song.header[key];
    if (valor !== undefined && !temEntrada.has(key)) out.push(linhaDeCampo(key, valor));
  }

  for (const entrada of headerLines) {
    if (entrada.kind === 'raw') {
      out.push(entrada.text);
      continue;
    }
    const atual = song.header[entrada.key];
    if (atual === entrada.value) out.push(entrada.text);
    else if (atual !== undefined) out.push(linhaDeCampo(entrada.key, atual));
    // atual === undefined e a linha tinha valor: o campo foi apagado, a linha sai.
  }
}

/** As linhas cruas ancoradas exatamente nesta coordenada, na ordem em que foram lidas. */
function cruasEm(rawLines: RawLine[], stanza: number, line: number): RawLine[] {
  return rawLines.filter((r) => r.stanza === stanza && r.line === line);
}

/**
 * Song → ChordPro, byte a byte para tudo que veio do parser: `serialize(parse(x)) === x`.
 *
 * Um Song montado à mão (sem `headerLines`) sai na ordem canônica de sempre — cabeçalho,
 * notas, estrofes separadas por uma linha em branco.
 */
export function serialize(song: Song): string {
  const out: string[] = [];
  const { headerLines, rawLines } = song;

  if (headerLines === undefined) {
    for (const key of HEADER_ORDER) {
      const value = song.header[key];
      if (value !== undefined) out.push(linhaDeCampo(key, value));
    }
    for (const note of song.notes) out.push(`; ${note}`);
    if (out.length > 0) out.push('');
  } else {
    serializeHeader(song, headerLines, out);
  }

  const cruas = rawLines ?? [];

  song.stanzas.forEach((stanza, si) => {
    const antes = cruasEm(cruas, si, 0);
    // O separador de estrofe: sai quando não há uma linha em branco crua já guardada
    // aqui. É o que mantém separada a estrofe que a EDIÇÃO criou (split), que não tem
    // linha crua nenhuma — sem isto as duas voltariam coladas numa estrofe só.
    if (si > 0 && !antes.some((r) => r.text.trim() === '')) out.push('');
    stanza.lines.forEach((line, li) => {
      for (const crua of cruasEm(cruas, si, li)) out.push(crua.text);
      out.push(serializeLine(line));
    });
    for (const crua of cruasEm(cruas, si, stanza.lines.length)) out.push(crua.text);
  });

  // Cruas depois da última estrofe: nota ";" no fim do arquivo, linha em branco final.
  for (const crua of cruas.filter((r) => r.stanza >= song.stanzas.length)) out.push(crua.text);

  return out.join('\n') + '\n';
}
