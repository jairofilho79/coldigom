import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import type { Material } from '../types';

/** Marca de revisão humana. Fica no cabeçalho porque é uma decisão sobre a
 *  cifra que se está lendo — não um detalhe de registro no rodapé.
 *  Sem sessão, vira só um selo: a informação interessa a quem lê, a ação não. */
export function ReviewSwitch({
  material,
  onToggle,
}: {
  material: Material;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const { isAuthenticated } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checked = Boolean(material.is_reviewed);

  if (!isAuthenticated) {
    return (
      <span className={`cp-review-badge${checked ? ' is-on' : ''}`}>
        {checked ? '✓ revisada' : 'não revisada'}
      </span>
    );
  }

  const quem = material.reviewed_by ? ` por ${material.reviewed_by}` : '';
  const quando = material.reviewed_at
    ? new Date(material.reviewed_at).toLocaleDateString('pt-BR')
    : '';

  return (
    <div className="cp-review">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        // Sem `aria-label`: o nome acessível sai do texto visível dentro do botão.
        // Um rótulo fixo divergia do que a tela mostra quando ligado ("Revisada"),
        // e quem usa Controle por Voz não conseguia acionar pelo que estava lendo.
        className={`cp-review-switch${checked ? ' is-on' : ''}`}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await onToggle(!checked);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao salvar');
          } finally {
            setSaving(false);
          }
        }}
      >
        <span className="cp-review-track" aria-hidden="true">
          <span className="cp-review-thumb" />
        </span>
        <span className="cp-review-text">
          {checked ? 'Revisada' : 'Marcar como revisada'}
        </span>
      </button>
      {checked && (quem || quando) ? (
        <span className="cp-review-meta">
          {[quando, quem.trim()].filter(Boolean).join(' · ')}
        </span>
      ) : null}
      {error ? (
        <span className="cp-review-error" role="status" aria-live="polite">
          {error}
        </span>
      ) : null}
    </div>
  );
}
