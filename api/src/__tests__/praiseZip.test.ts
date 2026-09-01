import { describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import yaml from 'js-yaml';
import {
  buildMetadataYaml,
  buildPraiseZipBytes,
  buildPraiseZipStream,
  readableStreamToBytes,
  PraiseZipTooLargeError,
  MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES,
  materialZipEntryName,
  materialZipExtension,
  sanitizeFileNamePart,
  type MaterialRow,
  type PraiseRow,
} from '../praiseZip';

const mockPraise: PraiseRow = {
  id: '1b2b33ab-4dff-4014-8582-dcb9a92efbc8',
  name: 'Grande Deus',
  number: '001',
  author: 'Autor 1',
  rhythm: 'Avulsos',
  tonality: 'C',
  category: 'Louvor',
  lyrics: 'Letra do louvor',
  tag_ids: 'tag1,tag2',
};

const mockMaterials: MaterialRow[] = [
  {
    id: 'mat1',
    praise_id: mockPraise.id,
    material_kind: 'kind1',
    type: 'pdf',
    r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat1.pdf',
    file_path_legacy: 'path/to/file.pdf',
    source_material_id: null,
    url: null,
  },
  {
    id: 'mat2',
    praise_id: mockPraise.id,
    material_kind: 'kind2',
    type: 'mp3',
    r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat2.mp3',
    file_path_legacy: 'path/to/file.mp3',
    source_material_id: null,
    url: null,
  },
  {
    id: 'mat3',
    praise_id: mockPraise.id,
    material_kind: 'kind3',
    type: 'chord',
    r2_key: 'assets/praises/1b2b33ab-4dff-4014-8582-dcb9a92efbc8/mat3.chord',
    file_path_legacy: 'path/to/file.chord',
    source_material_id: null,
    url: null,
  },
  {
    id: 'mat4',
    praise_id: mockPraise.id,
    material_kind: 'kind1',
    type: 'youtube',
    r2_key: null,
    file_path_legacy: '',
    source_material_id: null,
    url: 'https://www.youtube.com/watch?v=abc123',
  },
];

const mockMaterialKindLabels = [
  { id: 'kind1', label: 'Partitura' },
  { id: 'kind2', label: 'Áudio' },
  { id: 'kind3', label: 'Cifra' },
];

function createZipTestMocks() {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const mp3Bytes = new Uint8Array([0xff, 0xfb]);
  const chordBytes = new TextEncoder().encode('Am G C');

  const r2Objects: Record<string, Uint8Array> = {
    [`storage/${mockMaterials[0].r2_key}`]: pdfBytes,
    [`storage/${mockMaterials[1].r2_key}`]: mp3Bytes,
    [`storage/${mockMaterials[2].r2_key}`]: chordBytes,
  };

  const mockDB = {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(async () => {
        if (query.includes('FROM praises p')) return mockPraise;
        return null;
      }),
      all: vi.fn().mockImplementation(async () => {
        if (query.includes('COALESCE(t.label')) {
          return { results: mockMaterialKindLabels };
        }
        if (query.includes('praise_materials')) {
          return { results: mockMaterials };
        }
        return { results: [] };
      }),
    })),
  };

  const mockR2 = {
    head: vi.fn(async (key: string) => {
      const bytes = r2Objects[key];
      return bytes ? { size: bytes.byteLength } : null;
    }),
    get: vi.fn(async (key: string) => {
      const bytes = r2Objects[key];
      if (!bytes) return null;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return {
        body: stream,
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    }),
  };

  return { mockDB: mockDB as unknown as D1Database, mockR2: mockR2 as unknown as R2Bucket, pdfBytes, chordBytes };
}

describe('praiseZip helpers', () => {
  it('sanitizeFileNamePart removes invalid path characters', () => {
    expect(sanitizeFileNamePart('Partitura / Áudio')).toBe('Partitura - Áudio');
  });

  it('materialZipExtension maps chord and youtube to txt', () => {
    expect(materialZipExtension('chord')).toBe('txt');
    expect(materialZipExtension('youtube')).toBe('txt');
    expect(materialZipExtension('pdf')).toBe('pdf');
  });

  it('materialZipEntryName uses label and material id', () => {
    const used = new Set<string>();
    expect(materialZipEntryName(mockMaterials[0], 'Partitura', used)).toBe('Partitura-mat1.pdf');
    expect(materialZipEntryName(mockMaterials[3], 'Partitura', used)).toBe('Partitura-mat4.txt');
  });

  it('buildMetadataYaml matches ingest shape', () => {
    const text = buildMetadataYaml(mockPraise, ['tag1', 'tag2'], mockMaterials);
    const parsed = yaml.load(text) as Record<string, unknown>;
    expect(parsed.praise_id).toBe(mockPraise.id);
    expect(parsed.praise_name).toBe('Grande Deus');
    expect(parsed.praise_tags).toEqual(['tag1', 'tag2']);
    const mats = parsed.praise_materials as Array<Record<string, unknown>>;
    expect(mats).toHaveLength(4);
    expect(mats[3].url).toBe('https://www.youtube.com/watch?v=abc123');
  });
});

describe('buildPraiseZipBytes', () => {
  it('builds zip with metadata and named files', async () => {
    const { mockDB, mockR2, pdfBytes, chordBytes } = createZipTestMocks();
    const result = await buildPraiseZipBytes(mockDB, mockR2, mockPraise.id);
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('001_Grande Deus.zip');

    const unzipped = unzipSync(result!.bytes);
    expect(unzipped['metadata.yml']).toBeDefined();

    const meta = yaml.load(new TextDecoder().decode(unzipped['metadata.yml'])) as Record<string, unknown>;
    expect(meta.praise_id).toBe(mockPraise.id);

    expect(unzipped['Partitura-mat1.pdf']).toEqual(pdfBytes);
    expect(unzipped['Áudio-mat2.mp3']).toBeDefined();
    expect(new TextDecoder().decode(unzipped['Cifra-mat3.txt'])).toBe(new TextDecoder().decode(chordBytes));
    expect(new TextDecoder().decode(unzipped['Partitura-mat4.txt']).trim()).toBe(
      'https://www.youtube.com/watch?v=abc123'
    );
  });

  it('builds zip via streaming path', async () => {
    const { mockDB, mockR2, pdfBytes } = createZipTestMocks();
    const result = await buildPraiseZipStream(mockDB, mockR2, mockPraise.id);
    expect(result).not.toBeNull();
    const bytes = await readableStreamToBytes(result!.stream);
    const unzipped = unzipSync(bytes);
    expect(unzipped['Partitura-mat1.pdf']).toEqual(pdfBytes);
  });

  it('throws when uncompressed size exceeds limit', async () => {
    const { mockDB, mockR2 } = createZipTestMocks();
    const huge = new Uint8Array(MAX_PRAISE_ZIP_UNCOMPRESSED_BYTES + 1);
    (mockR2.head as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
      if (key.includes('mat1.pdf')) return { size: huge.byteLength };
      return { size: 0 };
    });

    await expect(buildPraiseZipBytes(mockDB, mockR2, mockPraise.id)).rejects.toThrow(
      PraiseZipTooLargeError
    );
  });

  it('returns null when praise not found', async () => {
    const mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn(),
      })),
    };
    const result = await buildPraiseZipBytes(
      mockDB as unknown as D1Database,
      { get: vi.fn() } as unknown as R2Bucket,
      'missing'
    );
    expect(result).toBeNull();
  });
});

describe('materialZipEntryName — nome de entrada não escapa da pasta', () => {
  function material(over: Partial<MaterialRow>): MaterialRow {
    return { ...mockMaterials[0], ...over };
  }

  it('sanitiza a extensão vinda do type', () => {
    // O ZIP é servido por GET /api/praises/:id/download.zip, que é rota PÚBLICA.
    // O PATCH deixava passar type arbitrário, e materialZipEntryName colava
    // `.${type}` cru: a entrada do ZIP escapava do diretório de extração.
    const nome = materialZipEntryName(
      material({ id: 'mat1', type: '../../../etc/cron.d/x' }),
      'Partitura',
      new Set()
    );

    expect(nome).not.toContain('..');
    expect(nome).not.toContain('/');
    expect(nome).not.toContain('\\');
  });

  it('sanitiza o id, que em linha legada não é necessariamente UUID', () => {
    const nome = materialZipEntryName(
      material({ id: '../../roubado', type: 'pdf' }),
      'Partitura',
      new Set()
    );

    expect(nome).not.toContain('..');
    expect(nome).not.toContain('/');
    expect(nome.endsWith('.pdf')).toBe(true);
  });

  it('desempata nomes colididos', () => {
    // Dois materiais com o mesmo rótulo E o mesmo id (dado legado duplicado):
    // sem o desempate, a segunda entrada sobrescreveria a primeira no ZIP.
    const usados = new Set<string>();
    const m = material({ id: 'mat1', type: 'pdf' });

    expect(materialZipEntryName(m, 'Partitura', usados)).toBe('Partitura-mat1.pdf');
    expect(materialZipEntryName(m, 'Partitura', usados)).toBe('Partitura-mat1-2.pdf');
    expect(materialZipEntryName(m, 'Partitura', usados)).toBe('Partitura-mat1-3.pdf');
  });

  it('cai para bin quando o type não sobra nada depois da sanitização', () => {
    const nome = materialZipEntryName(material({ id: 'mat1', type: '///' }), 'Partitura', new Set());

    expect(nome).toBe('Partitura-mat1.bin');
  });
});

describe('buildPraiseZipBytes — chave do R2 com barra inicial', () => {
  it('lê o objeto em storage/assets/... e não em storage//assets/...', async () => {
    const { mockDB, mockR2, pdfBytes } = createZipTestMocks();
    const original = mockMaterials[0].r2_key;
    mockMaterials[0].r2_key = `/${original}`;

    try {
      const result = await buildPraiseZipBytes(mockDB, mockR2, mockPraise.id);
      const unzipped = unzipSync(result!.bytes);
      expect(unzipped['Partitura-mat1.pdf']).toEqual(pdfBytes);
    } finally {
      mockMaterials[0].r2_key = original;
    }
  });
});
