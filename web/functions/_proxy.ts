/** Proxy Pages → Worker so auth cookies are first-party on coldigom-web.pages.dev (Safari/iPhone). */

export const API_ORIGIN = 'https://coldigom-api.jairofilho79.workers.dev';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-proto',
  'x-real-ip',
]);

/** fetch() merges Set-Cookie; split on our cookie name prefix. */
function splitSetCookieHeader(raw: string): string[] {
  return raw.split(/,\s*(?=coldigom_)/).filter(Boolean);
}

function readSetCookies(upstream: Response): string[] {
  if (typeof upstream.headers.getSetCookie === 'function') {
    const list = upstream.headers.getSetCookie();
    if (list.length > 1) return list;
    if (list.length === 1 && list[0].includes(', coldigom_')) {
      return splitSetCookieHeader(list[0]);
    }
    if (list.length === 1) return list;
  }
  const raw = upstream.headers.get('set-cookie');
  if (!raw) return [];
  if (raw.includes(', coldigom_')) return splitSetCookieHeader(raw);
  return [raw];
}

function copyResponseHeaders(upstream: Response, outHeaders: Headers): void {
  for (const cookie of readSetCookies(upstream)) {
    outHeaders.append('Set-Cookie', cookie);
  }

  for (const [k, v] of upstream.headers) {
    const key = k.toLowerCase();
    if (key === 'set-cookie') continue;
    if (key === 'content-encoding' || key === 'content-length') continue;
    if (key.startsWith('access-control-')) continue;
    outHeaders.append(k, v);
  }
}

export async function proxyToApi(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, API_ORIGIN);

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    headers.set(k, v);
  }
  if (!headers.has('origin') && incoming.origin) {
    headers.set('origin', incoming.origin);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(target.toString(), init);
  const outHeaders = new Headers();
  copyResponseHeaders(upstream, outHeaders);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
