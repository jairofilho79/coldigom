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
