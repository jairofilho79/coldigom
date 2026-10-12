/**
 * Contrato do `payload` de POST /api/contributions (spec §3.1 e §4.2).
 * Validação por forma: o servidor não confia em nada que o formulário já
 * checou — o formulário é só conveniência.
 */
export const KINDS = ['bug', 'wrong_info', 'content', 'improvement', 'other'] as const;
export type Kind = (typeof KINDS)[number];

export const SUBKINDS: Record<Kind, readonly string[]> = {
  bug: ['screen', 'reader', 'audio', 'search', 'offline', 'login', 'playlist_live', 'other'],
  wrong_info: ['metadata', 'lyrics', 'wrong_material', 'wrong_kind', 'duplicate'],
  content: ['add_material', 'add_praise', 'replace_material', 'remove'],
  improvement: ['feature', 'behavior'],
  other: [],
};

export const METADATA_FIELDS = ['title', 'number', 'author', 'tonality', 'rhythm', 'category', 'tags'] as const;
export const LINK_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'drive.google.com', 'docs.google.com'] as const;
export const SOURCES = ['coldigom', 'plpcg'] as const;

export const MAX_TITLE = 120;
export const MAX_BODY = 4000;
export const MAX_LINKS = 5;
export const MAX_FIELDS_BYTES = 16 * 1024;
export const MAX_DEVICE_BYTES = 16 * 1024;

const TRACKING_PARAMS = new Set(['si', 'feature']);

export type ContributionPayload = {
  kind: Kind;
  subkind: string | null;
  target: { source: (typeof SOURCES)[number]; praiseId: string | null; materialId: string | null } | null;
  title: string;
  body: string;
  fields: Record<string, unknown>;
  links: string[];
  device: Record<string, unknown> | null;
  appRoute: string | null;
  appVersion: string | null;
};

export type SchemaResult =
  | { ok: true; payload: ContributionPayload }
  | { ok: false; error: string; detail?: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optString(v: unknown, max = 512): string | null {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null;
}

/** `https` + host permitido; tira parâmetros de rastreio para o hash/dedupe ser estável. */
export function normalizeLink(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (!(LINK_HOSTS as readonly string[]).includes(url.hostname)) return null;
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

function validFields(kind: Kind, subkind: string | null, fields: Record<string, unknown>): boolean {
  if (kind === 'wrong_info' && subkind === 'metadata') {
    return (
      typeof fields.field === 'string' &&
      (METADATA_FIELDS as readonly string[]).includes(fields.field) &&
      typeof fields.proposed === 'string' && fields.proposed.trim().length > 0 &&
      (fields.current === undefined || typeof fields.current === 'string')
    );
  }
  if (kind === 'wrong_info' && subkind === 'duplicate') {
    return (
      typeof fields.otherPraiseId === 'string' && fields.otherPraiseId.length > 0 &&
      typeof fields.otherSource === 'string' && (SOURCES as readonly string[]).includes(fields.otherSource)
    );
  }
  if (kind === 'content') {
    return (
      (fields.suggestedKindId === undefined || typeof fields.suggestedKindId === 'string') &&
      (fields.suggestedType === undefined || (typeof fields.suggestedType === 'string' && /^[a-z0-9]{1,16}$/.test(fields.suggestedType)))
    );
  }
  return true;
}

export function deriveTitle(body: string): string {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const text = lines[0] ?? '';
  if (text.length < 3) {
    return 'Contribuição';
  }
  if (text.length > 80) {
    return `${text.slice(0, 77)}...`;
  }
  return text;
}

export function parsePayload(raw: unknown): SchemaResult {
  if (!isRecord(raw)) return { ok: false, error: 'invalid_payload' };

  let k: Kind = 'other';
  if (raw.kind !== undefined && raw.kind !== null) {
    if (typeof raw.kind !== 'string' || !(KINDS as readonly string[]).includes(raw.kind as Kind)) {
      return { ok: false, error: 'invalid_kind' };
    }
    k = raw.kind as Kind;
  }

  let subkind: string | null = null;
  if (raw.subkind !== undefined && raw.subkind !== null) {
    if (typeof raw.subkind !== 'string' || !SUBKINDS[k].includes(raw.subkind)) {
      return { ok: false, error: 'invalid_subkind' };
    }
    subkind = raw.subkind;
  }

  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!body) return { ok: false, error: 'body_required' };
  if (body.length > MAX_BODY) return { ok: false, error: 'body_too_long' };

  let title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    title = deriveTitle(body);
  } else if (title.length > MAX_TITLE) {
    return { ok: false, error: 'title_too_long' };
  }

  let target: ContributionPayload['target'] = null;
  if (raw.target != null) {
    if (!isRecord(raw.target) || typeof raw.target.source !== 'string' || !(SOURCES as readonly string[]).includes(raw.target.source)) {
      return { ok: false, error: 'invalid_target' };
    }
    target = {
      source: raw.target.source as (typeof SOURCES)[number],
      praiseId: optString(raw.target.praiseId),
      materialId: optString(raw.target.materialId),
    };
  }

  const fields = isRecord(raw.fields) ? raw.fields : {};
  // Teto de tamanho antes de qualquer outra checagem: `fields` é livre (cada
  // kind tem seu próprio formato) e um objeto absurdo não pode custar memória
  // nem virar uma linha gigante em D1 só porque passou pelo `isRecord`.
  if (JSON.stringify(fields).length > MAX_FIELDS_BYTES) return { ok: false, error: 'fields_too_large' };
  if (!validFields(k, subkind, fields)) return { ok: false, error: 'invalid_fields' };

  const links: string[] = [];
  if (raw.links != null) {
    if (!Array.isArray(raw.links)) return { ok: false, error: 'invalid_links' };
    if (raw.links.length > MAX_LINKS) return { ok: false, error: 'too_many_links' };
    for (const item of raw.links) {
      if (typeof item !== 'string') return { ok: false, error: 'invalid_links' };
      const normalized = normalizeLink(item);
      if (!normalized) return { ok: false, error: 'link_host_not_allowed', detail: item };
      links.push(normalized);
    }
  }

  let device: Record<string, unknown> | null = null;
  if (raw.device !== undefined && raw.device !== null) {
    if (!isRecord(raw.device)) return { ok: false, error: 'invalid_device' };
    if (JSON.stringify(raw.device).length > MAX_DEVICE_BYTES) return { ok: false, error: 'device_too_large' };
    device = raw.device;
  }

  return {
    ok: true,
    payload: {
      kind: k, subkind, target, title, body, fields, links, device,
      appRoute: optString(raw.appRoute, 1024),
      appVersion: optString(raw.appVersion, 64),
    },
  };
}
