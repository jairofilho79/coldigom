import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflitoDeGravacao, DocumentoRecusado, createGesture, createMaterial, getGestureDictionary, putGesturesContent, replaceGesture, updateGesture,
} from '../services/api';
import type { GestureDocument } from '../lib/gestures/schema';

const mockFetch = vi.fn();
const DOC: GestureDocument = {
  schema: 'coldigom.gestures/1', title: 'X', dictionaryVersion: 1,
  items: [{ type: 'gesture', gestureId: '000000000001', lyrics: [{ trigger: 'a', text: '' }] }],
};

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const resposta = (status: number, corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('putGesturesContent', () => {
  it('manda o documento como JSON com If-Match e devolve o ETag novo', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true }, { ETag: '"v2"' }));
    const r = await putGesturesContent('m1', DOC, '"v1"');
    expect(r).toEqual({ etag: '"v2"' });
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/materials\/m1\/content$/);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('"v1"');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual(DOC);
  });

  it('sem etag (documento novo) não manda If-Match', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true }));
    await putGesturesContent('m1', DOC, null);
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['If-Match']).toBeUndefined();
  });

  it('409 stale_write e 412 viram ConflitoDeGravacao', async () => {
    mockFetch.mockResolvedValueOnce(resposta(409, { error: 'mudou', code: 'stale_write' }));
    await expect(putGesturesContent('m1', DOC, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);
    mockFetch.mockResolvedValueOnce(new Response('', { status: 412 }));
    await expect(putGesturesContent('m1', DOC, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);
  });

  it('400 com code e path vira DocumentoRecusado, com a frase do servidor', async () => {
    mockFetch.mockResolvedValueOnce(resposta(400, { error: 'Tipo de item desconhecido neste ponto do documento.', code: 'tipo_desconhecido', path: 'items[2]' }));
    const erro = await putGesturesContent('m1', DOC, null).catch((e) => e);
    expect(erro).toBeInstanceOf(DocumentoRecusado);
    expect(erro.code).toBe('tipo_desconhecido');
    expect(erro.path).toBe('items[2]');
    expect(erro.message).toBe('Tipo de item desconhecido neste ponto do documento.');
  });

  it('401 renova a sessão e repete uma vez', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(resposta(200, { accessToken: 'a', refreshToken: 'r' }))
      .mockResolvedValueOnce(resposta(200, { ok: true }, { ETag: '"v9"' }));
    const r = await putGesturesContent('m1', DOC, null);
    expect(r.etag).toBe('"v9"');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('outros erros viram Error com a mensagem traduzida', async () => {
    mockFetch.mockResolvedValueOnce(resposta(404, { error: 'Material not found' }));
    await expect(putGesturesContent('m1', DOC, null)).rejects.toThrow(/não existe mais/);
  });
});

describe('dicionário', () => {
  it('getGestureDictionary devolve o corpo inteiro', async () => {
    const dic = { schema: 'coldigom.gesture-dictionary/1', version: 3, generatedAt: 't', gestures: [] };
    mockFetch.mockResolvedValueOnce(resposta(200, dic));
    expect(await getGestureDictionary()).toEqual(dic);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/\/api\/gestures\/dictionary$/);
    expect((mockFetch.mock.calls[0][1] as RequestInit).cache).toBe('no-cache');
  });

  it('createGesture manda multipart com os campos e a figura', async () => {
    mockFetch.mockResolvedValueOnce(resposta(201, { data: { id: 'abcdefabcdef' } }));
    const png = new File(['x'], 'g.png', { type: 'image/png' });
    const r = await createGesture({ name: 'Quero', exampleTriggers: ['Quero'], image: png });
    expect(r.id).toBe('abcdefabcdef');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Quero');
    expect(form.get('exampleTriggers')).toBe('["Quero"]');
    expect(form.get('image')).toBe(png);
    expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('updateGesture faz PATCH em JSON e replaceGesture manda targetId e rewriteDocuments', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { data: { id: 'a' } }));
    await updateGesture('a', { name: 'Novo' });
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
    mockFetch.mockResolvedValueOnce(resposta(200, { ok: true, reescritos: 2, falhas: [] }));
    const r = await replaceGesture('a', 'b', true);
    expect(r.reescritos).toBe(2);
    expect(JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string)).toEqual({ targetId: 'b', rewriteDocuments: true });
  });
});

describe('createMaterial com source_material_id', () => {
  it('repassa source_material_id no corpo', async () => {
    mockFetch.mockResolvedValueOnce(resposta(200, { data: { id: 'p1', materials: [] } }));
    await createMaterial('p1', { material_kind: 'k', type: 'gestures', source_material_id: 'pdf-1' });
    expect(JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ material_kind: 'k', type: 'gestures', source_material_id: 'pdf-1' });
  });
});
