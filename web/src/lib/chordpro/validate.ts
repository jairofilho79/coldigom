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
