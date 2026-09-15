import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { GestureEntry, GestureVideo } from '../../lib/gestures/dictionary';
import { formatarTempo, linkNoTempo, parseTempos } from '../../lib/gestures/youtube';
import { deleteGestureVideo, getPraise, putGestureVideo, searchPraises } from '../../services/api';
import type { Praise, PraiseDetail } from '../../types';

type Props = {
  gestureId: string;
  videos: GestureVideo[];
  podeEditar: boolean;
  /** A API devolve a entrada inteira a cada escrita; a página troca a dela. */
  onAlterado: (entrada: GestureEntry) => void;
};

const rotuloDoLouvor = (v: GestureVideo) => `${v.praiseNumber ? `${v.praiseNumber} - ` : ''}${v.praiseName}`;

/**
 * Seção "Vídeos" da página do gesto: em quais vídeos youtube de louvores o
 * gesto aparece e em que segundos. Um item por vídeo; os tempos são chips que
 * abrem o YouTube no momento certo — não há player embutido (decisão da spec).
 */
export function SecaoVideosDoGesto({ gestureId, videos, podeEditar, onAlterado }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const executar = async (acao: () => Promise<GestureEntry>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      onAlterado(await acao());
      setAviso(ok);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'Falha');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="cp-panel">
      <h2 className="cp-panel-title">Vídeos</h2>
      {videos.length === 0 ? (
        <p className="materials-placeholder">Nenhum vídeo ligado a este gesto.</p>
      ) : (
        <ul className="gd-videos">
          {videos.map((v) => (
            <ItemDeVideo
              key={v.materialId}
              video={v}
              podeEditar={podeEditar}
              ocupado={ocupado}
              onSalvarTempos={(seconds) => executar(() => putGestureVideo(gestureId, v.materialId, seconds), 'Tempos salvos.')}
              onDesligar={() => executar(() => deleteGestureVideo(gestureId, v.materialId), 'Vídeo desligado.')}
              onErroLocal={setAviso}
            />
          ))}
        </ul>
      )}
      {podeEditar ? (
        adicionando ? (
          <AdicionarVideo
            jaLigados={new Set(videos.map((v) => v.materialId))}
            ocupado={ocupado}
            onEscolher={(materialId) => {
              setAdicionando(false);
              void executar(() => putGestureVideo(gestureId, materialId, []), 'Vídeo ligado.');
            }}
            onCancelar={() => setAdicionando(false)}
          />
        ) : (
          <button type="button" className="ge-btn" onClick={() => setAdicionando(true)}>Adicionar vídeo</button>
        )
      ) : null}
      {aviso ? <span className="cp-edit-issues" role="status" aria-live="polite">{aviso}</span> : null}
    </section>
  );
}

function ItemDeVideo({ video, podeEditar, ocupado, onSalvarTempos, onDesligar, onErroLocal }: {
  video: GestureVideo;
  podeEditar: boolean;
  ocupado: boolean;
  onSalvarTempos: (seconds: number[]) => Promise<void>;
  onDesligar: () => Promise<void>;
  onErroLocal: (erro: string) => void;
}) {
  // Texto do campo é estado próprio: o que a pessoa digita só vira `seconds` ao salvar.
  const [texto, setTexto] = useState(video.seconds.map(formatarTempo).join(', '));
  const primeiro = video.seconds[0] ?? null;
  const campoId = `gd-tempos-${video.materialId}`;

  return (
    <li className="gd-video">
      <div className="gd-video-cabeca">
        <Link to={`/praise/${video.praiseId}`}>{rotuloDoLouvor(video)}</Link>
        <a href={linkNoTempo(video.url, primeiro)} target="_blank" rel="noopener noreferrer" className="ge-btn">Abrir no YouTube</a>
      </div>
      <div className="gd-video-tempos">
        {video.seconds.length === 0 ? (
          <span className="cp-number">tempos não mapeados</span>
        ) : (
          video.seconds.map((s) => (
            <a key={s} href={linkNoTempo(video.url, s)} target="_blank" rel="noopener noreferrer" className="gd-chip">{formatarTempo(s)}</a>
          ))
        )}
      </div>
      {podeEditar ? (
        <div className="edit-actions">
          <label htmlFor={campoId} className="cp-number">Tempos</label>
          <input id={campoId} aria-label="Tempos" placeholder="1:23, 2:21" value={texto} onChange={(e) => setTexto(e.target.value)} className="ge-input" />
          <button
            type="button"
            className="ge-btn"
            disabled={ocupado}
            onClick={() => {
              const r = parseTempos(texto);
              if (!r.ok) onErroLocal(r.erro);
              else void onSalvarTempos(r.seconds);
            }}
          >
            Salvar tempos
          </button>
          <button type="button" className="ge-btn ge-btn--perigo" disabled={ocupado} onClick={() => void onDesligar()}>Desligar</button>
        </div>
      ) : null}
    </li>
  );
}

/** Busca de louvor → materiais youtube dele → escolhe um. Mesmo `searchPraises` da Home. */
function AdicionarVideo({ jaLigados, ocupado, onEscolher, onCancelar }: {
  jaLigados: Set<string>;
  ocupado: boolean;
  onEscolher: (materialId: string) => void;
  onCancelar: () => void;
}) {
  const [termo, setTermo] = useState('');
  const [louvores, setLouvores] = useState<Praise[]>([]);
  const [escolhido, setEscolhido] = useState<PraiseDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Busca a cada termo digitado; `cancelado` descarta respostas de termos velhos.
  useEffect(() => {
    if (!termo.trim()) return;
    let cancelado = false;
    searchPraises({ query: termo.trim(), limit: 10 })
      .then((r) => { if (!cancelado) setLouvores(r.data); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : 'Falha na busca'); });
    return () => { cancelado = true; };
  }, [termo]);

  const abrirLouvor = async (id: string) => {
    setErro(null);
    try {
      setEscolhido(await getPraise(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao abrir o louvor');
    }
  };
  const youtubes = escolhido?.materials.filter((m) => m.type === 'youtube') ?? [];

  return (
    <div className="gd-adicionar-video">
      <div className="edit-actions">
        <input type="search" aria-label="Buscar louvor" placeholder="Número ou nome do louvor" value={termo} onChange={(e) => setTermo(e.target.value)} className="ge-picker-busca" autoFocus />
        <button type="button" className="ge-btn" onClick={onCancelar}>Cancelar</button>
      </div>
      {louvores.length > 0 ? (
        <ul className="gd-lista-louvores">
          {louvores.map((p) => (
            <li key={p.id}>
              <button type="button" className="ge-btn" aria-pressed={escolhido?.id === p.id} onClick={() => void abrirLouvor(p.id)}>
                {p.number ? `${p.number} - ` : ''}{p.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {escolhido ? (
        youtubes.length === 0 ? (
          <p className="materials-placeholder">Este louvor não tem vídeo do YouTube.</p>
        ) : (
          <ul className="gd-lista-louvores">
            {youtubes.map((m) => {
              const ligado = jaLigados.has(m.id);
              return (
                <li key={m.id}>
                  <button type="button" className="ge-btn" disabled={ocupado || ligado} onClick={() => onEscolher(m.id)}>
                    {m.material_kind_name || m.url || m.id}{ligado ? ' · já ligado' : ''}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
      {erro ? <span className="cp-review-error" role="status">{erro}</span> : null}
    </div>
  );
}
