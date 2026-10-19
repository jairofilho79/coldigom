import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { GestureDocumentView } from '../components/gestures/GestureDocumentView';
import { GesturesEditor } from '../components/gestures/GesturesEditor';
import { GesturesRawEditor } from '../components/gestures/GesturesRawEditor';
import { ReviewSwitch } from '../components/ReviewSwitch';
import { useAuth } from '../context/useAuth';
import { useMaterialContent } from '../hooks/useMaterialContent';
import { adicionarAoIndice, indexar, type Indice } from '../lib/gestures/dictionary';
import type { Resultado } from '../lib/gestures/edit';
import { caminhoDaChave, chaveDoCaminho, type Caminho } from '../lib/gestures/flatten';
import { GESTURE_SCHEMA, MENSAGENS, validarDocumento, type GestureDocument } from '../lib/gestures/schema';
import {
  ConflitoDeGravacao, DocumentoRecusado, getAssetUrl, getGestureDictionary, getPraise, putGesturesContent, updateMaterial,
} from '../services/api';
import type { PraiseDetail } from '../types';

const TETO_DO_HISTORICO = 50;
const CHAVE_MODO_GESTOR = 'coldigom_gestures_edit_mode';

function modoInicial(): 'visual' | 'raw' {
  try {
    const salvo = window.localStorage.getItem(CHAVE_MODO_GESTOR);
    if (salvo === 'raw' || salvo === 'visual') return salvo;
  } catch {
    // ignorar erro de storage
  }
  return 'visual';
}

function tituloPadrao(praise: PraiseDetail): string {
  const nome = praise.name.toUpperCase();
  return praise.number ? `${praise.number} - ${nome}` : nome;
}

type Servidor =
  | { status: 'novo'; etag: null }
  | { status: 'ok'; doc: GestureDocument; etag: string | null }
  | { status: 'invalido'; codigo: string; caminho: string };

/**
 * O editor de gestos de um material. O rascunho é a própria árvore; salvar manda
 * If-Match, e 409/412 nunca sobrescrevem — viram o cartão de conflito.
 */
export function GesturesEditorPage() {
  const { praiseId, materialId } = useParams<{ praiseId: string; materialId: string }>();
  const { isAuthenticated } = useAuth();
  const [praise, setPraise] = useState<PraiseDetail | null>(null);
  const [erroDoLouvor, setErroDoLouvor] = useState<string | null>(null);
  const [indice, setIndice] = useState<Indice | null>(null);

  useEffect(() => {
    if (!praiseId) return;
    let cancelado = false;
    getPraise(praiseId)
      .then((p) => !cancelado && setPraise(p))
      .catch((e) => !cancelado && setErroDoLouvor(e instanceof Error ? e.message : 'Falha ao carregar'));
    // Dicionário indisponível não impede editar: os gestos viram placeholder.
    getGestureDictionary()
      .then((d) => !cancelado && setIndice(indexar(d)))
      .catch(() => !cancelado && setIndice(null));
    return () => {
      cancelado = true;
    };
  }, [praiseId]);

  const material = praise?.materials.find((m) => m.id === materialId) ?? null;
  const pdfDeOrigem = praise?.materials.find((m) => m.id === material?.source_material_id) ?? null;
  const { content, retry } = useMaterialContent(material?.r2_key ?? null);

  // O que o servidor tem, até onde sabemos: o GET, ou a nossa última gravação.
  // As dependências são os PRIMITIVOS do hook (status, texto, etag), não o objeto
  // `content`: ele é recriado a cada render, e um memo preso a ele devolveria um
  // documento novo por render — e o efeito abaixo zeraria o rascunho a cada tecla.
  const [gravado, setGravado] = useState<{ key: string; doc: GestureDocument; etag: string | null } | null>(null);
  const fonte = content.status === 'ready' ? content.source : null;
  const etagDoGet = content.status === 'ready' ? content.etag : null;
  const servidor = useMemo<Servidor | null>(() => {
    if (!material?.r2_key) return null;
    if (gravado && gravado.key === material.r2_key) return { status: 'ok', doc: gravado.doc, etag: gravado.etag };
    if (content.status === 'absent') return { status: 'novo', etag: null };
    if (fonte === null) return null;
    let lido: unknown;
    try {
      lido = JSON.parse(fonte);
    } catch {
      return { status: 'invalido', codigo: 'json_invalido', caminho: '' };
    }
    const r = validarDocumento(lido);
    if (!r.ok) return { status: 'invalido', codigo: r.erro.codigo, caminho: r.erro.caminho };
    return { status: 'ok', doc: r.doc, etag: etagDoGet };
  }, [material?.r2_key, content.status, fonte, etagDoGet, gravado]);

  // Título é primitivo de propósito: trocar a marca de revisão devolve um
  // `praise` novo, e um documento novo memoizado nele perderia o rascunho.
  // A versão do dicionário FICA FORA das deps de propósito: para um documento
  // novo ela nasce 0 e só importa na hora de salvar (`salvar` já carimba
  // `indice.version` na saída). Se ela entrasse aqui, o dicionário chegando
  // depois do GET (ou depois de a pessoa já ter começado a editar) trocaria a
  // identidade de `base` e apagaria o rascunho por baixo dela.
  const tituloBase = praise ? tituloPadrao(praise) : '';
  const base = useMemo<GestureDocument | null>(() => {
    if (!servidor || !tituloBase) return null;
    if (servidor.status === 'ok') return servidor.doc;
    if (servidor.status === 'novo') {
      return { schema: GESTURE_SCHEMA, title: tituloBase, dictionaryVersion: 0, items: [] };
    }
    return null;
  }, [servidor, tituloBase]);

  // rascunho + histórico
  const [rascunho, setRascunho] = useState<GestureDocument | null>(null);
  const [passado, setPassado] = useState<GestureDocument[]>([]);
  const [futuro, setFuturo] = useState<GestureDocument[]>([]);
  const [foco, setFoco] = useState<Caminho | null>(null);
  const [erroNoCaminho, setErroNoCaminho] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);
  const [abrirSeletor, setAbrirSeletor] = useState(0);
  const [aba, setAba] = useState<'editor' | 'preview'>('editor');
  const [modoEdicao, setModoEdicao] = useState<'visual' | 'raw'>(modoInicial);
  const [rawDraft, setRawDraft] = useState<string>('');
  const rawDraftRef = useRef(rawDraft);
  rawDraftRef.current = rawDraft;
  const [erroSintaxe, setErroSintaxe] = useState<string | null>(null);

  const alternarModo = (novoModo: 'visual' | 'raw') => {
    if (novoModo === modoEdicao) return;
    if (novoModo === 'visual' && erroSintaxe) {
      setMensagem('Corrija o erro de sintaxe no JSON antes de alternar para o editor visual.');
      return;
    }
    setModoEdicao(novoModo);
    try {
      window.localStorage.setItem(CHAVE_MODO_GESTOR, novoModo);
    } catch {
      // ignorar erro de storage
    }
  };

  // Trocar de material ou receber a base pela primeira vez zera o rascunho.
  const [baseAnterior, setBaseAnterior] = useState<GestureDocument | null>(null);
  if (base !== baseAnterior) {
    setBaseAnterior(base);
    if (!(gravado && base === gravado.doc)) {
      setRascunho(base);
      setRawDraft(base ? JSON.stringify(base, null, 2) : '');
      setPassado([]);
      setFuturo([]);
      setFoco(null);
      setErroNoCaminho(null);
      setConflito(null);
      setErroSintaxe(null);
    }
  }

  const sujo =
    base !== null &&
    (modoEdicao === 'raw'
      ? rawDraft !== JSON.stringify(base, null, 2)
      : rascunho !== null && rascunho !== base);
  useEffect(() => {
    if (!sujo) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [sujo]);

  const validacao = useMemo(() => {
    if (modoEdicao === 'raw' && erroSintaxe) return null;
    return rascunho ? validarDocumento(rascunho) : null;
  }, [rascunho, modoEdicao, erroSintaxe]);

  const aoMudarRaw = (novoTexto: string) => {
    setRawDraft(novoTexto);
    setMensagem(null);
    let lido: unknown;
    try {
      lido = JSON.parse(novoTexto);
      setErroSintaxe(null);
    } catch (e) {
      setErroSintaxe(e instanceof Error ? e.message : 'Erro de sintaxe JSON');
      return;
    }

    const r = validarDocumento(lido);
    if (!r.ok) {
      const c = caminhoDaChave(r.erro.caminho);
      setErroNoCaminho(c ? chaveDoCaminho(c) : null);
    } else {
      setErroNoCaminho(null);
      setRascunho((atual) => {
        if (atual && JSON.stringify(atual) !== JSON.stringify(r.doc)) {
          setPassado((p) => [...p.slice(-(TETO_DO_HISTORICO - 1)), atual]);
        }
        return r.doc;
      });
      setFuturo([]);
    }
  };

  const aplicar = useCallback((r: Resultado) => {
    setRascunho((atual) => {
      if (atual) setPassado((p) => [...p.slice(-(TETO_DO_HISTORICO - 1)), atual]);
      return r.doc;
    });
    setRawDraft(JSON.stringify(r.doc, null, 2));
    setErroSintaxe(null);
    setFuturo([]);
    setFoco(r.foco);
    setErroNoCaminho(null);
    setMensagem(null);
  }, []);

  const desfazer = useCallback(() => {
    setPassado((p) => {
      const anterior = p[p.length - 1];
      if (!anterior) return p;
      setRascunho((atual) => {
        if (atual) setFuturo((f) => [...f, atual]);
        return anterior;
      });
      setRawDraft(JSON.stringify(anterior, null, 2));
      setErroSintaxe(null);
      return p.slice(0, -1);
    });
    setFoco(null);
    setErroNoCaminho(null);
  }, []);

  const refazer = useCallback(() => {
    setFuturo((f) => {
      const proximo = f[f.length - 1];
      if (!proximo) return f;
      setRascunho((atual) => {
        if (atual) setPassado((p) => [...p, atual]);
        return proximo;
      });
      setRawDraft(JSON.stringify(proximo, null, 2));
      setErroSintaxe(null);
      return f.slice(0, -1);
    });
    setFoco(null);
    setErroNoCaminho(null);
  }, []);

  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;
  const baseRef = useRef(base);
  baseRef.current = base;

  const salvar = useCallback(async () => {
    let doc: GestureDocument | null = null;
    if (modoEdicao === 'raw') {
      if (erroSintaxe) {
        setMensagem('Corrija o erro de sintaxe no JSON antes de salvar.');
        return;
      }
      try {
        const lido = JSON.parse(rawDraftRef.current);
        const v = validarDocumento(lido);
        if (!v.ok) {
          setMensagem(MENSAGENS[v.erro.codigo]);
          const c = caminhoDaChave(v.erro.caminho);
          setErroNoCaminho(c ? chaveDoCaminho(c) : null);
          return;
        }
        doc = v.doc;
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'JSON inválido');
        return;
      }
    } else {
      doc = rascunhoRef.current;
    }

    if (!doc || !material?.r2_key || !servidor || servidor.status === 'invalido') return;
    if (doc === baseRef.current) return;
    const v = validarDocumento(doc);
    if (!v.ok) {
      setMensagem(MENSAGENS[v.erro.codigo]);
      const c = caminhoDaChave(v.erro.caminho);
      setErroNoCaminho(c ? chaveDoCaminho(c) : null);
      return;
    }
    setSalvando(true);
    setMensagem(null);
    setConflito(null);
    try {
      const paraGravar: GestureDocument = { ...doc, dictionaryVersion: indice?.version ?? doc.dictionaryVersion };
      const { etag } = await putGesturesContent(material.id, paraGravar, servidor.etag);
      const mudouDurante =
        modoEdicao === 'raw'
          ? rawDraftRef.current !== JSON.stringify(doc, null, 2)
          : rascunhoRef.current !== doc;
      setGravado({ key: material.r2_key, doc: paraGravar, etag });
      setPraise((p) => p && {
        ...p,
        materials: p.materials.map((m) => (m.id === material.id ? { ...m, is_reviewed: false, reviewed_at: null, reviewed_by: null } : m)),
      });
      if (!mudouDurante) {
        setRascunho(paraGravar);
        setRawDraft(JSON.stringify(paraGravar, null, 2));
        setPassado([]);
        setFuturo([]);
        setMensagem('Salvo.');
      } else {
        setMensagem('Gravado. Você fez alterações novas depois do clique — elas ainda não foram salvas.');
      }
    } catch (e) {
      if (e instanceof ConflitoDeGravacao) {
        setConflito(JSON.stringify(doc, null, 2));
        setMensagem(e.message);
      } else if (e instanceof DocumentoRecusado) {
        setMensagem(e.message);
        const c = caminhoDaChave(e.path);
        setErroNoCaminho(c ? chaveDoCaminho(c) : null);
      } else {
        setMensagem(e instanceof Error ? e.message : 'Falha ao salvar');
      }
    } finally {
      setSalvando(false);
    }
  }, [material, servidor, indice?.version, modoEdicao, erroSintaxe]);

  // teclado
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || !isAuthenticated) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void salvar();
      } else if (k === 'z' && e.shiftKey) {
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        refazer();
      } else if (k === 'z') {
        if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        desfazer();
      } else if (k === 'enter') {
        e.preventDefault();
        setAbrirSeletor((n) => n + 1);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [salvar, desfazer, refazer, isAuthenticated]);

  // a pré-visualização acompanha o cartão em foco
  const chaveDoFoco = foco ? chaveDoCaminho(foco) : undefined;
  useEffect(() => {
    if (!chaveDoFoco) return;
    const alvo = document.querySelector(`.gv-papel [data-caminho="${chaveDoFoco}"]`);
    (alvo as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [chaveDoFoco]);

  const toggleReviewed = async (next: boolean) => {
    if (!material) return;
    setPraise(await updateMaterial(material.id, { is_reviewed: next }));
  };

  if (erroDoLouvor || (praise && !material)) {
    return (
      <main className="page-container ge-page">
        <div className="error-state">
          <div className="error-state-icon">⚠</div>
          <div className="error-state-title">Erro ao carregar</div>
          <div className="error-state-desc">{erroDoLouvor ?? 'Material não encontrado'}</div>
        </div>
      </main>
    );
  }
  if (!praise || !material) {
    return (
      <main className="page-container ge-page">
        <div className="loading-state"><div className="loading-spinner" /><div className="loading-text">Carregando gestos...</div></div>
      </main>
    );
  }
  if (material.type !== 'gestures') {
    return (
      <main className="page-container ge-page">
        <div className="error-state"><div className="error-state-title">Este material não é de gestos.</div></div>
      </main>
    );
  }

  return (
    <main className="page-container ge-page">
      <Link to={`/praise/${praise.id}`} className="cp-back">← {praise.name}</Link>
      <header className="cp-header">
        <div className="cp-header-main">
          <h1 className="cp-title">{rascunho?.title ?? tituloPadrao(praise)}</h1>
          <div className="cp-number">{material.material_kind_name ?? 'Gestos CIAs'}</div>
        </div>
        <div className="cp-header-actions">
          {pdfDeOrigem?.r2_key ? (
            <a className="cp-source-link" href={getAssetUrl(pdfDeOrigem.r2_key)} target="_blank" rel="noopener noreferrer">
              Abrir PDF de gestos
            </a>
          ) : null}
          <ReviewSwitch material={material} onToggle={toggleReviewed} />
        </div>
      </header>

      {content.status === 'error' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">Falha ao carregar o documento.</div>
          <div className="cp-state-desc">{content.message}</div>
          <button type="button" className="cp-retry" onClick={retry}>Tentar de novo</button>
        </div>
      ) : null}

      {servidor?.status === 'invalido' ? (
        <div className="cp-state cp-state--error">
          <div className="cp-state-title">O documento gravado no servidor é inválido.</div>
          <div className="cp-state-desc">
            <code>{servidor.codigo}</code> em <code>{servidor.caminho || '(raiz)'}</code> — {MENSAGENS[servidor.codigo as keyof typeof MENSAGENS] ?? ''}
          </div>
        </div>
      ) : null}

      {rascunho && servidor && servidor.status !== 'invalido' ? (
        <>
          {isAuthenticated ? (
            <div className="cp-edit-actions">
              <button
                type="button"
                className="cp-edit-save"
                disabled={salvando || !sujo || (modoEdicao === 'raw' ? !!erroSintaxe || !validacao?.ok : !validacao?.ok)}
                onClick={() => void salvar()}
              >
                Salvar
              </button>
              <button type="button" className="ge-btn" disabled={passado.length === 0} onClick={desfazer}>Desfazer</button>
              <button type="button" className="ge-btn" disabled={futuro.length === 0} onClick={refazer}>Refazer</button>
              {erroSintaxe ? (
                <span className="cp-edit-issues" role="status">JSON inválido</span>
              ) : validacao && !validacao.ok ? (
                <span className="cp-edit-issues" role="status">{MENSAGENS[validacao.erro.codigo]}</span>
              ) : null}
              {mensagem ? <span className="cp-edit-issues" role="status" aria-live="polite">{mensagem}</span> : null}
            </div>
          ) : null}

          {isAuthenticated ? (
            <div className="cp-mode-tabs" role="tablist" aria-label="Modo de edição">
              <button
                type="button"
                role="tab"
                aria-selected={modoEdicao === 'visual'}
                className={`cp-mode-tab ${modoEdicao === 'visual' ? 'is-active' : ''}`}
                onClick={() => alternarModo('visual')}
              >
                Visual
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={modoEdicao === 'raw'}
                className={`cp-mode-tab ${modoEdicao === 'raw' ? 'is-active' : ''}`}
                onClick={() => alternarModo('raw')}
              >
                Raw
              </button>
            </div>
          ) : null}

          {conflito ? (
            <div className="cp-conflito">
              <p>Copie o seu documento abaixo antes de recarregar, se quiser aproveitá-lo.</p>
              <textarea readOnly aria-label="Seu documento" value={conflito} rows={8} />
              <button type="button" className="ge-btn" onClick={() => { setGravado(null); setConflito(null); retry(); }}>
                Recarregar
              </button>
            </div>
          ) : null}

          <div className="ge-abas" role="tablist">
            <button type="button" role="tab" aria-selected={aba === 'editor'} className="ge-btn" onClick={() => setAba('editor')}>Editor</button>
            <button type="button" role="tab" aria-selected={aba === 'preview'} className="ge-btn" onClick={() => setAba('preview')}>Pré-visualização</button>
          </div>

          <div className={`ge-layout is-aba-${aba}`}>
            <section className="ge-coluna ge-coluna--editor" aria-label="Editor">
              {isAuthenticated ? (
                modoEdicao === 'raw' ? (
                  <GesturesRawEditor
                    raw={rawDraft}
                    onRawChange={aoMudarRaw}
                    doc={rascunho}
                    indice={indice}
                    foco={foco}
                    onFoco={setFoco}
                    onMudar={aplicar}
                    erroSintaxe={erroSintaxe}
                    erroValidacao={validacao && !validacao.ok ? MENSAGENS[validacao.erro.codigo] : null}
                    abrirSeletor={abrirSeletor}
                    onGestoCriado={(entrada) => setIndice((atual) => (atual ? adicionarAoIndice(atual, entrada) : atual))}
                  />
                ) : (
                  <GesturesEditor
                    doc={rascunho}
                    indice={indice}
                    foco={foco}
                    onFoco={setFoco}
                    onMudar={aplicar}
                    erroNoCaminho={erroNoCaminho}
                    abrirSeletor={abrirSeletor}
                    onGestoCriado={(entrada) => setIndice((atual) => (atual ? adicionarAoIndice(atual, entrada) : atual))}
                  />
                )
              ) : (
                <p className="ge-vazio">Entre com o Google para editar.</p>
              )}
            </section>
            <section className="ge-coluna ge-coluna--preview" aria-label="Pré-visualização">
              <GestureDocumentView doc={rascunho} indice={indice} tamanhoDaFigura={64} emFoco={chaveDoFoco} onClicarCartao={(chave) => setFoco(caminhoDaChave(chave))} />
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
