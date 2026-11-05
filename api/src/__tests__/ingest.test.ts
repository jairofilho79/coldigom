import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { praiseInsertSql, resolveLocalFile } from '../../scripts/ingest';

describe('resolveLocalFile', () => {
  it('finds file with material_id.type pattern', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praise-'));
    const materialId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const filePath = path.join(dir, `${materialId}.pdf`);
    fs.writeFileSync(filePath, '%PDF');

    const found = resolveLocalFile(dir, {
      praise_material_id: materialId,
      material_kind: 'kind-uuid',
      type: 'pdf',
      file_path_legacy: '',
    });

    expect(found).toBe(filePath);
    fs.rmSync(dir, { recursive: true });
  });

  it('finds file with material_id.kind.type pattern', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praise-'));
    const materialId = '11111111-2222-3333-4444-555555555555';
    const kindId = '99999999-8888-7777-6666-555555555555';
    const filePath = path.join(dir, `${materialId}.${kindId}.mp3`);
    fs.writeFileSync(filePath, 'audio');

    const found = resolveLocalFile(dir, {
      praise_material_id: materialId,
      material_kind: kindId,
      type: 'mp3',
      file_path_legacy: '',
    });

    expect(found).toBe(filePath);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('praiseInsertSql', () => {
  it('ignora praise_category de ZIPs antigos', () => {
    const sql = praiseInsertSql({
      praise_id: 'p1',
      praise_name: "D'Ávila",
      praise_category: 'Clamor',
    } as Parameters<typeof praiseInsertSql>[0] & { praise_category: string });
    expect(sql).toBe(
      "INSERT INTO praises (id, name, number, author, rhythm, tonality, lyrics) VALUES ('p1', 'D''Ávila', NULL, NULL, NULL, NULL, NULL);"
    );
  });
});
