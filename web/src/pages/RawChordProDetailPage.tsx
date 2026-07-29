import { useDeferredValue, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChordProPreview } from '../components/ChordProPreview';
import { useAuth } from '../context/AuthContext';
import { getAssetUrl, getLoginUrl, getRawChordpro, patchRawChordpro } from '../services/api';

export function RawChordProDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready: authReady } = useAuth();
  const [item, setItem] = useState<Awaited<ReturnType<typeof getRawChordpro>> | null>(null);
  const [draft, setDraft] = useState('');
  const [validated, setValidated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const previewSource = useDeferredValue(draft);
  const canEdit = Boolean(user);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getRawChordpro(id);
        if (cancelled) return;
        setItem(data);
        setDraft(data.content);
        setValidated(data.validated);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSave = async () => {
    if (!id || !canEdit) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await patchRawChordpro(id, { content: draft, validated });
      setItem(updated);
      setValidated(updated.validated);
      setSaveMsg('Salvo.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleValidated = async () => {
    if (!id || !canEdit) return;
    const next = !validated;
    setValidated(next);
    setSaving(true);
    try {
      const updated = await patchRawChordpro(id, { validated: next });
      setItem(updated);
      setValidated(updated.validated);
      setSaveMsg(next ? 'Marcado como validado.' : 'Marcação removida.');
    } catch (err) {
      setValidated(!next);
      setSaveMsg(err instanceof Error ? err.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="page-container raw-chordpro-page"><div className="loading-state"><div className="loading-spinner" /></div></div>;
  if (error || !item) return (
    <div className="page-container raw-chordpro-page">
      <Link to="/raw-chordPro" className="raw-chordpro-back">← Lista</Link>
      <div className="error-state"><div className="error-state-desc">{error || 'Não encontrado'}</div></div>
    </div>
  );

  const qa =
    item.debug_batch === 'fase2' && item.kind_label
      ? item.kind_label.startsWith('auto_ok')
        ? 'auto_ok'
        : item.kind_label.startsWith('auto_fail')
          ? 'auto_fail'
          : null
      : null;
  const listHref = item.debug_batch === 'fase2' ? '/raw-chordPro?debug_batch=fase2' : '/raw-chordPro';

  return (
    <div className="page-container raw-chordpro-page raw-chordpro-detail">
      <header className="raw-chordpro-detail-header">
        <Link to={listHref} className="raw-chordpro-back">← Lista</Link>
        <h1 className="raw-chordpro-detail-title">{item.title || item.source_filename}</h1>
        <p className="muted raw-chordpro-detail-meta">
          {qa ? (
            <span className={`raw-chordpro-badge ${qa === 'auto_ok' ? 'auto-ok' : 'auto-fail'}`}>{qa}</span>
          ) : null}
          {qa ? ' · ' : null}
          {item.praise_name}{item.kind_label ? ` · ${item.kind_label}` : ''}{item.subtitle ? ` · nº ${item.subtitle}` : ''}
        </p>
      </header>

      {!authReady ? null : !canEdit ? (
        <p className="raw-chordpro-login-hint"><a href={getLoginUrl()}>Entre</a> para editar e validar.</p>
      ) : null}

      <section className="raw-chordpro-stack-section">
        <div className="raw-chordpro-section-head">
          <h2>Editor</h2>
          <div className="raw-chordpro-actions">
            <button type="button" className={`auth-btn${validated ? ' is-validated' : ''}`} disabled={!canEdit || saving} onClick={() => void handleToggleValidated()}>{validated ? '✓ Validado' : 'Marcar validado'}</button>
            <button type="button" className="auth-btn" disabled={!canEdit || saving} onClick={() => void handleSave()}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
        {saveMsg ? <p className="raw-chordpro-save-msg muted">{saveMsg}</p> : null}
        <textarea className="lyrics-editor raw-chordpro-editor" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!canEdit} spellCheck={false} />
      </section>

      <section className="raw-chordpro-stack-section">
        <h2>Preview ChordPro</h2>
        <div className="raw-chordpro-preview-wrap"><ChordProPreview source={previewSource} /></div>
      </section>

      {item.pdf_r2_key ? (
        <section className="raw-chordpro-stack-section">
          <h2>PDF de referência</h2>
          <div className="pdf-viewer-block raw-chordpro-pdf-block">
            <iframe className="pdf-viewer-frame raw-chordpro-pdf-frame" title="PDF" src={getAssetUrl(item.pdf_r2_key)} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
