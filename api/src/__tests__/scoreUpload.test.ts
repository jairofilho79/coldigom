import { describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { strToU8, zipSync } from 'fflate';
import { app } from '../index';

const SECRET = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://web.example';
const MUSICXML = '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Voz</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>';
const SCORE_TYPES = ['mscz', 'mxl', 'musicxml'] as const;
type ScoreType = (typeof SCORE_TYPES)[number];
type Item = { key: string; material_kind: string; type: string };

function scoreBytes(type: ScoreType): Uint8Array {
  if (type === 'musicxml') return strToU8(MUSICXML);
  const target = type === 'mscz' ? 'main.mscx' : 'main.musicxml';
  return zipSync({
    'META-INF/container.xml': strToU8(
      `<container><rootfiles><rootfile full-path="${target}"${type === 'mxl' ? ' media-type="application/vnd.recordare.musicxml+xml"' : ''}/></rootfiles></container>`
    ),
    [target]: strToU8(type === 'mscz' ? '<museScore version="4.0"><Score/></museScore>' : MUSICXML),
  });
}

function file(bytes: Uint8Array, name: string): File {
  return new File([Uint8Array.from(bytes).buffer], name, { type: 'application/octet-stream' });
}

async function upload(
  items: Item[],
  files: File[],
  options: { authenticated?: boolean; origin?: string; email?: string; uploadToken?: boolean } = {}
) {
  const materials: Record<string, unknown>[] = [];
  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async () => sql.includes('FROM praises') ? { id: 'praise-1', name: 'Louvor' } : null,
    all: async () => ({
      results: sql.includes('FROM material_kinds')
        ? [{ id: 'violin', label: 'Violino' }, { id: 'soprano', label: 'Soprano' }]
        : sql.includes('FROM praise_materials') ? materials : [],
    }),
    sql,
    args,
  });
  const db = {
    prepare: vi.fn((sql: string) => statement(sql)),
    batch: vi.fn(async (statements: ReturnType<typeof statement>[]) => {
      for (const { args } of statements) {
        materials.push({
          id: args[0], praise_id: args[1], material_kind: args[2], type: args[3],
          r2_key: args[4], file_path_legacy: args[5], source_material_id: null,
        });
      }
      return [];
    }),
  };
  const assets = { put: vi.fn(async () => ({})), delete: vi.fn(async () => {}) };
  const headers: Record<string, string> = { origin: options.origin ?? ORIGIN };
  if (options.authenticated !== false) {
    const jwt = await new SignJWT({ email: options.email ?? 'admin@test.com' })
      .setProtectedHeader({ alg: 'HS256' }).setSubject('admin')
      .setIssuedAt().setExpirationTime('1h').sign(strToU8(SECRET));
    headers.cookie = `coldigom_access=${jwt}`;
  }
  if (options.uploadToken) headers.authorization = 'Bearer review-token';
  const body = new FormData();
  body.set('items', JSON.stringify(items));
  items.forEach((item, index) => body.set(item.key, files[index]));
  const response = await app.request('/api/praises/praise-1/materials/bulk-upload', {
    method: 'POST', headers, body,
  }, {
    DB: db, ASSETS: assets, AUTH_JWT_SECRET: SECRET,
    AUTH_ALLOWED_EMAILS: 'admin@test.com', WEB_ORIGIN: ORIGIN,
    COLDIGOM_UPLOAD_TOKEN: 'review-token',
  } as never);
  return { response, db, assets };
}

const item = (type: string, material_kind = 'violin'): Item => ({ key: 'file', material_kind, type });

describe('admin score upload', () => {
  it('aceita container MuseScore com arquivos auxiliares preservando o original', async () => {
    const paths = ['style.mss', 'score.mscx', 'thumbnail.png', 'audio.json', 'view.json'];
    const bytes = zipSync({
      'META-INF/container.xml': strToU8(`<container><rootfiles>${paths.map((path) => `<rootfile full-path="${path}"/>`).join('')}</rootfiles></container>`),
      'score.mscx': strToU8('<museScore><Score/></museScore>'),
      'style.mss': strToU8('<museScore><Style/></museScore>'),
      'thumbnail.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'audio.json': strToU8('{}'),
      'view.json': strToU8('{}'),
    });
    const { response, assets, db } = await upload([item('mscz')], [file(bytes, 'score.mscz')]);
    expect(response.status).toBe(200);
    expect(assets.put).toHaveBeenCalledOnce();
    expect(db.batch).toHaveBeenCalledOnce();
  });

  it.each([
    '<score-partwise/>',
    '<score-partwise><script>garbage</script></score-partwise>',
  ])('recusa MusicXML sem conteúdo musical antes de gravar', async (xml) => {
    const { response, assets, db } = await upload(
      [item('musicxml')], [file(strToU8(xml), 'invalida.musicxml')]
    );
    expect(response.status).toBe(400);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('recusa MSCZ com DTD em estilo MSS antes de gravar', async () => {
    const bytes = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score.mscx"/><rootfile full-path="style.mss"/></rootfiles></container>'),
      'score.mscx': strToU8('<museScore><Score/></museScore>'),
      'style.mss': strToU8('<!DOCTYPE museScore [<!ENTITY x SYSTEM "file:///etc/passwd">]><museScore>&x;</museScore>'),
    });
    const { response, assets, db } = await upload([item('mscz')], [file(bytes, 'score.mscz')]);
    expect(response.status).toBe(400);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it.each(SCORE_TYPES)('cadastra %s com extensão bruta, categoria instrumental/vocal e MIME canônico', async (type) => {
    const kind = type === 'musicxml' ? 'soprano' : 'violin';
    const { response, assets, db } = await upload(
      [item(type, kind)], [file(scoreBytes(type), `Partitura.${type.toUpperCase()}`)]
    );
    expect(response.status).toBe(200);
    const json = await response.json() as { data: { materials: Record<string, unknown>[] } };
    expect(json.data.materials).toEqual([
      expect.objectContaining({ material_kind: kind, type, r2_key: expect.stringMatching(new RegExp(`\\.${type}$`)) }),
    ]);
    expect(db.batch).toHaveBeenCalledOnce();
    const mime = {
      mscz: 'application/vnd.musescore',
      mxl: 'application/vnd.recordare.musicxml',
      musicxml: 'application/vnd.recordare.musicxml+xml',
    }[type];
    expect(assets.put).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^storage/assets/praises/praise-1/[^/]+\\.${type}$`)),
      expect.anything(), { httpMetadata: { contentType: mime } }
    );
  });

  it.each(['mscz', 'mxl'])('não aceita ZIP arbitrário renomeado para %s', async (type) => {
    const { response, assets, db } = await upload(
      [item(type)], [file(zipSync({ 'readme.txt': strToU8('not a score') }), `fake.${type}`)]
    );
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toMatch(/partitura/i);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it.each([
    ['mscz', 'score.mscz', scoreBytes('mxl')],
    ['mxl', 'score.zip', scoreBytes('mxl')],
    ['pdf', 'score.mscz', zipSync({ 'readme.txt': strToU8('not a score') })],
    ['musicxml', 'score.musicxml', strToU8('<html/>')],
    ['musicxml', 'score.musicxml', strToU8('<score-partwise>')],
    ['musicxml', 'score.musicxml', strToU8('<!DOCTYPE score-partwise SYSTEM "https://example.invalid/x.dtd">' + MUSICXML)],
    ['mxl', 'score.mxl', zipSync({ '../unsafe.xml': strToU8(MUSICXML) })],
  ])('rejeita estrutura/extensão inválida: %s (%s)', async (type, name, bytes) => {
    const { response, assets, db } = await upload(
      [item(type as string)], [file(bytes as Uint8Array, name as string)]
    );
    expect(response.status).toBe(400);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('valida a partitura antes de qualquer escrita em lote misto PDF/partitura', async () => {
    const { response, assets, db } = await upload([
      { ...item('pdf'), key: 'pdf' }, { ...item('mscz'), key: 'score' },
    ], [file(strToU8('%PDF-1.7'), 'old.pdf'), file(strToU8('PK\x03\x04'), 'invalid.mscz')]);
    expect(response.status).toBe(400);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it.each([
    ['mscz', 16], ['mxl', 16], ['musicxml', 4],
  ])('recusa %s acima de %i MiB antes de gravar', async (type, limit) => {
    const { response, assets, db } = await upload(
      [item(type as string)], [file(new Uint8Array(Number(limit) * 1024 * 1024 + 1), `large.${type}`)]
    );
    expect(response.status).toBe(413);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it.each([
    [{ authenticated: false }, 401],
    [{ authenticated: false, uploadToken: true }, 401],
    [{ origin: 'https://untrusted.example' }, 403],
    [{ email: 'not-admin@test.com' }, 403],
  ] as const)('preserva autenticação/origem/autorização: %j', async (options, status) => {
    const { response, assets, db } = await upload([item('mscz')], [file(scoreBytes('mscz'), 'score.mscz')], options);
    expect(response.status).toBe(status);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('não transforma o formato em categoria nem aceita categoria fora do catálogo', async () => {
    const { response, assets, db } = await upload(
      [item('mscz', 'mscz')], [file(scoreBytes('mscz'), 'score.mscz')]
    );
    expect(response.status).toBe(400);
    expect(assets.put).not.toHaveBeenCalled();
    expect(db.batch).not.toHaveBeenCalled();
  });
});
