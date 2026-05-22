import { describe, expect, it } from 'vitest';
import { groupMaterialsByType, sortMaterialsAlphabetically } from '../lib/materials';
import type { Material } from '../types';

function mat(
  id: string,
  type: Material['type'],
  material_kind_name: string
): Material {
  return {
    id,
    praise_id: 'p1',
    material_kind: 'k1',
    material_kind_name,
    type,
    r2_key: null,
    file_path_legacy: '',
    source_material_id: null,
  };
}

describe('materials sort/group', () => {
  it('sorts alphabetically by material_kind_name', () => {
    const input = [mat('2', 'pdf', 'Zebra'), mat('1', 'pdf', 'Áudio'), mat('3', 'pdf', 'Partitura')];
    const sorted = sortMaterialsAlphabetically(input);
    expect(sorted.map((m) => m.material_kind_name)).toEqual(['Áudio', 'Partitura', 'Zebra']);
  });

  it('groups by type in fixed order with sorted items', () => {
    const input = [
      mat('c1', 'chord', 'Cifra B'),
      mat('p2', 'pdf', 'Partitura B'),
      mat('p1', 'pdf', 'Partitura A'),
      mat('m1', 'mp3', 'Áudio'),
    ];
    const groups = groupMaterialsByType(input);
    expect(groups.map((g) => g.type)).toEqual(['pdf', 'mp3', 'chord']);
    expect(groups[0].items.map((m) => m.material_kind_name)).toEqual(['Partitura A', 'Partitura B']);
    expect(groups[1].items[0].material_kind_name).toBe('Áudio');
    expect(groups[2].items[0].material_kind_name).toBe('Cifra B');
  });
});
