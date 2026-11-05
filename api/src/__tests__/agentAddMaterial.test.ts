import { describe, expect, it, vi } from 'vitest';
import { addContributionMaterial } from '../agent/addMaterial';
import { planContribution } from '../agent/planner';
import type { Env } from '../env';

const sourceBytes = new TextEncoder().encode('<score-partwise/>');
const sourceKey = 'contributions/contrib-1/file-1.musicxml';

type TestMaterial = {
  id: string;
  praise_id: string;
  material_kind: string;
  type: string;
  r2_key: string;
  source_material_id: string | null;
  notes: string | null;
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fixture(options: {
  file?: Record<string, unknown>;
  contribution?: Record<string, unknown>;
  duplicates?: Array<{ id: string; notes: string | null }>;
  existingObjects?: Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>;
  failMaterialInserts?: number;
  failObjectDelete?: boolean;
  concurrentMaterial?: TestMaterial;
} = {}) {
  const hash = await sha256(sourceBytes);
  const contribution = {
    id: 'contrib-1',
    scan_status: 'limpa',
    status: 'pendente',
    target_praise_id: 'praise-1',
    ...options.contribution,
  };
  const file = {
    id: 'file-1',
    contribution_id: 'contrib-1',
    original_name: 'partitura.musicxml',
    declared_type: 'musicxml',
    detected_type: 'musicxml',
    size: sourceBytes.byteLength,
    sha256: hash,
    r2_key: sourceKey,
    scan_status: 'limpa',
    contribution_status: contribution.status,
    contribution_scan_status: contribution.scan_status,
    target_praise_id: contribution.target_praise_id,
    ...options.file,
  };
  const materials: TestMaterial[] = [];
  let insertFailuresRemaining = options.failMaterialInserts ?? 0;
  let concurrentMaterialToInsert = options.concurrentMaterial;

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: (...bindings: unknown[]) => ({
        first: async () => {
        if (sql.includes('FROM contributions')) return contribution;
        if (sql.includes('FROM contribution_files')) {
          return bindings[0] === file.id && bindings[1] === contribution.id ? file : null;
        }
          if (sql.includes('FROM material_kinds')) return { name: 'Partitura' };
          if (sql.includes('FROM praises')) return bindings[0] === 'praise-1' ? { id: 'praise-1' } : null;
          if (sql.includes('FROM praise_materials') && sql.includes('WHERE id = ?')) {
            return materials.find((material) => material.id === bindings[0]) ??
              (bindings[0] === 'source-pdf' ? { id: 'source-pdf', praise_id: 'praise-1', type: 'pdf' } : null);
          }
          return null;
        },
        all: async () => {
          if (sql.includes('FROM praise_materials') && sql.includes('material_kind = ?')) {
            const [praiseId, materialKind, excludedId] = bindings;
            return {
              results: [
                ...(options.duplicates ?? []),
                ...materials
                  .filter((material) =>
                    material.praise_id === praiseId &&
                    material.material_kind === materialKind &&
                    material.id !== excludedId
                  )
                  .map(({ id, notes }) => ({ id, notes })),
              ],
            };
          }
          return { results: [] };
        },
        run: async () => {
          if (sql.includes('INSERT INTO praise_materials')) {
            if (insertFailuresRemaining > 0) {
              insertFailuresRemaining -= 1;
              throw new Error('temporary_d1_failure');
            }
            if (concurrentMaterialToInsert) {
              materials.push(concurrentMaterialToInsert);
              concurrentMaterialToInsert = undefined;
            }
            const [id, praiseId, materialKind] = bindings;
            const note = typeof bindings[6] === 'string' ? bindings[6] : null;
            const duplicates = [
              ...(options.duplicates ?? []),
              ...materials.filter((material) =>
                material.praise_id === praiseId &&
                material.material_kind === materialKind &&
                material.id !== id
              ),
            ];
            if (
              note === null
                ? duplicates.length > 0
                : duplicates.length === 0 || duplicates.some((material) => material.notes?.trim().toLowerCase() === note.toLowerCase())
            ) {
              return { meta: { changes: 0 } };
            }
            materials.push({
              id: String(id),
              praise_id: String(praiseId),
              material_kind: String(materialKind),
              type: String(bindings[3]),
              r2_key: String(bindings[4]),
              source_material_id: typeof bindings[5] === 'string' ? bindings[5] : null,
              notes: typeof bindings[6] === 'string' ? bindings[6] : null,
            });
          }
          return { meta: { changes: 1 } };
        },
      }),
    })),
  };

  const objects = options.existingObjects ?? new Map();
  objects.set(sourceKey, { bytes: sourceBytes });
  const assets = {
    get: vi.fn(async (key: string) => {
      const object = objects.get(key);
      if (!object) return null;
      return {
        size: object.bytes.byteLength,
        arrayBuffer: async () => object.bytes.slice().buffer,
      };
    }),
    head: vi.fn(async (key: string) => {
      const object = objects.get(key);
      return object
        ? { size: object.bytes.byteLength, customMetadata: object.customMetadata }
        : null;
    }),
    put: vi.fn(async (key: string, value: Uint8Array, options: { customMetadata?: Record<string, string> }) => {
      objects.set(key, { bytes: value.slice(), customMetadata: options.customMetadata });
    }),
    delete: vi.fn(async (key: string) => {
      if (options.failObjectDelete) throw new Error('temporary_r2_delete_failure');
      objects.delete(key);
    }),
  };

  return {
    env: { DB: db, ASSETS: assets } as unknown as Pick<Env, 'DB' | 'ASSETS'>,
    db,
    assets,
    objects,
    materials,
    file,
    hash,
  };
}

const params = {
  praise_id: 'praise-1',
  attachment_id: 'file-1',
  material_kind_id: 'kind-score',
  type: 'musicxml',
};

describe('addContributionMaterial', () => {
  it('promotes only the selected clean attachment and creates a public material record', async () => {
    const state = await fixture();

    const result = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());

    expect(result.material_id).toMatch(/^agent-/);
    expect(result.r2_key).toBe(`assets/praises/praise-1/${result.material_id}.musicxml`);
    expect(state.objects.get(`storage/${result.r2_key}`)).toEqual({
      bytes: sourceBytes,
      customMetadata: { sha256: state.hash },
    });
    expect(state.materials).toEqual([
      {
        id: result.material_id,
        praise_id: 'praise-1',
        material_kind: 'Partitura',
        type: 'musicxml',
        r2_key: result.r2_key,
        source_material_id: null,
        notes: null,
      },
    ]);
  });

  it('rejects attachments that are unscanned or still in quarantine', async () => {
    const pending = await fixture({ file: { scan_status: 'pendente' } });
    await expect(
      addContributionMaterial(pending.env, 'contrib-1', params, 'operation-key', new Set())
    ).rejects.toThrow(/scan/i);
    expect(pending.assets.put).not.toHaveBeenCalled();

    const quarantined = await fixture({
      file: { r2_key: 'quarantine/contrib-1/file-1.musicxml' },
    });
    await expect(
      addContributionMaterial(quarantined.env, 'contrib-1', params, 'operation-key', new Set())
    ).rejects.toThrow(/quarantine|key/i);
    expect(quarantined.assets.put).not.toHaveBeenCalled();
  });

  it('rejects a target outside the contribution and newly-created praise scope', async () => {
    const state = await fixture();
    await expect(
      addContributionMaterial(
        state.env,
        'contrib-1',
        { ...params, praise_id: 'praise-other' },
        'operation-key',
        new Set()
      )
    ).rejects.toThrow(/scope|target/i);
    expect(state.assets.put).not.toHaveBeenCalled();
  });

  it('creates an empty editable gestures material without requiring or publishing an attachment', async () => {
    const state = await fixture();

    const result = await addContributionMaterial(
      state.env,
      'contrib-1',
      { praise_id: 'praise-1', material_kind_id: 'kind-score', type: 'gestures' },
      'gestures-operation',
      new Set()
    );

    expect(result.r2_key).toBe(`assets/praises/praise-1/${result.material_id}.gestures`);
    expect(state.assets.put).not.toHaveBeenCalled();
    expect(state.materials).toEqual([
      {
        id: result.material_id,
        praise_id: 'praise-1',
        material_kind: 'Partitura',
        type: 'gestures',
        r2_key: result.r2_key,
        source_material_id: null,
        notes: null,
      },
    ]);
  });

  it('links a gestures material only to a PDF of the same praise', async () => {
    const state = await fixture();

    await addContributionMaterial(
      state.env,
      'contrib-1',
      { praise_id: 'praise-1', material_kind_id: 'kind-score', type: 'gestures', source_material_id: 'source-pdf' },
      'gestures-with-source',
      new Set()
    );

    expect(state.materials[0].source_material_id).toBe('source-pdf');
  });

  it('rejects parameters that do not apply to the selected material type', async () => {
    const state = await fixture();

    await expect(
      addContributionMaterial(
        state.env,
        'contrib-1',
        { ...params, source_material_id: 'source-pdf' },
        'operation-key',
        new Set()
      )
    ).rejects.toThrow(/parameter/i);

    await expect(
      addContributionMaterial(
        state.env,
        'contrib-1',
        { praise_id: 'praise-1', material_kind_id: 'kind-score', type: 'gestures', attachment_id: 'file-1' },
        'gestures-operation',
        new Set()
      )
    ).rejects.toThrow(/parameter/i);

    expect(state.assets.put).not.toHaveBeenCalled();
    expect(state.materials).toHaveLength(0);
  });

  it('requires a distinguishing note only when the praise already has this material kind', async () => {
    const duplicate = await fixture({ duplicates: [{ id: 'existing', notes: null }] });
    await expect(
      addContributionMaterial(duplicate.env, 'contrib-1', params, 'operation-key', new Set())
    ).rejects.toThrow(/note/i);

    const single = await fixture();
    await expect(
      addContributionMaterial(
        single.env,
        'contrib-1',
        { ...params, notes: 'fonte oficial' },
        'operation-key',
        new Set()
      )
    ).rejects.toThrow(/note/i);
  });

  it('persists a distinct note for a duplicate material kind', async () => {
    const state = await fixture({ duplicates: [{ id: 'existing', notes: 'fonte oficial' }] });

    await addContributionMaterial(
      state.env,
      'contrib-1',
      { ...params, notes: 'transcrição revisada' },
      'operation-with-note',
      new Set()
    );

    expect(state.materials[0].notes).toBe('transcrição revisada');
  });

  it('resumes an already-copied object without duplicating it or the material row', async () => {
    const state = await fixture();

    const first = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());
    const second = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());

    expect(second).toEqual(first);
    expect(state.assets.put).toHaveBeenCalledTimes(1);
    expect(state.materials).toHaveLength(1);
  });

  it('resumes after the R2 copy succeeds but D1 insert and orphan cleanup fail', async () => {
    const state = await fixture({ failMaterialInserts: 1, failObjectDelete: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(
        addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set())
      ).rejects.toThrow('temporary_d1_failure');

      const materialId = `agent-${await sha256(new TextEncoder().encode('operation-key'))}`;
      const destinationKey = `storage/assets/praises/praise-1/${materialId}.musicxml`;
      expect(state.objects.has(destinationKey)).toBe(true);
      expect(state.assets.delete).toHaveBeenCalledWith(destinationKey);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('agent.add_material.orphan_cleanup_failed'));

      const resumed = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());

      expect(resumed.r2_key).toBe(destinationKey.replace(/^storage\//, ''));
      expect(state.assets.put).toHaveBeenCalledTimes(1);
      expect(state.materials).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  it('rechecks duplicate material-kind rules if another insertion wins after preflight', async () => {
    const competingMaterial: TestMaterial = {
      id: 'concurrent-material',
      praise_id: 'praise-1',
      material_kind: 'Partitura',
      type: 'pdf',
      r2_key: 'assets/praises/praise-1/concurrent-material.pdf',
      source_material_id: null,
      notes: null,
    };
    const state = await fixture({ concurrentMaterial: competingMaterial });
    const materialId = `agent-${await sha256(new TextEncoder().encode('racing-operation'))}`;
    const destinationKey = `storage/assets/praises/praise-1/${materialId}.musicxml`;

    await expect(
      addContributionMaterial(state.env, 'contrib-1', params, 'racing-operation', new Set())
    ).rejects.toThrow(/duplicate|note/i);

    expect(state.materials).toEqual([competingMaterial]);
    expect(state.assets.delete).toHaveBeenCalledWith(destinationKey);
    expect(state.objects.has(destinationKey)).toBe(false);
  });

  it('rejects an object collision whose size or checksum metadata differs', async () => {
    const state = await fixture();
    const result = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());
    const destinationKey = `storage/${result.r2_key}`;
    state.objects.set(destinationKey, {
      bytes: new Uint8Array([1, 2, 3]),
      customMetadata: { sha256: 'wrong' },
    });
    state.materials.splice(0);

    await expect(
      addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set())
    ).rejects.toThrow(/integrity|collision|checksum/i);
    expect(state.materials).toHaveLength(0);
  });

  it('verifies destination bytes even when metadata claims the expected checksum', async () => {
    const state = await fixture();
    const result = await addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set());
    state.objects.set(`storage/${result.r2_key}`, {
      bytes: new Uint8Array([1, 2, 3]),
      customMetadata: { sha256: state.hash },
    });
    state.materials.splice(0);

    await expect(
      addContributionMaterial(state.env, 'contrib-1', params, 'operation-key', new Set())
    ).rejects.toThrow(/integrity|collision|checksum/i);
    expect(state.materials).toHaveLength(0);
  });
});

describe('add_material planning context', () => {
  it('exposes only scanned supported attachments and existing material kinds', async () => {
    const contribution = {
      id: 'contrib-1',
      user_id: 'user-1',
      user_email: 'user@example.com',
      user_name: null,
      kind: 'content',
      subkind: null,
      target_source: null,
      target_praise_id: null,
      target_material_id: null,
      title: 'Nova partitura',
      body: 'Adicionar a partitura enviada',
      fields: null,
      links: '[]',
      device: null,
      app_route: null,
      app_version: null,
      status: 'pendente',
      scan_status: 'limpa',
      scan_report: null,
      decided_at: null,
      decided_by: null,
      decision_note: null,
      created_at: '2026-11-05 10:00:00',
      updated_at: '2026-11-05 10:00:00',
    };
    const eligibleFile = {
      id: 'file-clean',
      contribution_id: 'contrib-1',
      original_name: 'Partitura.musicxml',
      declared_type: 'musicxml',
      detected_type: 'musicxml',
      size: sourceBytes.byteLength,
      sha256: await sha256(sourceBytes),
      r2_key: 'contributions/contrib-1/file-clean.musicxml',
      scan_status: 'limpa',
      scan_detail: null,
      created_at: '2026-11-05 10:00:00',
    };
    const notEligibleFiles = [
      { ...eligibleFile, id: 'file-pending', scan_status: 'pendente' },
      { ...eligibleFile, id: 'file-quarantine', r2_key: 'quarantine/contrib-1/file-quarantine.musicxml' },
      { ...eligibleFile, id: 'file-text', declared_type: 'txt', detected_type: 'txt' },
      { ...eligibleFile, id: 'file-prototype-key', declared_type: 'constructor', detected_type: 'constructor' },
    ];
    const mockAi = {
      run: vi.fn(async () => ({
        response: '{"summary":"Adicionar partitura","todos":[],"tasks":[]}',
      })),
    };
    const all = async (sql: string) => {
      if (sql.includes('FROM contribution_files')) {
        return { results: [eligibleFile, ...notEligibleFiles] };
      }
      if (sql.includes('FROM material_kinds')) {
        return { results: [{ id: 'kind-score', name: 'Partitura' }] };
      }
      return { results: [] };
    };
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        all: () => all(sql),
        bind: () => ({
          first: async () => {
            if (sql.includes('FROM contributions')) return contribution;
            return null;
          },
          all: () => all(sql),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      })),
    };

    await planContribution(
      { DB: mockDb, AI: mockAi } as unknown as Parameters<typeof planContribution>[0],
      'contrib-1'
    );

    const messages = mockAi.run.mock.calls[0][1].messages;
    const userContent = messages[1].content;
    const context = JSON.parse(userContent.slice(userContent.indexOf('\n\n') + 2));
    expect(context.eligible_attachments).toEqual([
      {
        attachment_id: 'file-clean',
        original_name: 'Partitura.musicxml',
        declared_type: 'musicxml',
        material_type: 'musicxml',
        size: sourceBytes.byteLength,
      },
    ]);
    expect(context.available_material_kinds).toEqual([{ id: 'kind-score', name: 'Partitura' }]);
  });
});
