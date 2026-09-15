/**
 * Links e tempos de vídeo do YouTube — funções puras da seção "Vídeos" da
 * página do gesto. Sem player embutido: o clique abre o YouTube no segundo
 * certo (`t=`), que é o único parâmetro de posição que a URL aceita.
 */

const ID = /^[A-Za-z0-9_-]{6,}$/;

function idDoVideo(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.slice('/shorts/'.length).split('/')[0];
  }
  return id && ID.test(id) ? id : null;
}

/** URL canônica do vídeo no segundo dado; sem tempo, só o vídeo. URL desconhecida volta intacta. */
export function linkNoTempo(url: string, seconds: number | null): string {
  const id = idDoVideo(url);
  if (!id) return url;
  return `https://www.youtube.com/watch?v=${id}${seconds === null ? '' : `&t=${seconds}s`}`;
}

/** 83 → "1:23"; 3661 → "1:01:01". */
export function formatarTempo(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type Tempos = { ok: true; seconds: number[] } | { ok: false; erro: string };

function segundosDe(pedaco: string): number | null {
  if (/^\d+$/.test(pedaco)) return Number(pedaco);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(pedaco);
  if (!m) return null;
  const [, h, mm, ss] = m;
  if (Number(mm) > 59 || Number(ss) > 59) return null;
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss);
}

/** "1:23, 141; 2:21" → [83, 141] ordenado e sem repetição. Separa por vírgula, ponto-e-vírgula ou quebra de linha. */
export function parseTempos(texto: string): Tempos {
  const pedacos = texto.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const seconds: number[] = [];
  for (const p of pedacos) {
    const s = segundosDe(p);
    if (s === null) return { ok: false, erro: `Tempo inválido: "${p}"` };
    seconds.push(s);
  }
  return { ok: true, seconds: [...new Set(seconds)].sort((a, b) => a - b) };
}
