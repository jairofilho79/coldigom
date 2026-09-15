import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { GestureEntry, GestureVideo } from '../../lib/gestures/dictionary';
import { formatarTempo, linkNoTempo, parseTempos } from '../../lib/gestures/youtube';
import { deleteGestureVideo, putGestureVideo } from '../../services/api';

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
