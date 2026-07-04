import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPraise, getAssetUrl, getPraiseDownloadZipUrl, API_BASE_URL, createPraise, updatePraise, getMaterialKinds, getTags, addPraiseTag, removePraiseTag, createMaterial, updateMaterial, deleteMaterial, bulkUploadMaterials } from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { MaterialInlineAdmin } from '../components/MaterialInlineAdmin';
import { StyledFileInput } from '../components/StyledFileInput';
import { Select } from '../components/Select';
import { SearchableSelect } from '../components/SearchableSelect';
import { groupMaterialsByType } from '../lib/materials';
import {
  inferMaterialKind,
  inferTypeFromExtension,
  UNKNOWN_MATERIAL_KIND_ID,
  type InferenceResult,
} from '../lib/materialKindInference';
import type { PraiseDetail, Tag, MaterialKind } from '../types';

const MATERIAL_TYPE_OPTIONS = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'pdf', label: 'PDF' },
  { value: 'mp3', label: 'MP3' },
  { value: 'chord', label: 'Cifra' },
] as const;

type MaterialFormType = 'youtube' | 'pdf' | 'mp3' | 'chord';

type NewMaterialForm = {
  material_kind: string;
  type: MaterialFormType;
  url: string;
  file: File | null;
};

const DEFAULT_NEW_MAT: NewMaterialForm = {
  material_kind: '',
  type: 'pdf',
  url: '',
  file: null,
};

function canSubmitNewMaterial(mat: NewMaterialForm): boolean {
  if (!mat.material_kind) return false;
  if (mat.type === 'youtube') return mat.url.trim().length > 0;
  if (mat.type === 'pdf' || mat.type === 'mp3') return mat.file !== null;
  return false;
}

type BulkFileItem = {
  file: File;
  relPath: string;
  type: string;
  material_kind: string;
  inference: InferenceResult;
};

function mapFolderToBulkFiles(files: File[], materialKinds: MaterialKind[]): BulkFileItem[] {
  const catalogIds = new Set(materialKinds.map((k) => k.id));
  if (!catalogIds.has(UNKNOWN_MATERIAL_KIND_ID)) {
    catalogIds.add(UNKNOWN_MATERIAL_KIND_ID);
  }
  return files.map((f) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const inference = inferMaterialKind({ fileName: f.name, relPath: rel, catalogIds });
    return {
      file: f,
      relPath: rel,
      type: inferTypeFromExtension(f.name),
      material_kind: inference.materialKindId,
      inference,
    };
  });
}

function InferenceBadge({ inference }: { inference: InferenceResult }) {
  if (inference.method === 'unknown') {
    return (
      <span className="bulk-inference bulk-inference-unknown" title="Categoria não identificada pelo nome">
        Desconhecido
      </span>
    );
  }
  const level = inference.confidence >= 0.9 ? 'high' : 'medium';
  const pct = Math.round(inference.confidence * 100);
  const title = `${pct}% (${inference.method})${inference.matchedOn ? ` — ${inference.matchedOn}` : ''}`;
  return (
    <span className={`bulk-inference bulk-inference-${level}`} title={title}>
      Auto {pct}%
    </span>
  );
}

export function PraiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isCreate = id === 'new';
  const { user, ready: authReady, logout } = useAuth();
  const userName = authReady ? (user?.name || user?.email || null) : null;
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(isCreate);
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [savingLyrics, setSavingLyrics] = useState(false);
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [newMat, setNewMat] = useState<NewMaterialForm>({ ...DEFAULT_NEW_MAT });
  const [bulkFiles, setBulkFiles] = useState<BulkFileItem[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);
  const [tagToAdd, setTagToAdd] = useState('');
  const [tagsBusy, setTagsBusy] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
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
      if (!id || id === 'new') return;
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

  const materialKindOptions = useMemo(
    () => materialKinds.map((k) => ({ value: k.id, label: k.name })),
    [materialKinds]
  );
  const assignedTagIds = useMemo(
    () => (isCreate ? new Set(pendingTagIds) : new Set((praise?.tags || []).map((t) => t.id))),
    [isCreate, pendingTagIds, praise?.tags]
  );
  const displayTags = useMemo(() => {
    if (!isCreate) return praise?.tags || [];
    return catalogTags.filter((t) => pendingTagIds.includes(t.id));
  }, [isCreate, praise?.tags, catalogTags, pendingTagIds]);
  const availableTags = useMemo(
    () => catalogTags.filter((t) => !assignedTagIds.has(t.id)),
    [catalogTags, assignedTagIds]
  );
  const tagSelectOptions = useMemo(
    () => availableTags.map((t) => ({ value: t.id, label: t.name })),
    [availableTags]
  );
  const materialGroups = useMemo(
    () => groupMaterialsByType(praise?.materials ?? []),
    [praise?.materials]
  );
  const youtubeMaterials = useMemo(
    () => (materialGroups.find((g) => g.type === 'youtube')?.items ?? []).filter((m) => m.url),
    [materialGroups]
  );
  const audioMaterials = materialGroups.find((g) => g.type === 'mp3')?.items ?? [];
  const pdfMaterials = materialGroups.find((g) => g.type === 'pdf')?.items ?? [];
  const chordMaterials = materialGroups.find((g) => g.type === 'chord')?.items ?? [];
  const canEditMaterialsInline = Boolean(userName && !isCreate);

  const handleMaterialKindChange = async (materialId: string, material_kind: string) => {
    setSavingMaterials(true);
    setError(null);
    try {
      const updated = await updateMaterial(materialId, { material_kind });
      setPraise(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar material');
    } finally {
      setSavingMaterials(false);
    }
  };

  const handleMaterialDelete = async (materialId: string) => {
    setSavingMaterials(true);
    setError(null);
    try {
      const updated = await deleteMaterial(materialId);
      setPraise(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover material');
    } finally {
      setSavingMaterials(false);
    }
  };

  const materialAdminProps = canEditMaterialsInline
    ? {
        materialKindOptions,
        saving: savingMaterials,
        onUpdateKind: handleMaterialKindChange,
        onDelete: handleMaterialDelete,
      }
    : undefined;

  if (!isCreate && loading) {
    return (
      <div className="page-container detail-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando louvor...</div>
        </div>
      </div>
    );
  }

  if (!isCreate && error && !praise) {
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

  if (!isCreate && !praise) {
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

  const saveMetadata = async () => {
    setSavingMetadata(true);
    setError(null);
    try {
      if (isCreate) {
        if (!edit.name.trim()) {
          setError('Nome é obrigatório');
          return;
        }
        let created = await createPraise({
          name: edit.name.trim(),
          number: edit.number || null,
          author: edit.author || null,
          rhythm: edit.rhythm || null,
          tonality: edit.tonality || null,
          category: edit.category || null,
          lyrics: edit.lyrics || null,
          tag_ids: pendingTagIds,
        });
        if (bulkFiles.length > 0) {
          created = await bulkUploadMaterials(
            created.id,
            bulkFiles.map((f) => ({
              file: f.file,
              material_kind: f.material_kind,
              type: f.type,
              file_path_legacy: f.relPath,
            }))
          );
        }
        navigate(`/praise/${created.id}`, { replace: true });
        setPraise(created);
        setIsEditing(false);
        setBulkFiles([]);
        setPendingTagIds([]);
      } else if (id) {
        const updated = await updatePraise(id, {
          name: edit.name,
          number: edit.number,
          author: edit.author,
          rhythm: edit.rhythm,
          tonality: edit.tonality,
          category: edit.category,
        });
        setPraise(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar metadados');
    } finally {
      setSavingMetadata(false);
    }
  };

  const saveLyrics = async () => {
    if (!id || isCreate) return;
    setSavingLyrics(true);
    setError(null);
    try {
      const updated = await updatePraise(id, { lyrics: edit.lyrics });
      setPraise(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar letra');
    } finally {
      setSavingLyrics(false);
    }
  };

  return (
    <div className="page-container detail-page">
      <Link to="/" className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Voltar para lista
      </Link>

      {error ? (
        <div className="error-state" style={{ marginBottom: '1rem' }}>
          <div className="error-state-desc">{error}</div>
        </div>
      ) : null}

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
              {isCreate ? (
                <Link to="/" className="auth-btn">
                  Cancelar
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    className="auth-btn"
                    onClick={() => setIsEditing(v => !v)}
                  >
                    {isEditing ? 'Fechar edição' : 'Editar'}
                  </button>
                  <a
                    className="auth-btn"
                    href={getPraiseDownloadZipUrl(id!)}
                    download
                  >
                    Baixar em ZIP
                  </a>
                  <Link to={`/praise/${id}/merge`} className="auth-btn">
                    Mesclar
                  </Link>
                </>
              )}
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
            <>
              {!isCreate && id ? (
                <a
                  className="auth-btn"
                  href={getPraiseDownloadZipUrl(id)}
                  download
                >
                  Baixar em ZIP
                </a>
              ) : null}
              <a
                className="auth-btn"
                href={`${API_BASE_URL}/auth/login?redirect=${encodeURIComponent(window.location.href)}`}
              >
                Entrar com Google
              </a>
            </>
          )}
        </div>

        {isCreate && !userName && authReady ? (
          <p className="muted">Entre com o Google para cadastrar um novo louvor.</p>
        ) : null}

        {isCreate && userName ? (
          <h1 className="detail-title">Novo louvor</h1>
        ) : null}

        {isEditing && (userName || !isCreate) ? (
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
                disabled={savingMetadata || (isCreate && !userName)}
                onClick={() => void saveMetadata()}
              >
                {savingMetadata ? 'Salvando…' : isCreate ? 'Criar louvor' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : praise ? (
          <>
            {praise.number && (
              <div className="detail-number">Nº {praise.number}</div>
            )}
            <h1 className="detail-title">{praise.name}</h1>
          </>
        ) : null}

        {!isEditing && praise && (
          <div className="detail-meta-row">
            <div className="detail-meta-item detail-meta-item--id">
              <span className="label">ID</span>
              <span className="value detail-id-value">{praise.id}</span>
              <button
                type="button"
                className="detail-copy-id-btn"
                aria-label="Copiar ID"
                onClick={() => void (async () => {
                  try {
                    await navigator.clipboard.writeText(praise.id);
                    setIdCopied(true);
                    window.setTimeout(() => setIdCopied(false), 2000);
                  } catch {
                    setError('Não foi possível copiar o ID');
                  }
                })()}
              >
                {idCopied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
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
            {displayTags.map(tag => (
              <span key={tag.id} className="detail-tag detail-tag--editable">
                {tag.name}
                <button
                  type="button"
                  className="detail-tag-remove"
                  aria-label={`Remover tag ${tag.name}`}
                  disabled={tagsBusy}
                  onClick={async () => {
                    if (isCreate) {
                      setPendingTagIds((ids) => ids.filter((tid) => tid !== tag.id));
                      return;
                    }
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
                <Select
                  value={tagToAdd}
                  onChange={setTagToAdd}
                  options={tagSelectOptions}
                  placeholder="Adicionar tag…"
                  disabled={tagsBusy}
                  aria-label="Adicionar tag"
                />
                <button
                  type="button"
                  className="auth-btn"
                  disabled={!tagToAdd || tagsBusy || (!isCreate && !id)}
                  onClick={async () => {
                    if (!tagToAdd) return;
                    if (isCreate) {
                      setPendingTagIds((ids) => (ids.includes(tagToAdd) ? ids : [...ids, tagToAdd]));
                      setTagToAdd('');
                      return;
                    }
                    if (!id) return;
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
              displayTags.length === 0 && catalogTags.length > 0
                ? <span className="detail-tags-hint muted">Todas as tags do catálogo já estão associadas.</span>
                : null
            )}
          </div>
        ) : (
          praise && praise.tags && praise.tags.length > 0 && (
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
          <>
            <textarea
              className="lyrics-editor"
              value={edit.lyrics}
              onChange={(e) => setEdit(s => ({ ...s, lyrics: e.target.value }))}
              placeholder="Cole a letra aqui…"
              rows={10}
            />
            {!isCreate && id ? (
              <div className="detail-section-actions">
                <button
                  type="button"
                  className="auth-btn"
                  disabled={savingLyrics}
                  onClick={() => void saveLyrics()}
                >
                  {savingLyrics ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : null}
          </>
        ) : praise?.lyrics ? (
            <pre className="lyrics-content">{praise.lyrics}</pre>
          ) : (
            <div className="lyrics-empty">Sem letra cadastrada.</div>
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
              const ytId = m.url ? parseYouTubeId(m.url) : null;
              const thumb = ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
              return (
                <div key={m.id} className="yt-card-wrap">
                  <a
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
                      <div className="yt-title">{praise?.name ?? ''}</div>
                      <div className="yt-meta">{m.material_kind_name || 'Vídeo'}</div>
                    </div>
                  </a>
                  {canEditMaterialsInline ? (
                    <div className="materials-placeholder materials-placeholder--inline">
                      Edição de categoria — em breve
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {userName && isCreate && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🧩</span>
            Materiais (após salvar)
          </h2>
          <p className="materials-panel-help">
            Salve o louvor para adicionar materiais individuais. Você pode já selecionar uma pasta abaixo;
            os arquivos serão enviados ao clicar em &quot;Criar louvor&quot;.
          </p>
          <div className="materials-panel materials-admin-bulk">
            <h3 className="materials-panel-title">Importação em lote (pasta)</h3>
            <StyledFileInput
              label="Escolher pasta"
              directory
              onChange={(files) => {
                setBulkFiles(mapFolderToBulkFiles(files, materialKinds));
              }}
            />
            {bulkFiles.length > 0 && (
              <div className="lyrics-empty">
                {bulkFiles.length} arquivo(s) na fila — serão enviados ao criar o louvor.
                {bulkFiles.some((f) => f.inference.method === 'unknown') && (
                  <> Revise categorias marcadas como Desconhecido após salvar.</>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {userName && !isCreate && praise && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🧩</span>
            Materiais (admin)
          </h2>

          <div className="materials-admin">
            <div className="materials-panel materials-admin-new">
              <h3 className="materials-panel-title">Adicionar material</h3>
              <div className="edit-grid">
                <div className="edit-field">
                  <SearchableSelect
                    id="new-mat-kind"
                    label="Categoria"
                    value={newMat.material_kind}
                    onChange={(material_kind) => setNewMat((s) => ({ ...s, material_kind }))}
                    options={materialKindOptions}
                  />
                </div>
                <div className="edit-field">
                  <Select
                    id="new-mat-type"
                    label="Tipo do material"
                    value={newMat.type}
                    onChange={(type) => {
                      setNewMat((s) => ({
                        ...s,
                        type: type as MaterialFormType,
                        url: '',
                        file: null,
                      }));
                    }}
                    options={[...MATERIAL_TYPE_OPTIONS]}
                  />
                </div>

                {newMat.type === 'youtube' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="new-mat-youtube-url">Link do YouTube</label>
                    <input
                      id="new-mat-youtube-url"
                      value={newMat.url}
                      onChange={(e) => setNewMat(s => ({ ...s, url: e.target.value }))}
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                )}

                {newMat.type === 'pdf' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Arquivo PDF</label>
                    <StyledFileInput
                      label="Escolher PDF"
                      accept=".pdf,application/pdf"
                      selectedName={newMat.file?.name ?? null}
                      onChange={(files) => {
                        setNewMat(s => ({ ...s, file: files[0] ?? null }));
                      }}
                    />
                  </div>
                )}

                {newMat.type === 'mp3' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Arquivo de áudio</label>
                    <StyledFileInput
                      label="Escolher MP3"
                      accept="audio/mpeg,.mp3,audio/*"
                      selectedName={newMat.file?.name ?? null}
                      onChange={(files) => {
                        setNewMat(s => ({ ...s, file: files[0] ?? null }));
                      }}
                    />
                  </div>
                )}

                {newMat.type === 'chord' && (
                  <div className="edit-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Cifra</label>
                    <div className="materials-placeholder">
                      Editor de cifras — em breve
                    </div>
                  </div>
                )}

                <div className="edit-actions">
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={!id || savingMaterials || !canSubmitNewMaterial(newMat)}
                    onClick={async () => {
                      if (!id || !canSubmitNewMaterial(newMat)) return;
                      setSavingMaterials(true);
                      setError(null);
                      try {
                        let updated: PraiseDetail;
                        if (newMat.type === 'youtube') {
                          updated = await createMaterial(id, {
                            material_kind: newMat.material_kind,
                            type: 'youtube',
                            url: newMat.url.trim(),
                          });
                        } else if (newMat.type === 'pdf' || newMat.type === 'mp3') {
                          updated = await bulkUploadMaterials(id, [{
                            file: newMat.file!,
                            material_kind: newMat.material_kind,
                            type: newMat.type,
                          }]);
                        } else {
                          return;
                        }
                        setPraise(updated);
                        setNewMat({ ...DEFAULT_NEW_MAT, material_kind: newMat.material_kind });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao criar material');
                      } finally {
                        setSavingMaterials(false);
                      }
                    }}
                  >
                    Adicionar material
                  </button>
                </div>
              </div>
            </div>

            <div className="materials-panel materials-admin-bulk">
              <h3 className="materials-panel-title">Importação em lote (pasta)</h3>
              <p className="materials-panel-help">
                Envie vários arquivos de uma vez selecionando uma pasta no computador.
                A categoria de cada arquivo é inferida pelo nome; revise itens marcados como Desconhecido antes de enviar.
              </p>
              <StyledFileInput
                label="Escolher pasta"
                directory
                onChange={(files) => {
                  setBulkFiles(mapFolderToBulkFiles(files, materialKinds));
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
                            <InferenceBadge inference={it.inference} />
                            <span className="bulk-size">{Math.round(it.file.size / 1024)} KB</span>
                          </div>
                        </div>
                        <SearchableSelect
                          compact
                          value={it.material_kind}
                          onChange={(v) => {
                            setBulkFiles((list) =>
                              list.map((x, i) => (i === idx ? { ...x, material_kind: v } : x))
                            );
                          }}
                          options={materialKindOptions}
                          aria-label="Categoria do material"
                        />
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
                          setError(err instanceof Error ? err.message : 'Falha na importação em lote');
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
          </div>
        </section>
      )}

      {audioMaterials.length > 0 && (
        <section className="detail-section animate-fade-in-up">
          <h2 className="detail-section-title">
            <span className="detail-section-icon">🎵</span>
            Áudio
          </h2>
          <AudioPlayer
            materials={audioMaterials}
            getAssetUrl={getAssetUrl}
            admin={materialAdminProps}
          />
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
                    {canEditMaterialsInline ? (
                      <MaterialInlineAdmin
                        material={m}
                        options={materialKindOptions}
                        saving={savingMaterials}
                        onUpdateKind={handleMaterialKindChange}
                        onDelete={handleMaterialDelete}
                      />
                    ) : (
                      <span className="pdf-viewer-title">{title}</span>
                    )}
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
              <div key={m.id} className="material-card-wrap">
                <a
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
                {canEditMaterialsInline ? (
                  <div className="materials-placeholder materials-placeholder--inline">
                    Edição de categoria — em breve
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
