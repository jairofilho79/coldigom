import { useMemo, useState } from 'react';
import { buscar, type GestureEntry, type Indice } from '../../lib/gestures/dictionary';
import { GestureThumb } from './GestureThumb';
import { NovoGestoForm } from './NovoGestoForm';

type Props = {
  indice: Indice | null;
  aberto: boolean;
  onEscolher: (id: string) => void;
  onFechar: () => void;
  /** Com ouvinte, o seletor oferece "Novo gesto"; o criado é escolhido na hora. */
  onCriado?: (entrada: GestureEntry) => void;
};

/** Busca no dicionário. Enter escolhe o primeiro; Escape fecha. */
export function GesturePicker({ indice, aberto, onEscolher, onFechar, onCriado }: Props) {
  const [termo, setTermo] = useState('');
  const [criando, setCriando] = useState(false);
  // Zera a busca ao (re)abrir sem efeito colateral: ajusta o estado durante a
  // renderização, como o React recomenda em vez de um useEffect com setState.
  const [abertoAnterior, setAbertoAnterior] = useState(aberto);
  if (aberto !== abertoAnterior) {
    setAbertoAnterior(aberto);
    if (aberto) {
      setTermo('');
      setCriando(false);
    }
  }
  const resultados = useMemo(() => (indice ? buscar(indice, termo, 30) : []), [indice, termo]);

  if (!aberto) return null;

  if (criando && onCriado) {
    return (
      <div className="ge-picker" role="dialog" aria-label="Novo gesto" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setCriando(false); } }}>
        <div className="ge-picker-topo"><strong>Novo gesto</strong></div>
        <div className="ge-picker-form">
          <NovoGestoForm
            nomeInicial={termo.trim()}
            onCancelar={() => setCriando(false)}
            onCriado={(entrada) => { onCriado(entrada); onEscolher(entrada.id); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="ge-picker"
      role="dialog"
      aria-label="Escolher gesto"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onFechar();
        }
      }}
    >
      <div className="ge-picker-topo">
        <input
          type="search"
          className="ge-picker-busca"
          placeholder="Buscar por nome ou gatilho"
          value={termo}
          autoFocus
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && resultados[0]) {
              e.preventDefault();
              onEscolher(resultados[0].id);
            }
          }}
        />
        {onCriado && indice ? (
          <button type="button" className="ge-btn" onClick={() => setCriando(true)}>
            Novo gesto
          </button>
        ) : null}
        <button type="button" className="ge-btn" onClick={onFechar}>
          Fechar
        </button>
      </div>
      {!indice ? (
        <p className="ge-picker-aviso">O dicionário não carregou. Tente recarregar a página.</p>
      ) : resultados.length === 0 ? (
        <p className="ge-picker-aviso">Nenhum gesto encontrado.</p>
      ) : (
        <ul className="ge-picker-lista">
          {resultados.map((g) => (
            <li key={g.id}>
              <button type="button" className="ge-picker-item" onClick={() => onEscolher(g.id)}>
                <GestureThumb id={g.id} indice={indice} tamanho={64} />
                <span className="ge-picker-nome">{g.name}</span>
                {g.exampleTriggers.length ? (
                  <span className="ge-picker-exemplos">{g.exampleTriggers.join(', ')}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
