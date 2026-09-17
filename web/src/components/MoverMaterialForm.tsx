import { useEffect, useState } from 'react';
import type { PraiseDetail } from '../types';
import { getPraise } from '../services/api';

type Props = {
  /** Louvor onde o material está hoje; colar o próprio ID não vira busca. */
  praiseAtualId: string;
  onConfirm: (destino: PraiseDetail) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  /** Injetável para teste; em produção é o GET /api/praises/:id. */
  buscarLouvor?: (id: string) => Promise<PraiseDetail>;
};

/** Resposta da API para o ID `id`; `louvor: null` quando não existe. */
type Resultado = { id: string; louvor: PraiseDetail | null };

const DEBOUNCE_MS = 250;

/**
 * Colar um ID e confirmar às cegas era o que o "Agrupar louvor" fazia. Aqui o
 * destino é mostrado (número, nome, tags) antes de o botão liberar: mover um
 * material para o louvor errado não avisa ninguém depois.
 */
export function MoverMaterialForm({
  praiseAtualId,
  onConfirm,
  onCancel,
  busy,
  buscarLouvor = getPraise,
}: Props) {
  const [id, setId] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const alvo = id.trim();
  const precisaBuscar = alvo.length > 0 && alvo !== praiseAtualId;

  useEffect(() => {
    if (!precisaBuscar) return;
    let cancelado = false;
    const timer = window.setTimeout(() => {
      buscarLouvor(alvo)
        .then((louvor) => {
          if (!cancelado) setResultado({ id: alvo, louvor });
        })
        .catch(() => {
          if (!cancelado) setResultado({ id: alvo, louvor: null });
        });
    }, DEBOUNCE_MS);
    // Resposta de um ID que já foi trocado não pode sobrescrever a do atual.
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [alvo, precisaBuscar, buscarLouvor]);

  // O que mostrar é derivado do ID digitado e da última resposta: guardar
  // "buscando"/"vazio" em state exigia setState síncrono no effect.
  const preview:
    | { estado: 'vazio' | 'atual' | 'buscando' | 'nao_encontrado' }
    | { estado: 'encontrado'; louvor: PraiseDetail } = !alvo
    ? { estado: 'vazio' }
    : alvo === praiseAtualId
      ? { estado: 'atual' }
      : resultado?.id !== alvo
        ? { estado: 'buscando' }
        : resultado.louvor
          ? { estado: 'encontrado', louvor: resultado.louvor }
          : { estado: 'nao_encontrado' };

  const encontrado = preview.estado === 'encontrado' ? preview.louvor : null;

  return (
    <div className="mover-material-form">
      <input
        type="text"
        className="edit-input"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="ID do louvor de destino"
        aria-label="ID do louvor de destino"
        disabled={busy}
      />
      <div className="mover-material-preview" aria-live="polite">
        {preview.estado === 'atual' ? <span className="mover-material-aviso">É o louvor atual</span> : null}
        {preview.estado === 'buscando' ? <span className="mover-material-aviso">Buscando…</span> : null}
        {preview.estado === 'nao_encontrado' ? (
          <span className="mover-material-aviso">Louvor não encontrado</span>
        ) : null}
        {encontrado ? (
          <>
            <span className="mover-material-nome">
              {encontrado.number ? `${encontrado.number} — ${encontrado.name}` : encontrado.name}
            </span>
            {encontrado.tags.map((tag) => (
              <span key={tag.id} className="detail-tag">
                {tag.parent_name ? `${tag.parent_name} › ${tag.name}` : tag.name}
              </span>
            ))}
          </>
        ) : null}
      </div>
      <button
        type="button"
        className="auth-btn"
        disabled={!encontrado || busy}
        onClick={() => {
          if (encontrado) void onConfirm(encontrado);
        }}
      >
        {busy ? 'Movendo…' : 'Confirmar mover'}
      </button>
      <button type="button" className="auth-btn" disabled={busy} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
