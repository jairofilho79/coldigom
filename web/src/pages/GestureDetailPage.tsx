import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { StyledFileInput } from '../components/StyledFileInput';
import { useAuth } from '../context/useAuth';
import { indexar, type Indice } from '../lib/gestures/dictionary';
import {
  getAssetUrl, getGesture, getGestureDictionary, replaceGesture, updateGesture, uploadGestureGif, uploadGestureImage, type GestureUsage,
} from '../services/api';
import type { GestureEntry } from '../lib/gestures/dictionary';

type Entrada = GestureEntry & { usages: GestureUsage[] };

export function GestureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [entrada, setEntrada] = useState<Entrada | null>(null);
  const [indice, setIndice] = useState<Indice | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [substituto, setSubstituto] = useState('');
  const [reescrever, setReescrever] = useState(false);
  const [resultado, setResultado] = useState<{ reescritos: number; falhas: { materialId: string; motivo: string }[] } | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setErro(null);
    try {
      const e = await getGesture(id);
      setEntrada(e);
      setNome(e.name);
      setDescricao(e.description);
      setGatilhos(e.exampleTriggers.join(', '));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao carregar o gesto');
    }
  }, [id]);
  useEffect(() => {
    void carregar();
    getGestureDictionary().then((d) => setIndice(indexar(d))).catch(() => setIndice(null));
  }, [carregar]);

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      setAviso(ok);
      await carregar();
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'Falha');
    } finally {
      setOcupado(false);
    }
  };

  if (erro) return <main className="page-container gd-page"><div className="error-state"><div className="error-state-title">{erro}</div></div></main>;
  if (!entrada || !id) return <main className="page-container gd-page"><div className="loading-state"><div className="loading-spinner" /></div></main>;

  const substituidoPor = entrada.replacedBy ? indice?.porId.get(entrada.replacedBy) : null;
  const candidatos = (indice?.ativos ?? []).filter((g) => g.id !== id);
  const totalDeVezes = entrada.usages.reduce((n, u) => n + u.count, 0);

  return (
    <main className="page-container gd-page">
      <Link to="/gestos/dicionario" className="cp-back">← Dicionário</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{entrada.name}</h1>
          <div className="cp-number"><code>{entrada.id}</code> · {entrada.status === 'active' ? 'ativo' : 'substituído'}</div>
          {entrada.status === 'deprecated' ? (
            <div className="cp-artist">
              Substituído por {substituidoPor ? <Link to={`/gestos/dicionario/${substituidoPor.id}`}>{substituidoPor.name}</Link> : <code>{entrada.replacedBy}</code>}
            </div>
          ) : null}
        </div>
      </header>

      {resultado ? (
        <div className="cp-state">
          <div>{resultado.reescritos} documento(s) reescrito(s).</div>
          {resultado.falhas.length ? (
            <ul>{resultado.falhas.map((f) => <li key={f.materialId}><code>{f.materialId}</code>: {f.motivo}</li>)}</ul>
          ) : null}
        </div>
      ) : null}

      <section className="gd-figuras">
        <img src={getAssetUrl(entrada.image)} alt={entrada.name} width={96} height={96} className="gv-figura" />
        {entrada.gif ? <img src={getAssetUrl(entrada.gif)} alt={`${entrada.name} (animação)`} width={96} height={96} className="gv-figura" /> : <span className="materials-placeholder">Sem GIF</span>}
        {isAuthenticated ? (
          <div className="gd-figuras-acoes">
            <StyledFileInput
              label="Trocar figura"
              accept="image/png,.png"
              selectedName={null}
              onChange={(files) => { const f = files[0]; if (f) void executar(() => uploadGestureImage(id, f), 'Figura trocada.'); }}
            />
            <StyledFileInput
              label="Enviar GIF"
              accept="image/gif,.gif"
              selectedName={null}
              onChange={(files) => { const f = files[0]; if (f) void executar(() => uploadGestureGif(id, f), 'GIF enviado.'); }}
            />
          </div>
        ) : null}
      </section>

      <section className="cp-panel">
        <h2 className="cp-panel-title">Dados</h2>
        {isAuthenticated ? (
          <div className="edit-grid">
            <div className="edit-field"><label htmlFor="gd-nome">Nome</label><input id="gd-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-desc">Descrição</label><input id="gd-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-gat">Gatilhos de exemplo</label><input id="gd-gat" value={gatilhos} onChange={(e) => setGatilhos(e.target.value)} /></div>
            <div className="edit-actions">
              <button
                type="button"
                className="auth-btn"
                disabled={ocupado || !nome.trim()}
                onClick={() => void executar(
                  () => updateGesture(id, { name: nome.trim(), description: descricao.trim(), exampleTriggers: gatilhos.split(',').map((s) => s.trim()).filter(Boolean) }),
                  'Alterações salvas.'
                )}
              >
                Salvar alterações
              </button>
              {aviso ? <span className="cp-edit-issues" role="status" aria-live="polite">{aviso}</span> : null}
            </div>
          </div>
        ) : (
          <dl className="cp-panel-col">
            <div className="cp-panel-row"><dt>Descrição</dt><dd>{entrada.description || '—'}</dd></div>
            <div className="cp-panel-row"><dt>Gatilhos</dt><dd>{entrada.exampleTriggers.join(', ') || '—'}</dd></div>
          </dl>
        )}
      </section>

      <section className="cp-panel">
        <h2 className="cp-panel-title">Usado em</h2>
        {entrada.usages.length === 0 ? (
          <p className="materials-placeholder">Nenhum documento usa este gesto.</p>
        ) : (
          <>
            <p className="cp-number">{entrada.usages.length} material(is), {totalDeVezes} vez(es) no total</p>
            <ul className="gd-usos">
              {entrada.usages.map((u) => (
                <li key={u.material_id}>
                  <Link to={`/praise/${u.praise_id}/gestos/${u.material_id}`}>{u.praise_number ? `${u.praise_number} - ` : ''}{u.praise_name}</Link>
                  <span className="cp-number"> · {u.count} vez(es)</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {isAuthenticated && entrada.status === 'active' ? (
        <section className="cp-panel">
          <h2 className="cp-panel-title">Substituir por outro gesto</h2>
          <p className="cp-number">Este gesto vira "substituído" e passa a apontar para o escolhido. Os documentos continuam válidos: o app resolve o substituto ao desenhar.</p>
          <div className="edit-grid">
            <div className="edit-field">
              <label htmlFor="gd-sub">Gesto substituto</label>
              <select id="gd-sub" value={substituto} onChange={(e) => setSubstituto(e.target.value)}>
                <option value="">(escolha)</option>
                {candidatos.map((g) => <option key={g.id} value={g.id}>{g.name} · {g.id}</option>)}
              </select>
            </div>
            <label className="gd-check"><input type="checkbox" checked={reescrever} onChange={(e) => setReescrever(e.target.checked)} /> Reescrever os documentos agora</label>
            <div className="edit-actions">
              <button
                type="button"
                className="auth-btn"
                disabled={ocupado || !substituto}
                onClick={() => void executar(async () => { setResultado(await replaceGesture(id, substituto, reescrever)); }, 'Gesto substituído.')}
              >
                Substituir
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
