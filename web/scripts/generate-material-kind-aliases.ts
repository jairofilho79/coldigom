/**
 * Generates web/src/lib/materialKindInference/aliases.generated.ts from repo SSOT.
 * Run from web/: npx tsx scripts/generate-material-kind-aliases.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CSV_PATH = path.join(REPO_ROOT, 'storage/material_kinds_unique.csv');
const SQL_PATH = path.join(REPO_ROOT, 'api/migrations/002_material_kind_translations_pt-BR.sql');
const OUT_PATH = path.join(REPO_ROOT, 'web/src/lib/materialKindInference/aliases.generated.ts');

type AliasEntry = { kindId: string; alias: string };

function parseCsv(content: string): AliasEntry[] {
  const lines = content.trim().split('\n');
  const entries: AliasEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const comma = line.indexOf(',');
    if (comma === -1) continue;
    const id = line.slice(0, comma).trim();
    const name = line.slice(comma + 1).trim();
    if (id && name) entries.push({ kindId: id, alias: name });
  }
  return entries;
}

function parsePtBrSql(content: string): AliasEntry[] {
  const entries: AliasEntry[] = [];
  const re =
    /INSERT OR REPLACE INTO material_kind_translations \(material_kind_id, locale, label\) VALUES \('([^']+)', 'pt-BR', '([^']+)'\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    entries.push({ kindId: m[1], alias: m[2] });
  }
  return entries;
}

function main(): void {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const sql = fs.readFileSync(SQL_PATH, 'utf-8');
  const all = [...parseCsv(csv), ...parsePtBrSql(sql)];

  const byKind = new Map<string, Set<string>>();
  for (const { kindId, alias } of all) {
    let set = byKind.get(kindId);
    if (!set) {
      set = new Set();
      byKind.set(kindId, set);
    }
    set.add(alias);
  }

  const rows: Array<{ kindId: string; aliases: string[] }> = [];
  for (const [kindId, aliases] of byKind) {
    rows.push({ kindId, aliases: [...aliases].sort((a, b) => b.length - a.length) });
  }
  rows.sort((a, b) => a.kindId.localeCompare(b.kindId));

  const body = rows
    .map(
      (r) =>
        `  '${r.kindId}': [\n${r.aliases.map((a) => `    ${JSON.stringify(a)},`).join('\n')}\n  ],`
    )
    .join('\n');

  const out = `/** Auto-generated — do not edit. Run: npx tsx scripts/generate-material-kind-aliases.ts */
export const GENERATED_ALIASES: Record<string, readonly string[]> = {
${body}
};
`;

  fs.writeFileSync(OUT_PATH, out, 'utf-8');
  console.log(`Wrote ${OUT_PATH} (${rows.length} kinds, ${all.length} alias entries)`);
}

main();
