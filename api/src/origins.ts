/**
 * Origens confiáveis e destinos de redirect.
 *
 * WEB_ORIGIN é um CSV que aceita curinga de subdomínio (`https://*plpcg.com`),
 * porque a API atende a SPA do coldigom e também o PLPCG.
 */

export function parseWebOrigins(webOrigin: string | undefined): string[] {
  if (!webOrigin) return [];
  return webOrigin.split(',').map((s) => s.trim()).filter(Boolean);
}

export function primaryWebOrigin(webOrigin: string | undefined): string | undefined {
  return parseWebOrigins(webOrigin)[0];
}

export function parseOriginEntry(entry: string): { protocol?: string; hostname: string; wildcard: boolean } | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  if (!trimmed.includes('://')) {
    const wildcard = trimmed.startsWith('*');
    return { hostname: wildcard ? trimmed.slice(1) : trimmed, wildcard };
  }

  try {
    const url = new URL(trimmed);
    const wildcard = url.hostname.startsWith('*');
    return {
      protocol: url.protocol,
      hostname: wildcard ? url.hostname.slice(1) : url.hostname,
      wildcard,
    };
  } catch {
    return null;
  }
}

export function hostnameMatchesBaseDomain(hostname: string, baseDomain: string): boolean {
  return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
}

export function isTrustedWebOrigin(origin: string, entry: string): boolean {
  if (origin === entry) return true;

  const parsed = parseOriginEntry(entry);
  if (!parsed) return false;

  try {
    const o = new URL(origin);
    if (parsed.protocol && o.protocol !== parsed.protocol) return false;

    if (parsed.wildcard) {
      return hostnameMatchesBaseDomain(o.hostname, parsed.hostname);
    }

    return hostnameMatchesBaseDomain(o.hostname, parsed.hostname);
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | undefined, webOrigin: string | undefined): boolean {
  if (!webOrigin) return true;
  if (!origin) return false;
  return parseWebOrigins(webOrigin).some((entry) => isTrustedWebOrigin(origin, entry));
}

export function corsAllowOrigin(origin: string | undefined, webOrigin: string | undefined): string {
  if (!webOrigin) return origin || '*';
  if (!origin || !isOriginAllowed(origin, webOrigin)) return '';
  return origin;
}

/** Keep post-login redirect on the canonical site (path only), never a preview deployment URL. */
export function sanitizePostLoginRedirect(raw: string | undefined, webOrigin: string | undefined): string {
  if (!raw || raw === '/') return '/';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    const path = `${u.pathname}${u.search}${u.hash}` || '/';
    const origins = parseWebOrigins(webOrigin);
    if (origins.length === 0) return path;
    for (const entry of origins) {
      if (isTrustedWebOrigin(u.origin, entry)) return path;
    }
  } catch {
    /* fall through */
  }
  return '/';
}

/**
 * Mantém o destino dentro do site. Diferente de sanitizePostLoginRedirect, preserva
 * a URL absoluta quando a origem é confiável — o retorno do Drive depende disso,
 * e reduzir a caminho relativo mandaria o usuário para a origem da API.
 */
export function sanitizeTrustedRedirect(
  raw: string | undefined,
  webOrigin: string | undefined,
  fallback: string
): string {
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    for (const entry of parseWebOrigins(webOrigin)) {
      if (isTrustedWebOrigin(u.origin, entry)) return raw;
    }
  } catch {
    /* cai no fallback */
  }
  return fallback;
}
