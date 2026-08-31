import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialInlineAdmin } from './MaterialInlineAdmin';
import type { Material } from '../types';
import type { SelectOption } from './selectTypes';

const VOLUME_KEY = 'audio-volume';

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 0.8;
  try {
    if (typeof localStorage.getItem !== 'function') return 0.8;
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return 0.8;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 0.8;
    return Math.min(1, Math.max(0, n));
  } catch {
    return 0.8;
  }
}

type Props = {
  materials: Material[];
  getAssetUrl: (key: string) => string;
  admin?: {
    materialKindOptions: SelectOption[];
    saving: boolean;
    onUpdateKind: (materialId: string, kind: string) => Promise<void>;
    onDelete: (materialId: string) => Promise<void>;
  };
};

export function AudioPlayer({ materials, getAssetUrl, admin }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wasPlayingRef = useRef(false);

  // A faixa é identificada pelo id, não pela posição: a lista encolhe embaixo
  // do player quando o usuário remove um material, e um índice guardado apontava
  // para o vazio (player inteiro sumia) ou para a faixa errada (trocava sozinho).
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readStoredVolume);
  const [isMuted, setIsMuted] = useState(false);

  // Se a faixa escolhida saiu da lista, cai na primeira em vez de sumir.
  const current = materials.find(m => m.id === currentId) ?? materials[0];
  const src = current?.r2_key ? getAssetUrl(current.r2_key) : '';
  const trackName = current?.material_kind_name || 'Áudio';
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const fillPct =
    safeDuration > 0
      ? `${(Math.min(Number.isFinite(currentTime) ? currentTime : 0, safeDuration) / safeDuration) * 100}%`
      : '0%';

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (typeof localStorage.setItem === 'function') {
        localStorage.setItem(VOLUME_KEY, String(volume));
      }
    } catch {
      /* ignore quota / private mode */
    }
  }, [volume]);

  const handleLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration);
    setCurrentTime(a.currentTime);
    if (wasPlayingRef.current) {
      void a.play().catch(() => {
        /* ignore autoplay block / decode errors */
      });
      wasPlayingRef.current = false;
    }
  }, []);

  /** O navegador recomeça a carregar quando o src troca — zera o relógio junto. */
  const handleLoadStart = useCallback(() => {
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (a) setCurrentTime(a.currentTime);
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, []);

  const onSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) {
      a.currentTime = v;
      setCurrentTime(v);
    }
  }, []);

  const onVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) {
      setVolume(v);
      if (v > 0 && isMuted) setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted(m => !m);
  }, []);

  const selectTrack = useCallback(
    (materialId: string) => {
      if (materialId === current?.id) return;
      wasPlayingRef.current = isPlaying;
      setCurrentId(materialId);
      // Zerar o relógio é consequência do gesto, não sincronia com sistema
      // externo: num efeito isso virava render em cascata a cada troca de faixa.
      setCurrentTime(0);
      setDuration(0);
    },
    [current?.id, isPlaying]
  );

  if (!current) return null;

  return (
    <div className="audio-player-card">
      <audio
        ref={audioRef}
        className="audio-player-element"
        src={src}
        preload="metadata"
        onLoadStart={handleLoadStart}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        aria-label={trackName}
      />
      <div className="audio-player-header">
        {admin ? (
          <MaterialInlineAdmin
            material={current}
            options={admin.materialKindOptions}
            saving={admin.saving}
            onUpdateKind={admin.onUpdateKind}
            onDelete={admin.onDelete}
          />
        ) : (
          <span className="audio-player-track-name">{trackName}</span>
        )}
        <span className="audio-player-type-badge">MP3</span>
      </div>

      <div className="audio-player-row">
        <button
          type="button"
          className="audio-player-btn"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pausar' : 'Tocar'}
        >
          {isPlaying ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="audio-player-timeline">
          <span className="audio-player-time" aria-hidden>
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            className="audio-player-progress"
            min={0}
            max={safeDuration || 1}
            step="0.1"
            value={Number.isFinite(currentTime) ? Math.min(currentTime, safeDuration || 0) : 0}
            onChange={onSeek}
            disabled={!safeDuration}
            aria-label="Posição do áudio"
            style={{ ['--audio-fill' as string]: fillPct }}
          />
          <span className="audio-player-time" aria-hidden>
            {formatTime(safeDuration)}
          </span>
        </div>
      </div>

      <div className="audio-player-volume" role="group" aria-label="Volume">
        <button
          type="button"
          className="audio-player-btn audio-player-btn--ghost"
          onClick={toggleMute}
          aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
        >
          {isMuted || volume === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5Z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5Z" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
        <input
          type="range"
          className="audio-player-progress audio-player-progress--volume"
          min={0}
          max={1}
          step="0.01"
          value={volume}
          // Só o onVolumeChange decide sobre o mudo: havia um segundo caminho
          // aqui que desmutava até ao arrastar o volume para zero.
          onChange={onVolumeChange}
          aria-label="Nível de volume"
        />
      </div>

      {materials.length > 1 && (
        <ul className="audio-track-list" aria-label="Faixas de áudio">
          {materials.map(m => {
            const isActive = m.id === current.id;
            const name = m.material_kind_name || 'Áudio';
            return (
              <li
                key={m.id}
                className={`audio-track-item${isActive ? ' is-active' : ''}`}
              >
                <div className="audio-track-item-main">
                  <button
                    type="button"
                    className="audio-track-select"
                    onClick={() => selectTrack(m.id)}
                  >
                    <span className="audio-track-icon" aria-hidden>
                      {isActive && isPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </span>
                    {!admin ? <span className="audio-track-label">{name}</span> : null}
                  </button>
                  {admin ? (
                    <MaterialInlineAdmin
                      material={m}
                      options={admin.materialKindOptions}
                      saving={admin.saving}
                      onUpdateKind={admin.onUpdateKind}
                      onDelete={admin.onDelete}
                    />
                  ) : null}
                  {m.r2_key && (
                    <a
                      className="audio-track-open"
                      href={getAssetUrl(m.r2_key)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      aria-label="Abrir em nova aba"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
