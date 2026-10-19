import type { GestureDocument, Item } from '../../lib/gestures/schema';
import type { EspecDeBloco } from '../../lib/gestures/edit';
import { podeDesagrupar, podeEnvolver } from '../../lib/gestures/edit';
import type { Caminho } from '../../lib/gestures/flatten';

export type GesturesToolbarProps = {
  doc: GestureDocument | null;
  foco: Caminho | null;
  selecionados: Caminho[];
  vezes: number;
  onMudarVezes: (vezes: number) => void;
  onAdicionarGesto: () => void;
  onInserir: (item: Item) => void;
  onEnvolver: (espec: EspecDeBloco) => void;
  onDesagrupar: () => void;
  onMover: (direcao: -1 | 1) => void;
  onRemover: () => void;
  desabilitado?: boolean;
};

export function GesturesToolbar({
  doc,
  foco,
  selecionados,
  vezes,
  onMudarVezes,
  onAdicionarGesto,
  onInserir,
  onEnvolver,
  onDesagrupar,
  onMover,
  onRemover,
  desabilitado = false,
}: GesturesToolbarProps) {
  const motivoEnvolver = (espec: EspecDeBloco) => {
    if (desabilitado || !doc) return 'Corrija os erros no documento para usar esta ação.';
    return selecionados.length ? podeEnvolver(doc, selecionados, espec) : 'Selecione um cartão.';
  };

  const motivoDesagrupar = () => {
    if (desabilitado || !doc) return 'Corrija os erros no documento para usar esta ação.';
    return foco ? podeDesagrupar(doc, foco) : 'Selecione um bloco.';
  };

  const desagruparBloqueado = !!motivoDesagrupar();

  return (
    <div className="ge-barra" role="toolbar" aria-label="Ações do editor">
      <button
        type="button"
        className="ge-btn"
        disabled={desabilitado || !doc}
        onClick={onAdicionarGesto}
      >
        Adicionar gesto
      </button>
      <button
        type="button"
        className="ge-btn"
        disabled={desabilitado || !doc}
        onClick={() => onInserir({ type: 'instruction', kind: 'instruments' })}
      >
        Adicionar instrução
      </button>
      <button
        type="button"
        className="ge-btn"
        disabled={desabilitado || !doc}
        onClick={() => onInserir({ type: 'text', text: '' })}
      >
        Adicionar texto
      </button>
      <span className="ge-barra-sep" />
      <input
        type="number"
        min={2}
        aria-label="Vezes"
        className="ge-input ge-input--n"
        value={vezes}
        disabled={desabilitado || !doc}
        onChange={(e) => onMudarVezes(Math.max(2, Number(e.target.value) || 2))}
      />
      {(
        [
          [`Repetir ${vezes}x`, { type: 'repeat', count: vezes }],
          ['Coro', { type: 'coro' }],
          ['Link', { type: 'link' }],
          ['Final', { type: 'final' }],
        ] as [string, EspecDeBloco][]
      ).map(([rotulo, espec]) => {
        const motivo = motivoEnvolver(espec);
        return (
          <button
            key={rotulo}
            type="button"
            className="ge-btn"
            disabled={!!motivo}
            title={motivo ?? undefined}
            onClick={() => onEnvolver(espec)}
          >
            {rotulo}
          </button>
        );
      })}
      <button
        type="button"
        className="ge-btn"
        disabled={desagruparBloqueado}
        title={desagruparBloqueado ? (motivoDesagrupar() ?? undefined) : undefined}
        onClick={onDesagrupar}
      >
        Desagrupar
      </button>
      <span className="ge-barra-sep" />
      <button
        type="button"
        className="ge-btn"
        disabled={desabilitado || !doc || !foco}
        onClick={() => onMover(-1)}
      >
        Mover para cima
      </button>
      <button
        type="button"
        className="ge-btn"
        disabled={desabilitado || !doc || !foco}
        onClick={() => onMover(1)}
      >
        Mover para baixo
      </button>
      <button
        type="button"
        className="ge-btn ge-btn--perigo"
        disabled={desabilitado || !doc || !foco}
        onClick={onRemover}
      >
        Remover
      </button>
    </div>
  );
}
