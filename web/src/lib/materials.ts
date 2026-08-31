import type { KnownMaterialType, Material, MaterialType } from '../types';

const TYPE_ORDER: KnownMaterialType[] = ['youtube', 'pdf', 'mp3', 'chord'];

const TYPE_LABELS: Record<KnownMaterialType, string> = {
  youtube: 'YouTube',
  pdf: 'PDF',
  mp3: 'MP3',
  chord: 'Cifra',
};

export function materialDisplayName(m: Material): string {
  return m.material_kind_name?.trim() || 'Material';
}

export function compareMaterialsAlphabetically(a: Material, b: Material): number {
  const byName = materialDisplayName(a).localeCompare(materialDisplayName(b), 'pt-BR', {
    sensitivity: 'base',
  });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export function sortMaterialsAlphabetically(materials: Material[]): Material[] {
  return [...materials].sort(compareMaterialsAlphabetically);
}

export type MaterialTypeGroup = {
  type: MaterialType;
  label: string;
  items: Material[];
};

export function groupMaterialsByType(materials: Material[]): MaterialTypeGroup[] {
  const sorted = sortMaterialsAlphabetically(materials);
  const byType = new Map<string, Material[]>();
  for (const m of sorted) {
    const list = byType.get(m.type) ?? [];
    list.push(m);
    byType.set(m.type, list);
  }

  const groups: MaterialTypeGroup[] = [];
  for (const type of TYPE_ORDER) {
    const items = byType.get(type);
    if (items?.length) {
      groups.push({ type, label: TYPE_LABELS[type], items });
      byType.delete(type);
    }
  }

  for (const [type, items] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))) {
    groups.push({
      type,
      label: type.toUpperCase(),
      items,
    });
  }

  return groups;
}
