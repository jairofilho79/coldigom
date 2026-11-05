import React from 'react';
import type { PraiseBiblicalInsight } from '../types';

interface PraiseBiblicalSectionProps {
  biblical?: PraiseBiblicalInsight | null;
}

export const PraiseBiblicalSection: React.FC<PraiseBiblicalSectionProps> = ({ biblical }) => {
  if (!biblical) return null;

  const hasCitations = (biblical.citacoes_diretas && biblical.citacoes_diretas.length > 0) || Boolean(biblical.referencia_principal);
  const hasCentralMessage = Boolean(biblical.mensagem_central);
  const hasThemes = Boolean(biblical.temas_homileticos && biblical.temas_homileticos.length > 0);
  const hasPericopes = Boolean(biblical.pericopes_relacionadas && biblical.pericopes_relacionadas.length > 0);

  if (!hasCitations && !hasCentralMessage && !hasThemes && !hasPericopes) {
    return null;
  }

  return (
    <section
      id="secao-biblica"
      className="detail-section detail-section--biblical animate-fade-in-up"
      aria-label="Fundamento Bíblico e Homilética"
    >
      <h2 className="detail-section-title">
        <span className="detail-section-icon" aria-hidden="true">📖</span>
        Fundamento Bíblico & Homilética
      </h2>

      {biblical.tem_citacao_direta && biblical.referencia_principal && (
        <div className="biblical-direct-badge" data-testid="biblical-direct-badge">
          <span className="biblical-badge-icon" aria-hidden="true">⚡</span>
          <span className="biblical-badge-text">
            Citação Bíblica Direta: <strong>{biblical.referencia_principal}</strong>
          </span>
        </div>
      )}

      {biblical.citacoes_diretas && biblical.citacoes_diretas.length > 0 && (
        <div className="biblical-citations-group" data-testid="biblical-citations-group">
          <span className="biblical-meta-label">Passagens Citadas:</span>
          <div className="biblical-chips-wrap">
            {biblical.citacoes_diretas.map((cit, idx) => (
              <span key={`${cit.referencia}-${idx}`} className="biblical-chip biblical-chip--citation">
                <span aria-hidden="true">📖</span> {cit.referencia}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasCentralMessage && (
        <div className="biblical-card biblical-card--message" data-testid="biblical-central-message">
          <div className="biblical-card-header">
            <span className="biblical-card-icon" aria-hidden="true">🕊️</span>
            <h3 className="biblical-card-title">Mensagem Central & Aplicação Teológica</h3>
          </div>
          <p className="biblical-card-body">{biblical.mensagem_central}</p>
        </div>
      )}

      {hasThemes && (
        <div className="biblical-themes-group" data-testid="biblical-themes-group">
          <span className="biblical-meta-label">Temas Homiléticos:</span>
          <div className="biblical-chips-wrap">
            {biblical.temas_homileticos!.map((tema, idx) => (
              <span key={`${tema}-${idx}`} className="biblical-chip biblical-chip--theme">
                #{tema}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasPericopes && (
        <div className="biblical-pericopes-section" data-testid="biblical-pericopes-section">
          <div className="biblical-pericopes-header">
            <h3 className="biblical-pericopes-title">Passagens Bíblicas Relacionadas (Perícopes)</h3>
            <span className="biblical-pericopes-count">
              {biblical.pericopes_relacionadas!.length} {biblical.pericopes_relacionadas!.length === 1 ? 'passagem' : 'passagens'}
            </span>
          </div>

          <div className="biblical-pericopes-grid">
            {biblical.pericopes_relacionadas!.map((per, idx) => (
              <div key={`${per.referencia}-${idx}`} className="biblical-pericope-card">
                <div className="biblical-pericope-top">
                  <span className="biblical-pericope-ref">
                    <span aria-hidden="true">📖</span> {per.referencia}
                  </span>
                  {per.similarity != null && (
                    <span
                      className="biblical-pericope-affinity"
                      title={`Afinidade: ${Math.round(per.similarity)}%`}
                    >
                      {Math.round(per.similarity)}% afinidade
                    </span>
                  )}
                </div>
                <div className="biblical-pericope-title">{per.titulo}</div>
                {per.match_tipo && (
                  <div className="biblical-pericope-bottom">
                    <span className={`biblical-match-badge biblical-match-badge--${per.match_tipo}`}>
                      {per.match_tipo === 'citacao_direta'
                        ? 'Citação direta'
                        : per.match_tipo === 'homiletico'
                        ? 'Homilético'
                        : per.match_tipo === 'tematico'
                        ? 'Temático'
                        : per.match_tipo === 'ambos'
                        ? 'Citação & Teológico'
                        : per.match_tipo}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
