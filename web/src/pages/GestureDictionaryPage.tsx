import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { GestureThumb } from '../components/gestures/GestureThumb';
import { useAuth } from '../context/useAuth';
import { indexar, normalizar, type GestureEntry, type Indice } from '../lib/gestures/dictionary';
import { getGestureDictionary, getGestureUsageCounts } from '../services/api';
import { NovoGestoForm } from '../components/gestures/NovoGestoForm';

/** Lista densa do dicionário: figura, nome, id, gatilhos, status e uso. Gestão, não leitura. */
export function GestureDictionaryPage() {
  const { isAuthenticated } = useAuth();
  const [indice, setIndice] = useState<Indice | null>(null);
  const [usos, setUsos] = useState<Map<string, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [mostrarSubstituidos, setMostrarSubstituidos] = useState(false);
  const [contagemIndisponivel, setContagemIndisponivel] = useState(false);

  // Recarrega quando `tentativa` muda ("Tentar de novo", gesto criado). Tudo
  // assíncrono dentro do efeito, sem setState síncrono — a regra do compilador
  // do React recusa; `cancelado` descarta a resposta de uma montagem antiga.
  const [tentativa, setTentativa] = useState(0);
  const recarregar = () => setTentativa((n) => n + 1);
  useEffect(() => {
    let cancelado = false;
    getGestureDictionary()
      .then(async (dic) => {
        if (cancelado) return;
        setErro(null);
        setIndice(indexar(dic));
        try {
          const contagens = await getGestureUsageCounts();
          if (cancelado) return;
          setUsos(new Map(contagens.map((c) => [c.gesture_id, c.materials])));
          setContagemIndisponivel(false);
        } catch {
          if (cancelado) return;
          setUsos(new Map());
          setContagemIndisponivel(true);
        }
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha ao carregar o dicionário');
      });
    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  const linhas = useMemo(() => {
    if (!indice) return [];
    const t = normalizar(busca);
    const casa = (texto: string) => normalizar(texto).split(/\s+/).some((p) => p.startsWith(t));
    return [...indice.porId.values()]
      .filter((g) => mostrarSubstituidos || g.status === 'active')
      .filter((g) => !t || casa(g.name) || g.exampleTriggers.some(casa) || g.id.startsWith(t))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [indice, busca, mostrarSubstituidos]);


  return (
    <main className="page-container gd-page">
      <Link to="/" className="cp-back">← Início</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">Dicionário de gestos</h1>
          {indice ? <div className="cp-number">versão {indice.version} · {indice.porId.size} gestos</div> : null}
        </div>
      </header>

      {erro ? <div className="cp-state cp-state--error"><div className="cp-state-title">{erro}</div><button type="button" className="cp-retry" onClick={recarregar}>Tentar de novo</button></div> : null}

      {contagemIndisponivel ? <p className="cp-review-error" role="status">Contagem de uso indisponível — tente recarregar.</p> : null}

      <div className="gd-filtros">
        <input type="search" aria-label="Buscar" placeholder="Nome, gatilho ou id" value={busca} onChange={(e) => setBusca(e.target.value)} className="ge-picker-busca" />
        <label className="gd-check">
          <input type="checkbox" checked={mostrarSubstituidos} onChange={(e) => setMostrarSubstituidos(e.target.checked)} /> Mostrar substituídos
        </label>
      </div>

      {isAuthenticated ? (
        <details className="gd-novo" open>
          <summary>Novo gesto</summary>
          <NovoGestoForm onCriado={recarregar} />
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
              <td>{contagemIndisponivel ? '—' : `usado em ${usos.get(g.id) ?? 0} materiais`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
