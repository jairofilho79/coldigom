import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPraise, getAssetUrl, API_BASE_URL, updatePraise, getMaterialKinds, getTags, addPraiseTag, removePraiseTag, createMaterial, updateMaterial, deleteMaterial, bulkUploadMaterials } from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import type { PraiseDetail, Tag, MaterialKind } from '../types';

export function PraiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready: authReady, logout } = useAuth();
  const userName = authReady ? (user?.name || user?.email || null) : null;
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [newMat, setNewMat] = useState({ material_kind: '', type: 'youtube', url: '' });
  const [bulkFiles, setBulkFiles] = useState<Array<{ file: File; relPath: string; type: string; material_kind: string }>>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [tagsBusy, setTagsBusy] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    number: '',
    author: '',
    rhythm: '',
    tonality: '',
    category: '',
    lyrics: '',
  });

  useEffect(() => {
    const fetchPraise = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getPraise(id);
        if (!data) {
          setPraise(null);
          return;
        }
        setPraise(data);
        setEdit({
          name: data.name || '',
          number: data.number || '',
          author: data.author || '',
          rhythm: data.rhythm || '',
          tonality: data.tonality || '',
          category: data.category || '',
          lyrics: data.lyrics || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load praise');
      } finally {
        setLoading(false);
      }
    };

    fetchPraise();
  }, [id]);

  useEffect(() => {
    const fetchKinds = async () => {
      try {
        const kinds = await getMaterialKinds();
        setMaterialKinds(kinds);
        if (!newMat.material_kind && kinds.length > 0) {
          setNewMat(s => ({ ...s, material_kind: kinds[0].id }));
        }
      } catch {
        // ignore
      }
    };
    fetchKinds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userName) return;
    const fetchTagCatalog = async () => {
      try {
        const tags = await getTags();
        setCatalogTags(tags);
      } catch {
        // ignore
      }
    };
    void fetchTagCatalog();
  }, [userName]);

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

  const parseYouTubeId = (url: string): string | null => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '').toLowerCase();
      if (host === 'youtu.be') {
        const id = u.pathname.split('/').filter(Boolean)[0];
        return id || null;
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const v = u.searchParams.get('v');
        if (v) return v;
        const parts = u.pathname.split('/').filter(Boolean);
        const idxEmbed = parts.indexOf('embed');
        if (idxEmbed >= 0 && parts[idxEmbed + 1]) return parts[idxEmbed + 1];
        const idxShorts = parts.indexOf('shorts');
        if (idxShorts >= 0 && parts[idxShorts + 1]) return parts[idxShorts + 1];
      }
      return null;
    } catch {
      return null;
    }
  };

  const assignedTagIds = new Set((praise.tags || []).map(t => t.id));
  const availableTags = catalogTags.filter(t => !assignedTagIds.has(t.id));

  const youtubeMaterials = praise.materials.filter(m => m.type === 'youtube' && m.url);
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
        <div className="auth-row">
          {!authReady ? (
            <div className="auth-user muted">Verificando sessão…</div>
          ) : userName ? (
            <>
              {user?.picture ? (
                <img className="auth-avatar" src={user.picture} alt="" width={28} height={28} />
              ) : null}
              <div className="auth-user">Logado como <strong>{userName}</strong></div>
              <button
                type="button"
                className="auth-btn"
                onClick={() => setIsEditing(v => !v)}
              >
                {isEditing ? 'Fechar edição' : 'Editar'}
              </button>
              <button
                type="button"
                className="auth-btn"
                onClick={async () => {
                  await logout();
                  setIsEditing(false);
                }}
              >
                Sair
              </button>
            </>
          ) : (
            <a
              className="auth-btn"
              href={`${API_BASE_URL}/auth/login?redirect=${encodeURIComponent(window.location.href)}`}
            >
              Entrar com Google
            </a>
          )}
        </div>

        {isEditing ? (
          <div className="edit-grid">
            <div className="edit-field">
              <label>Nome</label>
              <input value={edit.name} onChange={(e) => setEdit(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Número</label>
              <input value={edit.number} onChange={(e) => setEdit(s => ({ ...s, number: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Autor</label>
              <input value={edit.author} onChange={(e) => setEdit(s => ({ ...s, author: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Ritmo</label>
              <input value={edit.rhythm} onChange={(e) => setEdit(s => ({ ...s, rhythm: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Tom</label>
              <input value={edit.tonality} onChange={(e) => setEdit(s => ({ ...s, tonality: e.target.value }))} />
            </div>
            <div className="edit-field">
              <label>Categoria</label>
              <input value={edit.category} onChange={(e) => setEdit(s => ({ ...s, category: e.target.value }))} />
            </div>

            <div className="edit-actions">
              <button
                type="button"
                className="auth-btn"
                disabled={saving}
                onClick={async () => {
                  if (!id) return;
                  setSaving(true);
                  setError(null);
                  try {
                    const updated = await updatePraise(id, {
                      name: edit.name,
                      number: edit.number,
                      author: edit.author,
                      rhythm: edit.rhythm,
                      tonality: edit.tonality,
                      category: edit.category,
                      lyrics: edit.lyrics,
                    });
                    setPraise(updated);
                    setIsEditing(false);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Falha ao salvar');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {praise.number && (
              <div className="detail-number">Nº {praise.number}</div>
            )}
            <h1 className="detail-title">{praise.name}</h1>
          </>
        )}

        {!isEditing && (
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
        )}

        {isEditing && userName ? (
          <div className="detail-tags detail-tags--edit">
            <span className="detail-tags-label">Tags</span>
            {(praise.tags || []).map(tag => (
              <span key={tag.id} className="detail-tag detail-tag--editable">
                {tag.name}
                <button
                  type="button"
                  className="detail-tag-remove"
                  aria-label={`Remover tag ${tag.name}`}
                  disabled={tagsBusy}
                  onClick={async () => {
                    if (!id) return;
                    setTagsBusy(true);
                    setError(null);
                    try {
                      const updated = await removePraiseTag(id, tag.id);
                      setPraise(updated);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha ao remover tag');
                    } finally {
                      setTagsBusy(false);
                    }
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            {availableTags.length > 0 ? (
              <div className="detail-tag-add">
                <select
                  value={tagToAdd}
                  onChange={(e) => setTagToAdd(e.target.value)}
                  disabled={tagsBusy}
                  aria-label="Adicionar tag"
                >
                  <option value="">Adicionar tag…</option>
                  {availableTags.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="auth-btn"
                  disabled={!tagToAdd || tagsBusy || !id}
                  onClick={async () => {
                    if (!id || !tagToAdd) return;
                    setTagsBusy(true);
                    setError(null);
                    try {
                      const updated = await addPraiseTag(id, tagToAdd);
                      setPraise(updated);
                      setTagToAdd('');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Falha ao adicionar tag');
                    } finally {
                      setTagsBusy(false);
                    }
                  }}
                >
                  Adicionar
                </button>
              </div>
            ) : (
              (praise.tags || []).length === 0 && catalogTags.length > 0
                ? <span className="detail-tags-hint muted">Todas as tags do catálogo já estão associadas.</span>
                : null
            )}
          </div>
        ) : (
          praise.tags && praise.tags.length > 0 && (
            <div className="detail-tags">
              {praise.tags.map(tag => (
                <span key={tag.id} className="detail-tag">{tag.name}</span>
              ))}
            </div>
          )
        )}
      </header>

      <section className="detail-section animate-fade-in-up">
        <h2 className="detail-section-title">
          <span className="detail-section-icon">📝</span>
          Letra
        </h2>
        {isEditing ? (
          <textarea
            className="lyrics-editor"
            value={edit.lyrics}
            onChange={(e) => setEdit(s => ({ ...s, lyrics: e.target.value }))}
            placeholder="Cole a letra aqui…"
            rows={10}
          />
        ) : (
          praise.lyrics
            ? <pre className="lyrics-content">{praise.lyrics}</pre>
            : <div className="lyrics-empty">Sem letra cadastrada.</div>
        )}
      </section>

      {youtubeMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">▶</span>
            YouTube
          </h2>
          <div className="yt-grid">
            {youtubeMaterials.map(m => {
              const id = m.url ? parseYouTubeId(m.url) : null;
              const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
              return (
                <a
                  key={m.id}
                  className="yt-card"
                  href={m.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="yt-thumb">
                    {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="yt-thumb-fallback">YouTube</div>}
                    <div className="yt-badge">YouTube</div>
                  </div>
                  <div className="yt-body">
                    <div className="yt-title">{praise.name}</div>
                    <div className="yt-meta">{m.material_kind_name || 'Vídeo'}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {userName && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🧩</span>
            Materiais (admin)
          </h2>

          <div className="materials-admin">
            <div className="materials-admin-bulk">
              <div className="materials-subtitle">Bulk add (pasta)</div>
              <input
                type="file"
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore - webkitdirectory is supported by Chromium browsers
                webkitdirectory=""
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const mapped = files.map((f) => {
                    const rel = (f as any).webkitRelativePath || f.name;
                    const ext = f.name.split('.').pop()?.toLowerCase() || '';
                    const inferred = ext === 'mp3' || ext === 'pdf' || ext === 'chord' ? ext : ext || 'bin';
                    return {
                      file: f,
                      relPath: rel,
                      type: inferred,
                      material_kind: newMat.material_kind || (materialKinds[0]?.id || ''),
                    };
                  });
                  setBulkFiles(mapped);
                }}
              />

              {bulkFiles.length > 0 && (
                <>
                  <div className="bulk-list">
                    {bulkFiles.slice(0, 25).map((it, idx) => (
                      <div key={`${it.relPath}-${idx}`} className="bulk-row">
                        <div className="bulk-main">
                          <div className="bulk-name">{it.relPath}</div>
                          <div className="bulk-meta">
                            <span className="pill">{it.type}</span>
                            <span className="bulk-size">{Math.round(it.file.size / 1024)} KB</span>
                          </div>
                        </div>
                        <select
                          value={it.material_kind}
                          onChange={(e) => {
                            const v = e.target.value;
                            setBulkFiles(list => list.map((x, i) => (i === idx ? { ...x, material_kind: v } : x)));
                          }}
                        >
                          {materialKinds.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {bulkFiles.length > 25 && (
                      <div className="lyrics-empty">… e mais {bulkFiles.length - 25} arquivo(s)</div>
                    )}
                  </div>

                  <div className="edit-actions">
                    <button
                      type="button"
                      className="auth-btn"
                      disabled={!id || bulkUploading || bulkFiles.some(f => !f.material_kind)}
                      onClick={async () => {
                        if (!id) return;
                        setBulkUploading(true);
                        setError(null);
                        try {
                          const updated = await bulkUploadMaterials(
                            id,
                            bulkFiles.map(f => ({
                              file: f.file,
                              material_kind: f.material_kind,
                              type: f.type,
                              file_path_legacy: f.relPath,
                            }))
                          );
                          setPraise(updated);
                          setBulkFiles([]);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Falha no bulk upload');
                        } finally {
                          setBulkUploading(false);
                        }
                      }}
                    >
                      {bulkUploading ? 'Enviando…' : `Enviar ${bulkFiles.length} arquivo(s)`}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="materials-admin-new">
              <div className="edit-grid">
                <div className="edit-field">
                  <label>Kind</label>
                  <select
                    value={newMat.material_kind}
                    onChange={(e) => setNewMat(s => ({ ...s, material_kind: e.target.value }))}
                  >
                    {materialKinds.map(k => (
                      <option key={k.id} value={k.id}>{k.name}</option>
                    ))}
                  </select>
                </div>
                <div className="edit-field">
                  <label>Type</label>
                  <select
                    value={newMat.type}
                    onChange={(e) => setNewMat(s => ({ ...s, type: e.target.value }))}
                  >
                    <option value="youtube">youtube</option>
                    <option value="pdf">pdf</option>
                    <option value="mp3">mp3</option>
                    <option value="chord">chord</option>
                  </select>
                </div>
                <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                  <label>URL (para materiais lógicos)</label>
                  <input
                    value={newMat.url}
                    onChange={(e) => setNewMat(s => ({ ...s, url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div className="edit-actions">
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={!id || !newMat.material_kind || saving}
                    onClick={async () => {
                      if (!id) return;
                      setSaving(true);
                      try {
                        const updated = await createMaterial(id, {
                          material_kind: newMat.material_kind,
                          type: newMat.type,
                          url: newMat.url,
                        });
                        setPraise(updated);
                        setNewMat(s => ({ ...s, url: '' }));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao criar material');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Adicionar material
                  </button>
                </div>
              </div>
            </div>

            <div className="materials-admin-list">
              {praise.materials.length === 0 ? (
                <div className="lyrics-empty">Nenhum material cadastrado.</div>
              ) : (
                <div className="materials-table">
                  {praise.materials.map(m => (
                    <div key={m.id} className="materials-row">
                      <div className="materials-cell materials-main">
                        <div className="materials-title">{m.material_kind_name || 'Material'}</div>
                        <div className="materials-meta">
                          <span className="pill">{m.type}</span>
                          {m.url ? <a href={m.url} target="_blank" rel="noreferrer">abrir link</a> : null}
                        </div>
                      </div>
                      <div className="materials-cell">
                        <select
                          value={m.material_kind}
                          onChange={async (e) => {
                            setSaving(true);
                            try {
                              const updated = await updateMaterial(m.id, { material_kind: e.target.value });
                              setPraise(updated);
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {materialKinds.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="materials-cell">
                        <button
                          type="button"
                          className="auth-btn"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const updated = await deleteMaterial(m.id);
                              setPraise(updated);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Falha ao remover material');
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {audioMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎵</span>
            Áudio
          </h2>
          <AudioPlayer materials={audioMaterials} getAssetUrl={getAssetUrl} />
        </section>
      )}

      {pdfMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">📄</span>
            Partituras
          </h2>
          <div className="pdf-viewer-list">
            {pdfMaterials.map(m => {
              const pdfUrl = m.r2_key ? getAssetUrl(m.r2_key) : null;
              const title = m.material_kind_name || 'Partitura';
              return (
                <div key={m.id} className="pdf-viewer-block">
                  <div className="pdf-viewer-header">
                    <span className="pdf-viewer-title">{title}</span>
                    {pdfUrl ? (
                      <a
                        href={pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pdf-viewer-open-link"
                      >
                        Abrir em nova aba
                      </a>
                    ) : null}
                  </div>
                  {pdfUrl ? (
                    <iframe
                      title={title}
                      src={pdfUrl}
                      className="pdf-viewer-frame"
                    />
                  ) : (
                    <p className="muted">PDF indisponível</p>
                  )}
                </div>
              );
            })}
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
                href={m.r2_key ? getAssetUrl(m.r2_key) : undefined}
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
