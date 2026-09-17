/**
 * Google Safe Browsing Lookup v4 para os links (YouTube/Drive) de uma
 * contribuição. É a única checagem de link além da allowlist de hosts —
 * o Drive só é baixado na peça D, depois da aprovação.
 */
export type LinkVerdict = 'clean' | 'unsafe' | 'adiado';
export type LinkChecker = (urls: string[]) => Promise<Record<string, LinkVerdict>>;

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

function all(urls: string[], verdict: LinkVerdict): Record<string, LinkVerdict> {
  return Object.fromEntries(urls.map((u) => [u, verdict]));
}

export function safeBrowsingChecker(apiKey: string | undefined, fetchFn: typeof fetch = fetch): LinkChecker {
  return async (urls) => {
    if (urls.length === 0) return {};
    // Sem chave: em dev é normal; em produção o consumer loga e adia — nunca libera.
    if (!apiKey) return all(urls, 'adiado');
    let res: Response;
    try {
      res = await fetchFn(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client: { clientId: 'coldigom', clientVersion: '1.0' },
          threatInfo: {
            threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: urls.map((url) => ({ url })),
          },
        }),
      });
    } catch {
      return all(urls, 'adiado');
    }
    if (!res.ok) return all(urls, 'adiado');
    let body: { matches?: { threat?: { url?: string } }[] };
    try {
      // Corpo 200 mas não-JSON (ex.: página de erro do proxy) também é adiado — nunca lança.
      body = (await res.json()) as { matches?: { threat?: { url?: string } }[] };
    } catch {
      return all(urls, 'adiado');
    }
    const unsafe = new Set((body.matches ?? []).map((m) => m.threat?.url).filter((u): u is string => !!u));
    return Object.fromEntries(urls.map((u) => [u, unsafe.has(u) ? 'unsafe' : 'clean']));
  };
}
