import { describe, expect, it, vi } from 'vitest';

import { safeBrowsingChecker } from '../contributions/links';

const URLS = ['https://youtu.be/a', 'https://drive.google.com/file/d/1/view'];

function fetchWith(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe('safeBrowsingChecker', () => {
  it('sem chave → tudo adiado, sem chamar a rede', async () => {
    const f = fetchWith(200, {});
    const out = await safeBrowsingChecker(undefined, f)(URLS);
    expect(out).toEqual({ 'https://youtu.be/a': 'adiado', 'https://drive.google.com/file/d/1/view': 'adiado' });
    expect(f).not.toHaveBeenCalled();
  });

  it('resposta vazia → clean; manda threatTypes e as URLs', async () => {
    const f = fetchWith(200, {});
    const out = await safeBrowsingChecker('k', f)(URLS);
    expect(out).toEqual({ 'https://youtu.be/a': 'clean', 'https://drive.google.com/file/d/1/view': 'clean' });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://safebrowsing.googleapis.com/v4/threatMatches:find');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('k');
    const body = JSON.parse(init.body as string);
    expect(body.threatInfo.threatTypes).toEqual(['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']);
    expect(body.threatInfo.threatEntries).toEqual(URLS.map((u) => ({ url: u })));
  });

  it('match marca só a URL citada', async () => {
    const f = fetchWith(200, { matches: [{ threatType: 'MALWARE', threat: { url: 'https://youtu.be/a' } }] });
    const out = await safeBrowsingChecker('k', f)(URLS);
    expect(out['https://youtu.be/a']).toBe('unsafe');
    expect(out['https://drive.google.com/file/d/1/view']).toBe('clean');
  });

  it('429/5xx/rede → adiado', async () => {
    expect(await safeBrowsingChecker('k', fetchWith(429, {}))(URLS)).toEqual({ 'https://youtu.be/a': 'adiado', 'https://drive.google.com/file/d/1/view': 'adiado' });
    const boom = vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    expect((await safeBrowsingChecker('k', boom)(URLS))['https://youtu.be/a']).toBe('adiado');
  });

  it('lista vazia não chama a rede', async () => {
    const f = fetchWith(200, {});
    expect(await safeBrowsingChecker('k', f)([])).toEqual({});
    expect(f).not.toHaveBeenCalled();
  });

  it('200 com corpo não-JSON → adiado, não lança', async () => {
    const f = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
    const out = await safeBrowsingChecker('k', f)(URLS);
    expect(out).toEqual({ 'https://youtu.be/a': 'adiado', 'https://drive.google.com/file/d/1/view': 'adiado' });
  });
});
