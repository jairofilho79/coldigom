import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createPraise,
  updatePraise,
  groupPraise,
  addPraiseTag,
  removePraiseTag,
  createMaterial,
  updateMaterial,
  putMaterialContent,
  deleteMaterial,
  getDriveConnectUrl,
  getDriveStatus,
  startDriveScan,
  startDriveImport,
  downloadDriveFileBlob,
  getImportJob,
  retryFailedImportItems,
  createTag,
  mergePraises,
  listValidationFindings,
  decideValidationFinding,
  bulkDecideValidationFindings,
  getMe,
  logout,
  getGestureDictionary,
  getGesture,
  getGestureUsageCounts,
  getGestureUsage,
  createGesture,
  updateGesture,
  uploadGestureImage,
  putGestureVideo,
  deleteGestureVideo,
  replaceGesture,
  putGesturesContent,
  ConflitoDeGravacao,
  DocumentoRecusado,
  getLoginRedirectPath,
  getLoginUrl,
  exchangeAuthCode,
  refreshSession,
  setAuthTokens,
  clearAuthTokens,
} from '../services/api';
import type { PraiseDetail } from '../types';
import type { GestureDocument } from '../lib/gestures/schema';

// Mesmo padrão de api.test.ts: fetch global falso, sem vi.mock do módulo sob teste.
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
const withCreds = expect.objectContaining({ credentials: 'include' });

const mockPraiseDetail: PraiseDetail = {
  id: 'p1',
  name: 'Grande Deus',
  number: '001',
  author: null,
  rhythm: null,
  tonality: null,
  category: null,
  lyrics: null,
  group_id: null,
  tag_ids: '',
  tag_names: '',
  tags: [],
  materials: [],
  group_members: [],
};

function okComData(data: unknown) {
  return { ok: true, json: () => Promise.resolve({ data }) };
}

describe('API Service — escritas de louvor e material', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('createPraise envia POST com o corpo serializado', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    const result = await createPraise({ name: 'Grande Deus' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/praises'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Grande Deus' }) })
    );
    expect(result.name).toBe('Grande Deus');
  });

  it('updatePraise manda PATCH sem if_updated_at quando ele não é passado', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await updatePraise('p1', { name: 'Novo nome' });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Novo nome' });
  });

  it('updatePraise inclui if_updated_at quando informado, para a API recusar escrita concorrente', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await updatePraise('p1', { name: 'Novo nome' }, '2026-01-01T00:00:00.000Z');
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: 'Novo nome', if_updated_at: '2026-01-01T00:00:00.000Z' });
  });

  it('groupPraise envia o id do louvor alvo', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await groupPraise('p1', 'p2');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/praises/p1/group');
    expect(JSON.parse(init.body)).toEqual({ praise_id: 'p2' });
  });

  it('addPraiseTag e removePraiseTag chamam os endpoints certos', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await addPraiseTag('p1', 'tag1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/praises/p1/tags'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ tag_id: 'tag1' }) })
    );

    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await removePraiseTag('p1', 'tag1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/praises/p1/tags/tag1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('createMaterial, updateMaterial e deleteMaterial usam os verbos e corpos certos', async () => {
    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await createMaterial('p1', { material_kind: 'kind1', type: 'pdf', url: 'https://x' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/praises/p1/materials'),
      expect.objectContaining({ method: 'POST' })
    );

    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await updateMaterial('mat1', { is_reviewed: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/materials/mat1'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ is_reviewed: true }) })
    );

    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await updateMaterial('mat1', { praise_id: 'p2' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/materials/mat1'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ praise_id: 'p2' }) })
    );

    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await deleteMaterial('mat1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/materials/mat1'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('putMaterialContent grava o .chord como texto puro e devolve o corpo', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) });
    const result = await putMaterialContent('mat1', '{title: Grande Deus}');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/materials/mat1/content'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'content-type': 'text/plain; charset=utf-8' }),
        body: '{title: Grande Deus}',
      })
    );
    expect(result).toEqual({ ok: true });
  });

  it('createTag e mergePraises', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'tag1', name: 'Nova', parent_id: null } }) });
    const tag = await createTag({ name: 'Nova' });
    expect(tag.id).toBe('tag1');

    mockFetch.mockResolvedValueOnce(okComData(mockPraiseDetail));
    await mergePraises('p1', {
      source_praise_id: 'p2',
      metadata: { name: 'X', number: null, author: null, rhythm: null, tonality: null, category: null, lyrics: null },
      tag_ids: [],
      material_ids_to_import: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/praises/p1/merge'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('API Service — Google Drive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('getDriveConnectUrl monta a URL de autorização com o redirect', () => {
    const url = getDriveConnectUrl('/praise/p1');
    expect(url).toContain('/auth/drive/connect?');
    expect(url).toContain(encodeURIComponent('/praise/p1'));
  });

  it('getDriveStatus consulta se o Drive está conectado', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ connected: true }) });
    const result = await getDriveStatus();
    expect(result).toEqual({ connected: true });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/drive/status'), withCreds);
  });

  it('startDriveScan manda o link da pasta e devolve os arquivos mapeados', async () => {
    mockFetch.mockResolvedValueOnce(
      okComData({ id: 'scan1', status: 'done', files: [], skipped: [] })
    );
    const result = await startDriveScan('https://drive.google.com/drive/folders/x');
    expect(result.id).toBe('scan1');
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ url: 'https://drive.google.com/drive/folders/x' });
  });

  it('startDriveImport envia os itens escolhidos para importação', async () => {
    mockFetch.mockResolvedValueOnce(
      okComData({ id: 'job1', praise_id: 'p1', status: 'queued', total_count: 1, done_count: 0, failed_count: 0, skipped_count: 0 })
    );
    const items = [{ drive_file_id: 'd1', material_kind: 'kind1', type: 'pdf' }];
    const result = await startDriveImport('p1', items);
    expect(result.id).toBe('job1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/praises/p1/materials/drive-import');
    expect(JSON.parse(init.body)).toEqual({ items });
  });

  it('getImportJob e retryFailedImportItems consultam e retentam pelo id do job', async () => {
    mockFetch.mockResolvedValueOnce(
      okComData({ id: 'job1', praise_id: 'p1', status: 'running', total_count: 2, done_count: 1, failed_count: 0, skipped_count: 0 })
    );
    const job = await getImportJob('job1');
    expect(job.status).toBe('running');

    mockFetch.mockResolvedValueOnce(okComData({ retried: 2 }));
    const retried = await retryFailedImportItems('job1');
    expect(retried).toEqual({ retried: 2 });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/import-jobs/job1/retry-failed'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('downloadDriveFileBlob devolve o blob quando a resposta é ok', async () => {
    const blob = new Blob(['conteudo']);
    mockFetch.mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(blob) });
    const result = await downloadDriveFileBlob('file-1');
    expect(result).toBe(blob);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/drive/files/file-1/download'),
      withCreds
    );
  });

  it('downloadDriveFileBlob usa a mensagem de erro do JSON quando a resposta falha', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: 'Arquivo não encontrado no Drive' })),
    });
    await expect(downloadDriveFileBlob('file-1')).rejects.toThrow('Arquivo não encontrado no Drive');
  });

  it('downloadDriveFileBlob cai para o texto puro quando a resposta de erro não é JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('erro cru do servidor'),
    });
    await expect(downloadDriveFileBlob('file-1')).rejects.toThrow('erro cru do servidor');
  });

  it('downloadDriveFileBlob cai para a mensagem genérica quando não há corpo nenhum', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve(''),
    });
    await expect(downloadDriveFileBlob('file-1')).rejects.toThrow(/Falha ao baixar arquivo do Drive \(503\)/);
  });
});

describe('API Service — fila de validação', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('listValidationFindings monta a query com os filtros informados', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }),
    });
    await listValidationFindings({ detector: 'audio', confidence: 'alta', status: 'pendente', praise_id: 'p1', page: 2, limit: 10 });
    const url = new URL(mockFetch.mock.calls[0][0] as string);
    expect(url.searchParams.get('detector')).toBe('audio');
    expect(url.searchParams.get('confidence')).toBe('alta');
    expect(url.searchParams.get('status')).toBe('pendente');
    expect(url.searchParams.get('praise_id')).toBe('p1');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
  });

  it('decideValidationFinding e bulkDecideValidationFindings enviam a decisão', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { id: 'f1' } }) });
    const decidido = await decideValidationFinding('f1', { status: 'aprovado' });
    expect((decidido as { id: string }).id).toBe('f1');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/validation/findings/f1'),
      expect.objectContaining({ method: 'PATCH' })
    );

    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: { atualizados: 3 } }) });
    const resultado = await bulkDecideValidationFindings({ ids: ['f1', 'f2', 'f3'], status: 'aprovado' });
    expect(resultado).toEqual({ atualizados: 3 });
  });
});

describe('API Service — sessão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('getLoginRedirectPath e getLoginUrl reaproveitam o caminho atual', () => {
    expect(getLoginRedirectPath()).toBe(window.location.pathname + window.location.search + window.location.hash);
    expect(getLoginUrl()).toContain('/auth/login?redirect=');
  });

  it('getMe devolve o usuário logado', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user: { sub: 'u1', email: 'a@b.com' } }) });
    const user = await getMe();
    expect(user?.sub).toBe('u1');
  });

  it('getMe devolve null quando não há sessão', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user: null }) });
    const user = await getMe();
    expect(user).toBeNull();
  });

  it('logout limpa os tokens mesmo quando a chamada ao servidor falha (finally)', async () => {
    setAuthTokens('access-1', 'refresh-1');
    mockFetch.mockRejectedValueOnce(new Error('rede fora'));
    await expect(logout()).rejects.toThrow('rede fora');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST' })
    );
    // Tokens limpos apesar do erro: uma chamada seguinte não carrega mais Authorization.
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user: null }) });
    await getMe();
    const [, init] = mockFetch.mock.calls[1];
    expect(init.headers).toEqual({});
  });

  it('exchangeAuthCode troca o código por tokens e devolve true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ accessToken: 'acc', refreshToken: 'ref' }),
    });
    const ok = await exchangeAuthCode('codigo-1');
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/exchange-code'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: 'codigo-1' }) })
    );
  });

  it('exchangeAuthCode devolve false quando a resposta falha', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400 });
    const ok = await exchangeAuthCode('codigo-invalido');
    expect(ok).toBe(false);
  });

  it('exchangeAuthCode devolve false quando o fetch lança', async () => {
    mockFetch.mockRejectedValueOnce(new Error('rede fora'));
    const ok = await exchangeAuthCode('codigo-1');
    expect(ok).toBe(false);
  });

  it('refreshSession devolve false e limpa os tokens quando a resposta falha', async () => {
    setAuthTokens('access-1', 'refresh-1');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const ok = await refreshSession();
    expect(ok).toBe(false);
    // Sessão limpa: a chamada seguinte não carrega mais Authorization.
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ user: null }) });
    await getMe();
    const [, init] = mockFetch.mock.calls[1];
    expect(init.headers).toEqual({});
  });

  it('refreshSession devolve false quando o fetch lança', async () => {
    mockFetch.mockRejectedValueOnce(new Error('rede fora'));
    const ok = await refreshSession();
    expect(ok).toBe(false);
  });

  it('refreshSession compartilha a mesma promessa entre chamadas concorrentes', async () => {
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const p1 = refreshSession();
    const p2 = refreshSession();
    resolveFetch({ ok: true, json: () => Promise.resolve({}) });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    // Uma corrida só dispara um fetch de /auth/refresh — a segunda chamada
    // reaproveita a mesma promessa em vez de duplicar a requisição.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('API Service — dicionário de gestos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('getGestureDictionary busca sem cache de navegador', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ gestures: [] }) });
    await getGestureDictionary();
    const [, init] = mockFetch.mock.calls[0];
    expect(init.cache).toBe('no-cache');
  });

  it('getGesture, getGestureUsageCounts e getGestureUsage', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', name: 'Aleluia', usages: [] }));
    const gesture = await getGesture('g1');
    expect(gesture.id).toBe('g1');

    mockFetch.mockResolvedValueOnce(okComData([{ gesture_id: 'g1', materials: 3 }]));
    const counts = await getGestureUsageCounts();
    expect(counts).toEqual([{ gesture_id: 'g1', materials: 3 }]);

    mockFetch.mockResolvedValueOnce(okComData([{ material_id: 'm1', praise_id: 'p1', praise_name: 'X', praise_number: '1', count: 2 }]));
    const usage = await getGestureUsage('g1');
    expect(usage).toHaveLength(1);
    const url = String(mockFetch.mock.calls[2][0]);
    expect(url).toContain('/api/gestures/usage?gestureId=g1');
  });

  it('createGesture monta o FormData com os campos opcionais', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', name: 'Aleluia' }));
    const file = new File(['x'], 'aleluia.png', { type: 'image/png' });
    await createGesture({ name: 'Aleluia', description: 'desc', exampleTriggers: ['a', 'b'], id: 'g1', image: file });
    const [, init] = mockFetch.mock.calls[0];
    const form = init.body as FormData;
    expect(form.get('name')).toBe('Aleluia');
    expect(form.get('description')).toBe('desc');
    expect(form.get('exampleTriggers')).toBe(JSON.stringify(['a', 'b']));
    expect(form.get('id')).toBe('g1');
    expect(form.get('image')).toBe(file);
  });

  it('updateGesture envia PATCH com os campos alterados', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', name: 'Novo nome' }));
    await updateGesture('g1', { name: 'Novo nome', status: 'deprecated' });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Novo nome', status: 'deprecated' });
  });

  it('uploadGestureImage manda o arquivo em multipart para …/image', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1' }));
    const png = new File(['x'], 'a.png', { type: 'image/png' });
    await uploadGestureImage('g1', png);
    expect(String(mockFetch.mock.calls[0][0])).toContain('/api/gestures/dictionary/g1/image');
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBe(png);
  });

  it('putGestureVideo manda PUT JSON com os segundos e devolve a entrada', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', videos: [{ materialId: 'y1', seconds: [83] }] }));
    const r = await putGestureVideo('g1', 'y1', [83]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/gestures/dictionary/g1/videos/y1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ seconds: [83] });
    expect(init).toEqual(withCreds);
    expect(r.videos[0].materialId).toBe('y1');
  });

  it('deleteGestureVideo manda DELETE e devolve a entrada', async () => {
    mockFetch.mockResolvedValueOnce(okComData({ id: 'g1', videos: [] }));
    const r = await deleteGestureVideo('g1', 'y1');
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/api/gestures/dictionary/g1/videos/y1');
    expect(init.method).toBe('DELETE');
    expect(r.videos).toEqual([]);
  });

  it('replaceGesture envia o alvo e a flag de reescrita', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, reescritos: 2, falhas: [] }),
    });
    const result = await replaceGesture('g1', 'g2', true);
    expect(result.reescritos).toBe(2);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ targetId: 'g2', rewriteDocuments: true });
  });
});

describe('API Service — putGesturesContent', () => {
  const doc = { blocks: [] } as unknown as GestureDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthTokens();
  });

  it('grava com sucesso e devolve o novo ETag, incluindo If-Match quando há etag anterior', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ ETag: '"v2"' }),
      json: () => Promise.resolve({}),
    });
    const result = await putGesturesContent('mat1', doc, '"v1"');
    expect(result).toEqual({ etag: '"v2"' });
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['If-Match']).toBe('"v1"');
  });

  it('não manda If-Match quando não há etag anterior (primeira gravação)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({}),
      json: () => Promise.resolve({}),
    });
    await putGesturesContent('mat1', doc, null);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['If-Match']).toBeUndefined();
  });

  it('renova a sessão num 401 e repete a gravação', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) }) // /auth/refresh
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: '"v3"' }),
        json: () => Promise.resolve({}),
      });
    const result = await putGesturesContent('mat1', doc, '"v1"');
    expect(result).toEqual({ etag: '"v3"' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('lança ConflitoDeGravacao em 409 e em 412', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 409 });
    await expect(putGesturesContent('mat1', doc, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);

    mockFetch.mockResolvedValueOnce({ ok: false, status: 412 });
    await expect(putGesturesContent('mat1', doc, '"v1"')).rejects.toBeInstanceOf(ConflitoDeGravacao);
  });

  it('lança DocumentoRecusado em 400 com code e path do servidor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Instrução inválida', code: 'gesto_desconhecido', path: 'blocks[0]' }),
    });
    const erro = await putGesturesContent('mat1', doc, '"v1"').catch((e) => e);
    expect(erro).toBeInstanceOf(DocumentoRecusado);
    expect(erro.code).toBe('gesto_desconhecido');
    expect(erro.path).toBe('blocks[0]');
    expect(erro.message).toBe('Instrução inválida');
  });

  it('lança uma mensagem amigável em outros erros do servidor', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    });
    await expect(putGesturesContent('mat1', doc, '"v1"')).rejects.toThrow();
  });

  it('lança a mensagem de rede quando o fetch em si falha', async () => {
    mockFetch.mockRejectedValueOnce(new Error('sem conexão'));
    await expect(putGesturesContent('mat1', doc, '"v1"')).rejects.toThrow(/conexão|rede/i);
  });
});
