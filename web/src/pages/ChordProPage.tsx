import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChordProView } from '../components/chordpro/ChordProView';
import { useMaterialContent } from '../hooks/useMaterialContent';
import { useViewerTheme } from '../hooks/useViewerTheme';
import { parse } from '../lib/chordpro/parse';
import { getAssetUrl, getPraise, updateMaterial } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Material, PraiseDetail } from '../types';

/** Marca de revisão humana. Fica no cabeçalho porque é uma decisão sobre a
 *  cifra que se está lendo — não um detalhe de registro no rodapé.
 *  Sem sessão, vira só um selo: a informação interessa a quem lê, a ação não. */
function ReviewSwitch({
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
        aria-label="Marcar cifra como revisada"
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
      {error ? <span className="cp-review-error">{error}</span> : null}
    </div>
  );
}

/** Linha do painel. Valor ausente vira "—" em vez de sumir: numa ferramenta de
 *  gestão, saber que o campo está vazio é informação. */
function PanelRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="cp-panel-row">
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : '—'}</dd>
    </div>
  );
}

export function ChordProPage() {
  const { praiseId, materialId } = useParams<{ praiseId: string; materialId: string }>();
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [loadingPraise, setLoadingPraise] = useState(true);
  const [praiseError, setPraiseError] = useState<string | null>(null);
  const { theme, toggle } = useViewerTheme();

  useEffect(() => {
    if (!praiseId) return;
    let cancelled = false;
    setLoadingPraise(true);
    (async () => {
      try {
        const data = await getPraise(praiseId);
        if (!cancelled) setPraise(data);
      } catch (err) {
        if (!cancelled) setPraiseError(err instanceof Error ? err.message : 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoadingPraise(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [praiseId]);

  const material = praise?.materials.find((m) => m.id === materialId) ?? null;

  // a resposta do PATCH já traz o louvor inteiro; usar isso evita um refetch e
  // mantém a tela coerente se outro campo mudou junto
  const toggleReviewed = async (next: boolean) => {
    if (!material) return;
    setPraise(await updateMaterial(material.id, { is_reviewed: next }));
  };
  const sourcePdf =
    praise?.materials.find((m) => m.id === material?.source_material_id) ?? null;

  const { content, retry } = useMaterialContent(material?.r2_key ?? null);
  const song = useMemo(
    () => (content.status === 'ready' ? parse(content.source) : null),
    [content]
  );

  if (loadingPraise) {
    return (
      <div className="page-container cp-page">
        <div className="loading-state">
          <div className="loading-spinner" />
          <div className="loading-text">Carregando cifra...</div>
        </div>
      </div>
    );
  }

  if (praiseError || !praise) {
    return (
      <div className="page-container cp-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{praiseError || 'Louvor não encontrado'}</div>
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="page-container cp-page">
        <Link to={`/praise/${praise.id}`} className="cp-back">
          ← {praise.name}
        </Link>
        <div className="no-results">
          <div className="no-results-icon">📄</div>
          <div className="no-results-title">Material não encontrado neste louvor</div>
        </div>
      </div>
    );
  }

  // O cabeçalho é alimentado pelo ARQUIVO, não pelo banco — é o conteúdo exibido.
  // Campo ausente na cifra some do cabeçalho; o valor do banco aparece no painel.
  const chips = [
    song?.header.key ? `Tom ${song.header.key}` : null,
    song?.header.rhythm ?? null,
    material.material_kind_name ?? null,
  ].filter((c): c is string => Boolean(c));

  const semLetra = content.status === 'absent' || (song !== null && !song.hasLyrics);

  return (
    <div className="page-container cp-page">
      <Link to={`/praise/${praise.id}`} className="cp-back">
        ← {praise.name}
      </Link>

      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{song?.header.title ?? praise.name}</h1>
          {song?.header.subtitle ? <div className="cp-number">{song.header.subtitle}</div> : null}
          {song?.header.artist ? <div className="cp-artist">{song.header.artist}</div> : null}
          {chips.length > 0 ? (
            <div className="cp-chips">
              {chips.map((c) => (
                <span className="cp-chip" key={c}>
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="cp-header-actions">
          <ReviewSwitch material={material} onToggle={toggleReviewed} />
          <button type="button" className="cp-theme-btn" onClick={toggle}>
            {theme === 'dark' ? '☀ claro' : '☾ escuro'}
          </button>
        </div>
      </header>

      {content.status === 'loading' ? (
        <div className="loading-state">
          <div className="loading-spinner" />
        </div>
      ) : null}

      {content.status === 'error' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">Falha ao carregar a cifra.</div>
          <div className="cp-state-desc">{content.message}</div>
          <button type="button" className="cp-retry" onClick={retry}>
            Tentar de novo
          </button>
        </div>
      ) : null}

      {semLetra ? (
        <div className="cp-state cp-state--absent">
          <div className="cp-state-title">Esta cifra ainda não foi publicada.</div>
          <div className="cp-state-desc">
            {content.status === 'absent'
              ? 'O registro existe no acervo, mas não há arquivo de cifra.'
              : 'O arquivo existe, mas não contém nenhuma linha de letra.'}
          </div>
          {sourcePdf?.r2_key ? (
            <a
              className="cp-source-link"
              href={getAssetUrl(sourcePdf.r2_key)}
              target="_blank"
              rel="noopener noreferrer"
            >
              PDF de origem
            </a>
          ) : null}
        </div>
      ) : null}

      {song && song.hasLyrics ? (
        <div className="cp-scope" data-cp-theme={theme}>
          <ChordProView song={song} />
        </div>
      ) : null}

      <section className="cp-panel">
        <h2 className="cp-panel-title">Material</h2>
        <div className="cp-panel-cols">
          <dl className="cp-panel-col">
            <div className="cp-panel-label">No arquivo</div>
            <PanelRow label="Título" value={song?.header.title} />
            <PanelRow label="Número" value={song?.header.subtitle} />
            <PanelRow label="Tom" value={song?.header.key} />
            <PanelRow label="Ritmo" value={song?.header.rhythm} />
            <PanelRow label="Autoria" value={song?.header.artist} />
          </dl>
          <dl className="cp-panel-col">
            <div className="cp-panel-label">No banco</div>
            <PanelRow label="Louvor" value={praise.name} />
            <PanelRow label="Número" value={praise.number} />
            <PanelRow label="Tom" value={praise.tonality} />
            <PanelRow label="Ritmo" value={praise.rhythm} />
            <PanelRow label="Autoria" value={praise.author} />
          </dl>
        </div>

        <dl className="cp-panel-col cp-panel-col--wide">
          <div className="cp-panel-label">Registro</div>
          <PanelRow label="Categoria" value={material.material_kind_name} />
          <PanelRow label="Chave R2" value={material.r2_key} />
          {material.merged_from_praise_name ? (
            <PanelRow label="Veio do merge de" value={material.merged_from_praise_name} />
          ) : null}
          <div className="cp-panel-row">
            <dt>PDF de origem</dt>
            <dd>
              {sourcePdf?.r2_key ? (
                <a href={getAssetUrl(sourcePdf.r2_key)} target="_blank" rel="noopener noreferrer">
                  PDF de origem
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>

        {song && song.notes.length > 0 ? (
          <div className="cp-notes">
            <div className="cp-panel-label">Notas do pipeline</div>
            {song.notes.map((note, i) => (
              <p className="cp-note" key={i}>
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
