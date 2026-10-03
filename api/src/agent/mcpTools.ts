export type KnowledgePackage = {
  version: string;
  allowedPraiseFields: string[];
  tagRules: {
    maxHierarchyLevels: number;
    parentCannotHaveDirectPraisesIfHasChildren: boolean;
    noCommaInName: boolean;
  };
  materialKinds: {
    score: string;
    chord: string;
    audio: string;
    gestures: string;
  };
  chordproRules: string[];
};

export const KNOWLEDGE_PACKAGE: KnowledgePackage = {
  version: '2026.1',
  allowedPraiseFields: ['name', 'number', 'author', 'rhythm', 'tonality', 'lyrics'],
  tagRules: {
    maxHierarchyLevels: 1,
    parentCannotHaveDirectPraisesIfHasChildren: true,
    noCommaInName: true,
  },
  materialKinds: {
    score: 'Partitura (PDF)',
    chord: 'Cifra (ChordPro / TXT)',
    audio: 'Áudio (MP3 / Vozes)',
    gestures: 'Vídeo / Gestos CIAs',
  },
  chordproRules: [
    'Acordes ficam entre colchetes antes da sílaba cantada, ex: [C]Senhor [G]meu Deus',
    'Diretivas como {title: ...}, {key: ...} devem ser respeitadas',
    'Toda alteração de letra ou acorde deve preservar a métrica da estrofe',
  ],
};

export async function getPraiseDetail(db: D1Database, praiseId: string): Promise<Record<string, unknown> | null> {
  const praise = await db
    .prepare(`SELECT * FROM praises WHERE id = ?`)
    .bind(praiseId)
    .first<Record<string, unknown>>();

  if (!praise) return null;

  const { results: materials } = await db
    .prepare(
      `SELECT pm.*, mk.name as kind_name
       FROM praise_materials pm
       JOIN material_kinds mk ON pm.material_kind = mk.id
       WHERE pm.praise_id = ?`
    )
    .bind(praiseId)
    .all();

  const { results: tags } = await db
    .prepare(
      `SELECT t.*
       FROM tags t
       JOIN praise_tags pt ON pt.tag_id = t.id
       WHERE pt.praise_id = ?`
    )
    .bind(praiseId)
    .all();

  return {
    ...praise,
    materials: materials || [],
    tags: tags || [],
  };
}

export async function getChordContent(assets: R2Bucket | undefined, db: D1Database, materialId: string): Promise<string | null> {
  const material = await db
    .prepare(`SELECT * FROM praise_materials WHERE id = ? AND type = 'chord'`)
    .bind(materialId)
    .first<{ r2_key: string | null }>();

  if (!material?.r2_key || !assets) return null;

  const obj = await assets.get(material.r2_key);
  if (!obj) return null;

  return await obj.text();
}

export async function searchPraises(db: D1Database, query: string, limit = 5): Promise<Record<string, unknown>[]> {
  const cleaned = query.trim().replace(/[*"']/g, '');
  if (!cleaned) return [];

  // Tenta FTS5 primeiro, fallback para LIKE
  try {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.name, p.number, p.author, p.tonality
         FROM praises_fts fts
         JOIN praises p ON p.rowid = fts.rowid
         WHERE praises_fts MATCH ?
         LIMIT ?`
      )
      .bind(`${cleaned}*`, limit)
      .all<Record<string, unknown>>();

    if (results && results.length > 0) return results;
  } catch {
    // Fallback LIKE
  }

  const { results } = await db
    .prepare(
      `SELECT id, name, number, author, tonality
       FROM praises
       WHERE name LIKE ? OR lyrics LIKE ?
       LIMIT ?`
    )
    .bind(`%${cleaned}%`, `%${cleaned}%`, limit)
    .all<Record<string, unknown>>();

  return results || [];
}
