import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPraise, getAssetUrl } from '../services/api';
import type { PraiseDetail } from '../types';

export function PraiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPraise = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getPraise(id);
        setPraise(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praise');
      } finally {
        setLoading(false);
      }
    };

    fetchPraise();
  }, [id]);

  if (loading) {
    return (
      <div className="page-container detail-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando louvor...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container detail-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{error}</div>
        </div>
      </div>
    );
  }

  if (!praise) {
    return (
      <div className="page-container detail-page">
        <div className="no-results">
          <div className="no-results-icon">📖</div>
          <div className="no-results-title">Louvor não encontrado</div>
        </div>
      </div>
    );
  }

  const audioMaterials = praise.materials.filter(m => m.type === 'mp3');
  const pdfMaterials = praise.materials.filter(m => m.type === 'pdf');
  const chordMaterials = praise.materials.filter(m => m.type === 'chord');

  return (
    <div className="page-container detail-page">
      <Link to="/" className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Voltar para lista
      </Link>

      <header className="detail-header animate-fade-in-scale">
        {praise.number && (
          <div className="detail-number">Nº {praise.number}</div>
        )}
        <h1 className="detail-title">{praise.name}</h1>

        <div className="detail-meta-row">
          {praise.author && (
            <div className="detail-meta-item">
              <span className="label">Autor</span>
              <span className="value">{praise.author}</span>
            </div>
          )}
          {praise.rhythm && (
            <div className="detail-meta-item">
              <span className="label">Ritmo</span>
              <span className="value">{praise.rhythm}</span>
            </div>
          )}
          {praise.tonality && (
            <div className="detail-meta-item">
              <span className="label">Tom</span>
              <span className="value">{praise.tonality}</span>
            </div>
          )}
          {praise.category && (
            <div className="detail-meta-item">
              <span className="label">Categoria</span>
              <span className="value">{praise.category}</span>
            </div>
          )}
        </div>

        {praise.tags && praise.tags.length > 0 && (
          <div className="detail-tags">
            {praise.tags.map(tag => (
              <span key={tag.id} className="detail-tag">{tag.name}</span>
            ))}
          </div>
        )}
      </header>

      {praise.lyrics && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">📝</span>
            Letra
          </h2>
          <pre className="lyrics-content">{praise.lyrics}</pre>
        </section>
      )}

      {audioMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎵</span>
            Áudio
          </h2>
          <div className="audio-player-wrapper">
            <audio controls className="audio-player" key={audioMaterials[0].id}>
              <source src={getAssetUrl(audioMaterials[0].r2_key)} type="audio/mpeg" />
              Seu navegador não suporta o elemento de áudio.
            </audio>
          </div>
          {audioMaterials.length > 1 && (
            <details className="additional-audios">
              <summary>Mais {audioMaterials.length - 1} áudio(s)</summary>
              <ul className="audio-list">
                {audioMaterials.slice(1).map(m => (
                  <li key={m.id}>
                    <a href={getAssetUrl(m.r2_key)} target="_blank" rel="noopener noreferrer">
                      {m.material_kind_name || 'Áudio'}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {pdfMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">📄</span>
            Partituras
          </h2>
          <div className="material-grid">
            {pdfMaterials.map(m => (
              <a
                key={m.id}
                href={getAssetUrl(m.r2_key)}
                target="_blank"
                rel="noopener noreferrer"
                className="material-link"
              >
                <span className="material-link-icon">📄</span>
                <div>
                  <div className="material-link-text">{m.material_kind_name || 'Partitura'}</div>
                  <div className="material-link-meta">PDF</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {chordMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎸</span>
            Acordes
          </h2>
          <div className="material-grid">
            {chordMaterials.map(m => (
              <a
                key={m.id}
                href={getAssetUrl(m.r2_key)}
                target="_blank"
                rel="noopener noreferrer"
                className="material-link"
              >
                <span className="material-link-icon">🎸</span>
                <div>
                  <div className="material-link-text">{m.material_kind_name || 'Acordes'}</div>
                  <div className="material-link-meta">Arquivo de acordes</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
