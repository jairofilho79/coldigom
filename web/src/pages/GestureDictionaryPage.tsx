import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { GestureThumb } from '../components/gestures/GestureThumb';
import { useAuth } from '../context/useAuth';
import { indexar, normalizar, type GestureEntry, type Indice } from '../lib/gestures/dictionary';
import { createGesture, getGestureDictionary, getGestureUsageCounts } from '../services/api';

/** Lista densa do dicionário: figura, nome, id, gatilhos, status e uso. Gestão, não leitura. */
export function GestureDictionaryPage() {
  const { isAuthenticated } = useAuth();
  const [indice, setIndice] = useState<Indice | null>(null);
  const [usos, setUsos] = useState<Map<string, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarSubstituidos, setMostrarSubstituidos] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [dic, contagens] = await Promise.all([getGestureDictionary(), getGestureUsageCounts().catch(() => [])]);
      setIndice(indexar(dic));
      setUsos(new Map(contagens.map((c) => [c.gesture_id, c.materials])));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar o dicionário');
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhas = useMemo(() => {
    if (!indice) return [];
    const t = normalizar(busca);
    const casa = (texto: string) => normalizar(texto).split(/\s+/).some((p) => p.startsWith(t));
    return [...indice.porId.values()]
      .filter((g) => mostrarSubstituidos || g.status === 'active')
      .filter((g) => !t || casa(g.name) || g.exampleTriggers.some(casa) || g.id.startsWith(t))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [indice, busca, mostrarSubstituidos]);

  // formulário de gesto novo
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [gatilhos, setGatilhos] = useState('');
  const [figura, setFigura] = useState<File | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroDoForm, setErroDoForm] = useState<string | null>(null);

  const criar = async () => {
    if (!nome.trim() || !figura) return;
    setCriando(true);
    setErroDoForm(null);
    try {
      await createGesture({
        name: nome.trim(),
        description: descricao.trim(),
        exampleTriggers: gatilhos.split(',').map((s) => s.trim()).filter(Boolean),
        image: figura,
      });
      setNome('');
      setDescricao('');
      setGatilhos('');
      setFigura(null);
      await carregar();
    } catch (e) {
      setErroDoForm(e instanceof Error ? e.message : 'Falha ao criar o gesto');
    } finally {
      setCriando(false);
    }
  };

  return (
    <main className="page-container gd-page">
      <Link to="/" className="cp-back">← Início</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">Dicionário de gestos</h1>
          {indice ? <div className="cp-number">versão {indice.version} · {indice.porId.size} gestos</div> : null}
        </div>
      </header>

      {erro ? <div className="cp-state cp-state--error"><div className="cp-state-title">{erro}</div><button type="button" className="cp-retry" onClick={() => void carregar()}>Tentar de novo</button></div> : null}

      <div className="gd-filtros">
        <input type="search" aria-label="Buscar" placeholder="Nome, gatilho ou id" value={busca} onChange={(e) => setBusca(e.target.value)} className="ge-picker-busca" />
        <label className="gd-check">
          <input type="checkbox" checked={mostrarSubstituidos} onChange={(e) => setMostrarSubstituidos(e.target.checked)} /> Mostrar substituídos
        </label>
      </div>

      {isAuthenticated ? (
        <details className="gd-novo" open>
          <summary>Novo gesto</summary>
          <div className="edit-grid">
            <div className="edit-field"><label htmlFor="gd-nome">Nome</label><input id="gd-nome" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-desc">Descrição</label><input id="gd-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-gat">Gatilhos de exemplo</label><input id="gd-gat" placeholder="separados por vírgula" value={gatilhos} onChange={(e) => setGatilhos(e.target.value)} /></div>
            <div className="edit-field"><label htmlFor="gd-png">Figura PNG</label><input id="gd-png" type="file" accept="image/png,.png" onChange={(e) => setFigura(e.target.files?.[0] ?? null)} /></div>
            <div className="edit-actions">
              <button type="button" className="auth-btn" disabled={criando || !nome.trim() || !figura} onClick={() => void criar()}>Criar gesto</button>
              {erroDoForm ? <span className="cp-review-error" role="status">{erroDoForm}</span> : null}
            </div>
          </div>
        </details>
      ) : null}

      <table className="gd-tabela">
        <thead>
          <tr><th>Figura</th><th>Nome</th><th>Id</th><th>Gatilhos</th><th>Status</th><th>Uso</th></tr>
        </thead>
        <tbody>
          {linhas.map((g: GestureEntry) => (
            <tr key={g.id} className={g.status === 'deprecated' ? 'is-depreciado' : ''}>
              <td><GestureThumb id={g.id} indice={indice} tamanho={64} /></td>
              <td><Link to={`/gestos/dicionario/${g.id}`}>{g.name}</Link></td>
              <td><code>{g.id}</code></td>
              <td>{g.exampleTriggers.join(', ')}</td>
              <td>{g.status === 'active' ? 'ativo' : `substituído por ${g.replacedBy ?? '?'}`}</td>
              <td>{`usado em ${usos.get(g.id) ?? 0} materiais`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
