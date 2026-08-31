import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getPraise,
  getMaterialKinds,
  getTags,
  mergePraises,
  deleteMaterial,
  updateMaterial,
  type MergePraisesInput,
} from '../services/api';
import { SearchableSelect } from '../components/SearchableSelect';
import type { PraiseDetail, MaterialKind, Tag } from '../types';

type MetaField = 'name' | 'number' | 'author' | 'rhythm' | 'tonality' | 'category' | 'lyrics';

const META_FIELDS: { key: MetaField; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'number', label: 'Número' },
  { key: 'author', label: 'Autor' },
  { key: 'rhythm', label: 'Ritmo' },
  { key: 'tonality', label: 'Tom' },
  { key: 'category', label: 'Categoria' },
  { key: 'lyrics', label: 'Letra', multiline: true },
];

function normField(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function fieldsEqual(a: string, b: string): boolean {
  return normField(a) === normField(b);
}

type FieldChoice = 'keeper' | 'source';

/** «Pai · Filho» quando a tag é subtag, para a lista dizer de onde ela vem. */
function tagLabel(tag: Tag, catalog: Tag[]): string {
  if (tag.parent_name) return `${tag.parent_name} · ${tag.name}`;
  if (tag.parent_id) {
    const parent = catalog.find((t) => t.id === tag.parent_id);
    if (parent) return `${parent.name} · ${tag.name}`;
  }
  return tag.name;
}

export function PraiseMergeImportPage() {
  const { id: keeperId, sourceId } = useParams<{ id: string; sourceId: string }>();
  const navigate = useNavigate();
  const [keeper, setKeeper] = useState<PraiseDetail | null>(null);
  const [source, setSource] = useState<PraiseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [materialKinds, setMaterialKinds] = useState<MaterialKind[]>([]);
  const [fieldChoices, setFieldChoices] = useState<Partial<Record<MetaField, FieldChoice>>>({});
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [materialIdsToImport, setMaterialIdsToImport] = useState<Set<string>>(new Set());
  const [materialBusy, setMaterialBusy] = useState(false);
  const [catalogTags, setCatalogTags] = useState<Tag[]>([]);

  // O catálogo inteiro é o único jeito de saber, no cliente, que uma tag tem
  // filhos: o louvor traz `parent_id` da própria tag, não a lista de subtags.
  // Falhar aqui não pode travar a mesclagem — sem catálogo a tela só perde o
  // aviso e volta a ser o que era.
  useEffect(() => {
    let cancelado = false;
    getTags()
      .then((tags) => {
        if (!cancelado) setCatalogTags(tags);
      })
      .catch(() => {
        if (!cancelado) setCatalogTags([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!keeperId || !sourceId) return;
    if (keeperId === sourceId) {
      setError('Não é possível mesclar um louvor com ele mesmo.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([getPraise(keeperId), getPraise(sourceId), getMaterialKinds()])
      .then(([k, s, kinds]) => {
        setKeeper(k);
        setSource(s);
        setMaterialKinds(kinds);
        const choices: Partial<Record<MetaField, FieldChoice>> = {};
        for (const { key } of META_FIELDS) {
          // O keeper é o louvor que sobrevive: a mesclagem nunca troca um dado
          // dele sozinha. Onde os valores divergem a tela mostra os dois lados
          // e espera a escolha; até lá, o padrão é não mexer em nada.
          choices[key] = 'keeper';
        }
        setFieldChoices(choices);
        const tagUnion = new Set<string>();
        k.tags.forEach((t) => tagUnion.add(t.id));
        s.tags.forEach((t) => tagUnion.add(t.id));
        setSelectedTagIds(tagUnion);
        setMaterialIdsToImport(new Set(s.materials.map((m) => m.id)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar louvores'))
      .finally(() => setLoading(false));
  }, [keeperId, sourceId]);

  const materialKindOptions = useMemo(
    () => materialKinds.map((k) => ({ value: k.id, label: k.name })),
    [materialKinds]
  );

  const allTags = useMemo(() => {
    if (!keeper || !source) return [];
    const map = new Map<string, Tag>();
    keeper.tags.forEach((t) => map.set(t.id, t));
    source.tags.forEach((t) => map.set(t.id, t));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [keeper, source]);

  /** Ids de tags que agrupam subtags — o servidor recusa anexar qualquer uma. */
  const tagIdsDeAgrupamento = useMemo(
    () => new Set(catalogTags.filter((t) => t.parent_id).map((t) => t.parent_id as string)),
    [catalogTags]
  );

  // Basta alguém criar uma subtag de «Coral» para toda mesclagem envolvendo
  // esse louvor passar a morrer com um 400 no último clique, sem dizer qual
  // tag é a culpada. Aqui a culpada aparece antes, com nome.
  const tagsQueBloqueiam = useMemo(
    () => allTags.filter((t) => selectedTagIds.has(t.id) && tagIdsDeAgrupamento.has(t.id)),
    [allTags, selectedTagIds, tagIdsDeAgrupamento]
  );

  const resolvedMetadata = useMemo(() => {
    if (!keeper || !source) return null;
    const out: MergePraisesInput['metadata'] = {
      name: '',
      number: null,
      author: null,
      rhythm: null,
      tonality: null,
      category: null,
      lyrics: null,
    };
    for (const { key } of META_FIELDS) {
      const choice = fieldChoices[key] ?? 'keeper';
      const raw = choice === 'source' ? source[key] : keeper[key];
      const v = normField(raw);
      if (key === 'name') {
        out.name = v;
      } else {
        out[key] = v.length > 0 ? v : null;
      }
    }
    return out;
  }, [keeper, source, fieldChoices]);

  const handleFinalize = async () => {
    if (!keeperId || !sourceId || !keeper || !source || !resolvedMetadata) return;
    if (!resolvedMetadata.name) {
      setError('O nome do louvor é obrigatório.');
      return;
    }
    const msg = `O louvor «${source.name}» será excluído permanentemente. Deseja finalizar a mesclagem?`;
    if (!window.confirm(msg)) return;

    setSaving(true);
    setError(null);
    try {
      await mergePraises(keeperId, {
        source_praise_id: sourceId,
        metadata: resolvedMetadata,
        tag_ids: [...selectedTagIds],
        material_ids_to_import: [...materialIdsToImport],
      });
      // A tela do louvor lê este state para confirmar o que aconteceu — depois
      // de uma operação irreversível, voltar em silêncio deixa a dúvida.
      navigate(`/praise/${keeperId}`, {
        replace: true,
        state: { mergeSuccess: true, mergedPraiseName: source.name },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mesclar louvores');
    } finally {
      setSaving(false);
    }
  };

  if (!keeperId || !sourceId) {
    return (
      <div className="page-container detail-page">
        <p className="error-state-desc">Parâmetros inválidos.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-container detail-page">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  if (!keeper || !source) {
    return (
      <div className="page-container detail-page">
        <p className="error-state-desc">{error || 'Louvor não encontrado.'}</p>
        <Link to={`/praise/${keeperId}`} className="auth-btn">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="page-container detail-page merge-import-page">
      <Link to={`/praise/${keeperId}/merge`} className="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Voltar para seleção
      </Link>

      <header className="merge-step-header animate-fade-in-scale">
        <h1 className="detail-title">Importar e mesclar</h1>
        <p className="materials-panel-help">
          Escolha qual versão de cada metadado manter. Materiais de <strong>{source.name}</strong> serão importados no louvor <strong>{keeper.name}</strong>.
        </p>
      </header>

      {error ? (
        <div className="error-state" style={{ marginBottom: '1rem' }}>
          <div className="error-state-desc">{error}</div>
        </div>
      ) : null}

      <section className="detail-section">
        <h2 className="detail-section-title">Metadados</h2>
        {META_FIELDS.map(({ key, label, multiline }) => {
          const kVal = normField(keeper[key]);
          const sVal = normField(source[key]);
          const conflict = !fieldsEqual(keeper[key], source[key]);
          const choice = fieldChoices[key] ?? 'keeper';

          if (!conflict) {
            return (
              <div key={key} className="merge-field-row">
                <label className="merge-field-label">{label}</label>
                {multiline ? (
                  <textarea className="merge-field-value" readOnly value={kVal || '—'} rows={4} />
                ) : (
                  <div className="merge-field-value">{kVal || '—'}</div>
                )}
              </div>
            );
          }

          return (
            <div key={key} className="merge-conflict-row">
              <div className="merge-field-label">{label}</div>
              <div className="merge-conflict-sides">
                <label
                  className={`merge-side ${choice === 'keeper' ? 'merge-side--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`merge-${key}`}
                    checked={choice === 'keeper'}
                    onChange={() => setFieldChoices((c) => ({ ...c, [key]: 'keeper' }))}
                  />
                  <span className="merge-side-title">Manter (atual)</span>
                  {multiline ? (
                    <textarea readOnly value={kVal || '—'} rows={4} />
                  ) : (
                    <span className="merge-side-value">{kVal || '—'}</span>
                  )}
                </label>
                <label
                  className={`merge-side ${choice === 'source' ? 'merge-side--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`merge-${key}`}
                    checked={choice === 'source'}
                    onChange={() => setFieldChoices((c) => ({ ...c, [key]: 'source' }))}
                  />
                  <span className="merge-side-title">Usar (mesclado)</span>
                  {multiline ? (
                    <textarea readOnly value={sVal || '—'} rows={4} />
                  ) : (
                    <span className="merge-side-value">{sVal || '—'}</span>
                  )}
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="detail-section">
        <h2 className="detail-section-title">Tags</h2>
        <p className="materials-panel-help">
          As marcadas passam a ser exatamente as tags do louvor mesclado.
        </p>
        <div className="merge-tags-list">
          {allTags.map((tag) => {
            const agrupamento = tagIdsDeAgrupamento.has(tag.id);
            return (
              <label key={tag.id} className="merge-tag-check">
                <input
                  type="checkbox"
                  checked={selectedTagIds.has(tag.id)}
                  onChange={(e) => {
                    setSelectedTagIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(tag.id);
                      else next.delete(tag.id);
                      return next;
                    });
                  }}
                />
                {tagLabel(tag, catalogTags)}
                {agrupamento ? <span className="pill">agrupamento</span> : null}
              </label>
            );
          })}
          {allTags.length === 0 ? <p className="lyrics-empty">Nenhuma tag nos dois louvores.</p> : null}
        </div>
        {tagsQueBloqueiam.length > 0 ? (
          <div className="error-state" style={{ marginTop: '0.75rem' }}>
            <div className="error-state-desc">
              {tagsQueBloqueiam.length === 1
                ? `A tag «${tagsQueBloqueiam[0].name}» agrupa subtags e não pode ser anexada: desmarque-a, ou marque uma subtag dela.`
                : `As tags «${tagsQueBloqueiam.map((t) => t.name).join('», «')}» agrupam subtags e não podem ser anexadas: desmarque-as, ou marque subtags delas.`}
            </div>
          </div>
        ) : null}
      </section>

      <section className="detail-section">
        <h2 className="detail-section-title">Materiais do louvor atual</h2>
        <p className="materials-panel-help">
          Remova duplicatas antes de finalizar, se necessário. A remoção aqui é imediata e não
          depende de finalizar a mesclagem.
        </p>
        {keeper.materials.length === 0 ? (
          <p className="lyrics-empty">Nenhum material.</p>
        ) : (
          <div className="materials-table">
            {keeper.materials.map((m) => (
              <div key={m.id} className="materials-row">
                <div className="materials-cell materials-main">
                  <div className="materials-title">{m.material_kind_name || 'Material'}</div>
                  <div className="materials-meta">
                    <span className="pill">{m.type}</span>
                  </div>
                </div>
                <div className="materials-cell">
                  <SearchableSelect
                    compact
                    value={m.material_kind}
                    disabled={materialBusy}
                    onChange={async (material_kind) => {
                      setMaterialBusy(true);
                      try {
                        const updated = await updateMaterial(m.id, { material_kind });
                        setKeeper(updated);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao atualizar');
                      } finally {
                        setMaterialBusy(false);
                      }
                    }}
                    options={materialKindOptions}
                    aria-label="Categoria do material"
                  />
                </div>
                <div className="materials-cell">
                  <button
                    type="button"
                    className="auth-btn"
                    disabled={materialBusy}
                    onClick={async () => {
                      // Ao lado de checkboxes que só valem no finalize, um botão
                      // que apaga o arquivo na hora precisa dizer isso com todas
                      // as letras — não há como desfazer depois.
                      const rotulo = m.material_kind_name || 'Material';
                      const aviso = `O material «${rotulo}» será excluído permanentemente do louvor «${keeper.name}» agora, mesmo que você não finalize a mesclagem. Continuar?`;
                      if (!window.confirm(aviso)) return;
                      setMaterialBusy(true);
                      try {
                        const updated = await deleteMaterial(m.id);
                        setKeeper(updated);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao remover');
                      } finally {
                        setMaterialBusy(false);
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
      </section>

      <section className="detail-section">
        <h2 className="detail-section-title">Materiais a importar</h2>
        <p className="materials-panel-help">
          Do louvor <strong>{source.name}</strong> — desmarque para não importar. O que ficar
          desmarcado é descartado junto com o louvor, ao finalizar; até lá, nada aqui é apagado.
        </p>
        {source.materials.length === 0 ? (
          <p className="lyrics-empty">Nenhum material no louvor mesclado.</p>
        ) : (
          <div className="materials-table">
            {source.materials.map((m) => (
              <div key={m.id} className="materials-row">
                <div className="materials-cell materials-main">
                  <label className="merge-material-import-check">
                    <input
                      type="checkbox"
                      checked={materialIdsToImport.has(m.id)}
                      onChange={(e) => {
                        setMaterialIdsToImport((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          return next;
                        });
                      }}
                    />
                    <div>
                      <div className="materials-title">{m.material_kind_name || 'Material'}</div>
                      <div className="materials-meta">
                        <span className="pill">{m.type}</span>
                        <span className="merge-material-badge">De: {source.name}</span>
                      </div>
                    </div>
                  </label>
                </div>
                <div className="materials-cell">
                  <SearchableSelect
                    compact
                    value={m.material_kind}
                    disabled={materialBusy}
                    onChange={async (material_kind) => {
                      setMaterialBusy(true);
                      try {
                        const updated = await updateMaterial(m.id, { material_kind });
                        setSource(updated);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Falha ao atualizar');
                      } finally {
                        setMaterialBusy(false);
                      }
                    }}
                    options={materialKindOptions}
                    aria-label="Categoria do material"
                  />
                </div>
                {/* Aqui não há botão de excluir: a checkbox já diz tudo o que
                    esta tela precisa dizer sobre o material — importar ou não —
                    e o que não for importado some com o louvor no finalize. O
                    botão que existia apagava o arquivo na hora, mesmo se a
                    mesclagem nunca acontecesse, e era lido como "tirar da
                    pré-visualização". */}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="edit-actions merge-finalize-actions">
        <button
          type="button"
          className="auth-btn"
          disabled={saving || !resolvedMetadata?.name || tagsQueBloqueiam.length > 0}
          onClick={() => void handleFinalize()}
        >
          {saving ? 'Finalizando…' : 'Finalizar mesclagem'}
        </button>
      </div>
    </div>
  );
}
