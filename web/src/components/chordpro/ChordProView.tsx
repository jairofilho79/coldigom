import type { Cell, Song } from '../../lib/chordpro/types';

function cellClassName(cell: Cell): string {
  const classes = ['cp-cell'];
  // Célula sem acorde não tem rótulo para alinhar, então pode quebrar linha.
  if (cell.chord === null) classes.push('cp-cell--free');
  if (cell.attached) classes.push('cp-cell--bar');
  return classes.join(' ');
}

/**
 * Song → DOM. Puro: sem fetch, sem estado, sem rota.
 *
 * A linha quebra entre células, nunca dentro de uma — é isso que mantém o alinhamento
 * acorde↔sílaba em tela estreita, e é por isso que a célula com acorde usa
 * `white-space: pre` enquanto a célula sem acorde usa `pre-wrap`.
 */
export function ChordProView({ song }: { song: Song }) {
  return (
    <div className="cp-body">
      {song.stanzas.map((stanza, si) => (
        <div className="cp-stanza" key={si}>
          {stanza.lines.map((line, li) =>
            line.kind === 'comment' ? (
              <p className="cp-comment" key={li}>
                {line.text}
              </p>
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
