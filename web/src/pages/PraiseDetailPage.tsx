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

  if (loading) return <div className="loading">Carregando...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!praise) return <div className="error">Louvor não encontrado</div>;

  const audioMaterials = praise.materials.filter(m => m.type === 'mp3');
  const pdfMaterials = praise.materials.filter(m => m.type === 'pdf');
  const chordMaterials = praise.materials.filter(m => m.type === 'chord');

  return (
    <div className="praise-detail-page">
      <Link to="/" className="back-link">← Voltar para lista</Link>
      
      <header className="praise-header">
        <h1>{praise.name}</h1>
        <div className="praise-meta">
          {praise.number && <span className="meta-item">Nº {praise.number}</span>}
          {praise.author && <span className="meta-item">Autor: {praise.author}</span>}
          {praise.rhythm && <span className="meta-item">Ritmo: {praise.rhythm}</span>}
          {praise.tonality && <span className="meta-item">Tom: {praise.tonality}</span>}
          {praise.category && <span className="meta-item">Categoria: {praise.category}</span>}
        </div>
        {praise.tags && praise.tags.length > 0 && (
          <div className="praise-tags">
            {praise.tags.map(tag => (
              <span key={tag.id} className="tag">{tag.name}</span>
            ))}
          </div>
        )}
      </header>

      {praise.lyrics && (
        <section className="lyrics-section">
          <h2>Letra</h2>
          <pre className="lyrics">{praise.lyrics}</pre>
        </section>
      )}

      {audioMaterials.length > 0 && (
        <section className="materials-section">
          <h2>Áudios</h2>
          <div className="audio-player-container">
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
        <section className="materials-section">
          <h2>Partituras (PDF)</h2>
          <div className="pdf-list">
            {pdfMaterials.map(m => (
              <a 
                key={m.id} 
                href={getAssetUrl(m.r2_key)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="pdf-link"
              >
                📄 {m.material_kind_name || 'Partitura'}
              </a>
            ))}
          </div>
        </section>
      )}

      {chordMaterials.length > 0 && (
        <section className="materials-section">
          <h2>Acordes</h2>
          <div className="pdf-list">
            {chordMaterials.map(m => (
              <a 
                key={m.id} 
                href={getAssetUrl(m.r2_key)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="pdf-link"
              >
                🎵 {m.material_kind_name || 'Acordes'}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
