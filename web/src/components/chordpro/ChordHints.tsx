import { useId, useState } from 'react';

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

/** Dito ao lado dos botões e apontado por `aria-describedby`: um botão apagado que
 *  não explica por que não serve troca um mistério por outro. */
const SEM_ONDE_INSERIR = 'Abra uma linha para editar antes de inserir um símbolo.';

export function ChordHints({
  onInsert,
  podeInserir,
}: {
  onInsert: (simbolo: string) => void;
  /** Só existe onde inserir o símbolo com uma linha aberta. Sem isso os botões
   *  pareciam habilitados, o clique caía no `if (!editing) return;` do editor e nada
   *  acontecia — sem mensagem e sem estado visual. */
  podeInserir: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  // O id do motivo tem de ser único na página, e o painel pode ser montado mais de
  // uma vez (o editor e, um dia, uma segunda cifra lado a lado).
  const motivoId = useId();

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
            <button
              type="button"
              disabled={!podeInserir}
              title={podeInserir ? undefined : SEM_ONDE_INSERIR}
              aria-describedby={podeInserir ? undefined : motivoId}
              onClick={() => onInsert('ø')}
            >
              Inserir ø
            </button>
            <button
              type="button"
              disabled={!podeInserir}
              title={podeInserir ? undefined : SEM_ONDE_INSERIR}
              aria-describedby={podeInserir ? undefined : motivoId}
              onClick={() => onInsert('°')}
            >
              Inserir °
            </button>
            {/* O motivo fica na tela, e não só no `title`: dica de mouse não chega a
                quem navega por teclado nem a quem usa toque. */}
            {podeInserir ? null : (
              <span className="cp-hints-motivo" id={motivoId}>
                {SEM_ONDE_INSERIR}
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
