import { useState } from 'react';
import { Link } from 'react-router-dom';

import { createMaterial } from '../../services/api';
import type { Material, MaterialKind, PraiseDetail } from '../../types';

type Props = {
  praiseId: string;
  materiais: Material[];
  categorias: MaterialKind[];
  podeEditar: boolean;
  onAtualizar: (p: PraiseDetail) => void;
};

/**
 * A seção "Gestos CIAs" da tela do louvor. Componente próprio porque a
 * PraiseDetailPage já passa de 2.300 linhas; a página só importa e posiciona.
 */
export function SecaoGestos({ praiseId, materiais, categorias, podeEditar, onAtualizar }: Props) {
  const gestos = materiais.filter((m) => m.type === 'gestures');
  const pdfs = materiais.filter((m) => m.type === 'pdf');
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [origem, setOrigem] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (gestos.length === 0 && !podeEditar) return null;
  const categoriaEscolhida = categoria || categorias[0]?.id || '';

  const criar = async () => {
    if (!categoriaEscolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await createMaterial(praiseId, {
        material_kind: categoriaEscolhida,
        type: 'gestures',
        ...(origem ? { source_material_id: origem } : {}),
      });
      onAtualizar(atualizado);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar o material');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="detail-section animate-fade-in-up">
      <h2 className="detail-section-title">
        <span className="detail-section-icon">🤲</span>
        Gestos CIAs
      </h2>
      {gestos.length > 0 ? (
        <div className="material-grid">
          {gestos.map((m) => (
            <div key={m.id} className="material-card-wrap">
              <Link to={`/praise/${praiseId}/gestos/${m.id}`} className={`material-link${m.has_content === false ? ' material-link--empty' : ''}`}>
                <span className="material-link-icon">🤲</span>
                <div>
                  <div className="material-link-text">{m.material_kind_name || 'Gestos'}</div>
                  <div className="material-link-meta">
                    {m.has_content === false ? 'Sem conteúdo' : 'Documento'}
                    {m.is_reviewed ? ' · ✓ revisado' : ''}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <p className="materials-placeholder">Nenhum documento de gestos ainda.</p>
      )}
      {podeEditar ? (
        aberto ? (
          <div className="edit-grid ge-novo">
            <div className="edit-field">
              <label htmlFor="ge-novo-categoria">Categoria</label>
              <select id="ge-novo-categoria" aria-label="Categoria" value={categoriaEscolhida} onChange={(e) => setCategoria(e.target.value)}>
                {categorias.map((k) => (
                  <option key={k.id} value={k.id}>{k.name}</option>
                ))}
              </select>
            </div>
            <div className="edit-field">
              <label htmlFor="ge-novo-origem">PDF de origem</label>
              <select id="ge-novo-origem" aria-label="PDF de origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
                <option value="">(nenhum)</option>
                {pdfs.map((p) => (
                  <option key={p.id} value={p.id}>{p.material_kind_name || p.id}</option>
                ))}
              </select>
            </div>
            <div className="edit-actions">
              <button type="button" className="auth-btn" disabled={salvando || !categoriaEscolhida} onClick={() => void criar()}>Criar</button>
              <button type="button" className="ge-btn" onClick={() => setAberto(false)}>Cancelar</button>
              {erro ? <span className="cp-review-error" role="status">{erro}</span> : null}
            </div>
          </div>
        ) : (
          <button type="button" className="ge-btn" onClick={() => setAberto(true)}>Novo documento de gestos</button>
        )
      ) : null}
    </section>
  );
}
