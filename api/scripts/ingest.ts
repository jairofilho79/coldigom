/**
 * Unified ingestion: storage → ingestion.sql → R2 → D1
 *
 * Usage (from api/):
 *   wrangler d1 execute coldigom --remote --file=schema.sql
 *   npm run ingest:dry-run
 *   npm run ingest              # --sql-only
 *   npm run ingest:upload       # sql + R2
 *   npm run ingest:execute      # sql + D1 remote
 *   npm run ingest:full         # all steps
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

const REPO_ROOT = path.join(process.cwd(), '..');
const STORAGE_PRAISES = path.join(REPO_ROOT, 'storage', 'assets', 'praises');
const MK_CSV = path.join(REPO_ROOT, 'storage', 'material_kinds_unique.csv');
const TAGS_CSV = path.join(REPO_ROOT, 'storage', 'praise_tags_unique.csv');
const OUTPUT_SQL_PATH = path.join(REPO_ROOT, 'ingestion.sql');

const R2_CONFIG = {
  accountId: process.env.CF_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_R2_BUCKET || 'coldigom-assets',
};

interface PraiseMaterial {
  praise_material_id: string;
  material_kind: string;
  type?: string;
  material_type?: string;
  file_path_legacy?: string;
  source_material_id?: string;
  url?: string;
}

interface Metadata {
  praise_id: string;
  praise_name: string;
  praise_number?: string;
  praise_author?: string;
  praise_rhythm?: string;
  praise_tonality?: string;
  praise_category?: string;
  praise_lyrics?: string;
  praise_tags?: string[];
  praise_materiais?: PraiseMaterial[];
  praise_materials?: PraiseMaterial[];
}

export interface IngestReport {
  praisesProcessed: number;
  materialsTotal: number;
  materialsUrlOnly: number;
  materialsMissingFile: number;
  sqlStatements: number;
  r2Uploaded: number;
  r2Failed: number;
  r2Skipped: number;
}

const sqlStatements: string[] = [];
const report: IngestReport = {
  praisesProcessed: 0,
  materialsTotal: 0,
  materialsUrlOnly: 0,
  materialsMissingFile: 0,
  sqlStatements: 0,
  r2Uploaded: 0,
  r2Failed: 0,
  r2Skipped: 0,
};

const missingFiles: string[] = [];

function escapeSql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

function parseCsvInserts(filePath: string, table: 'material_kinds' | 'tags'): string[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`Catalog not found: ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const inserts: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const comma = line.indexOf(',');
    if (comma === -1) continue;
    const id = line.slice(0, comma).trim();
    const name = line.slice(comma + 1).trim();
    inserts.push(`INSERT INTO ${table} (id, name) VALUES (${escapeSql(id)}, ${escapeSql(name)});`);
  }
  return inserts;
}

function parseMetadata(filePath: string): Metadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) return null;
    const data = yaml.load(content) as Metadata;
    if (!data?.praise_id) return null;
    const materials = data.praise_materiais || data.praise_materials || [];
    for (const mat of materials) {
      if (mat.material_type && !mat.type) mat.type = mat.material_type;
    }
    return data;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

function generateR2Key(praiseId: string, material: PraiseMaterial): string {
  return `assets/praises/${praiseId}/${material.praise_material_id}.${material.type}`;
}

export function resolveLocalFile(praiseDir: string, material: PraiseMaterial): string | null {
  const type = material.type || 'unknown';
  const candidates = [
    path.join(praiseDir, `${material.praise_material_id}.${type}`),
    path.join(praiseDir, `${material.praise_material_id}.${material.material_kind}.${type}`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

async function uploadToR2(filePath: string, storageKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
      },
    });
    const body = fs.readFileSync(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: R2_CONFIG.bucket,
        Key: storageKey,
        Body: body,
      })
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function processPraiseDirectory(praiseDir: string): void {
  const metadataPath = path.join(praiseDir, 'metadata.yml');
  if (!fs.existsSync(metadataPath)) return;

  const metadata = parseMetadata(metadataPath);
  if (!metadata) return;

  report.praisesProcessed++;

  sqlStatements.push(
    `INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES (${[
      escapeSql(metadata.praise_id),
      escapeSql(metadata.praise_name),
      escapeSql(metadata.praise_number ?? null),
      escapeSql(metadata.praise_author ?? null),
      escapeSql(metadata.praise_rhythm ?? null),
      escapeSql(metadata.praise_tonality ?? null),
      escapeSql(metadata.praise_category ?? null),
      escapeSql(metadata.praise_lyrics ?? null),
    ].join(', ')});`
  );

  if (metadata.praise_tags?.length) {
    for (const tagId of metadata.praise_tags) {
      sqlStatements.push(
        `INSERT INTO praise_tags (praise_id, tag_id) VALUES (${escapeSql(metadata.praise_id)}, ${escapeSql(tagId)});`
      );
    }
  }

  const materials = metadata.praise_materiais || metadata.praise_materials || [];
  for (const material of materials) {
    report.materialsTotal++;
    const r2Key = material.url ? null : generateR2Key(metadata.praise_id, material);
    sqlStatements.push(
      `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, url) VALUES (${[
        escapeSql(material.praise_material_id),
        escapeSql(metadata.praise_id),
        escapeSql(material.material_kind),
        escapeSql(material.type || 'unknown'),
        escapeSql(r2Key),
        escapeSql(material.file_path_legacy ?? null),
        escapeSql(material.source_material_id ?? null),
        escapeSql(material.url ?? null),
      ].join(', ')});`
    );

    if (material.url) {
      report.materialsUrlOnly++;
    } else {
      const localFile = resolveLocalFile(praiseDir, material);
      if (!localFile) {
        report.materialsMissingFile++;
        missingFiles.push(`${metadata.praise_id}/${material.praise_material_id}.${material.type}`);
      }
    }
  }
}

async function uploadMaterialsForPraise(praiseDir: string, metadata: Metadata): Promise<void> {
  const materials = metadata.praise_materiais || metadata.praise_materials || [];
  for (const material of materials) {
    if (material.url) {
      report.r2Skipped++;
      continue;
    }
    const r2Key = generateR2Key(metadata.praise_id, material);
    const localFile = resolveLocalFile(praiseDir, material);
    if (!localFile) continue;
    const storageKey = `storage/${r2Key}`;
    const result = await uploadToR2(localFile, storageKey);
    if (result.success) report.r2Uploaded++;
    else {
      report.r2Failed++;
      console.error(`R2 upload failed ${storageKey}: ${result.error}`);
    }
  }
}

function writeSqlFile(): void {
  const catalog = [
    '-- Lookup table data (material_kinds and tags)',
    '',
    ...parseCsvInserts(MK_CSV, 'material_kinds'),
    ...parseCsvInserts(TAGS_CSV, 'tags'),
    '',
  ];

  const header = `-- Coldigom Ingestion SQL
-- Generated at: ${new Date().toISOString()}
-- Total statements: ${sqlStatements.length}

BEGIN TRANSACTION;

`;
  const footer = '\nCOMMIT;\n';
  fs.writeFileSync(OUTPUT_SQL_PATH, header + catalog.join('\n') + sqlStatements.join('\n') + footer);
  report.sqlStatements = sqlStatements.length;
  console.log(`SQL written to: ${OUTPUT_SQL_PATH} (${report.sqlStatements} data statements)`);
}

function executeD1Remote(): void {
  const sqlPath = path.relative(process.cwd(), OUTPUT_SQL_PATH);
  console.log(`Executing: wrangler d1 execute coldigom --remote --file=${sqlPath}`);
  execFileSync('wrangler', ['d1', 'execute', 'coldigom', '--remote', `--file=${sqlPath}`], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
}

function printReport(): void {
  console.log('\n=== Ingestion Report ===');
  console.log(JSON.stringify(report, null, 2));
  if (missingFiles.length > 0) {
    console.log(`Missing files: ${missingFiles.length} (first 10)`, missingFiles.slice(0, 10));
  }
}

export async function runIngest(argv: string[] = process.argv.slice(2)): Promise<IngestReport> {
  const dryRun = argv.includes('--dry-run');
  const uploadR2 = argv.includes('--upload-r2') || argv.includes('--full');
  const executeD1Flag = argv.includes('--execute-d1') || argv.includes('--full');
  const full = argv.includes('--full');
  const sqlOnly =
    argv.includes('--sql-only') ||
    (!dryRun && !uploadR2 && !executeD1Flag && !full);

  console.log('=== Coldigom Ingestion ===\n');
  console.log(`Storage: ${STORAGE_PRAISES}`);
  console.log(
    `Mode: ${dryRun ? 'dry-run' : full ? 'full' : argv.join(' ') || 'sql-only'}\n`
  );

  if (!fs.existsSync(STORAGE_PRAISES)) {
    console.error(`Storage path not found: ${STORAGE_PRAISES}`);
    process.exit(1);
  }

  sqlStatements.length = 0;
  missingFiles.length = 0;
  Object.assign(report, {
    praisesProcessed: 0,
    materialsTotal: 0,
    materialsUrlOnly: 0,
    materialsMissingFile: 0,
    sqlStatements: 0,
    r2Uploaded: 0,
    r2Failed: 0,
    r2Skipped: 0,
  });

  const praiseDirs = fs.readdirSync(STORAGE_PRAISES).filter(item => {
    const p = path.join(STORAGE_PRAISES, item);
    return fs.statSync(p).isDirectory();
  });

  console.log(`Found ${praiseDirs.length} praise directories\n`);

  for (const dirName of praiseDirs) {
    processPraiseDirectory(path.join(STORAGE_PRAISES, dirName));
  }

  if (dryRun) {
    const catalogCount =
      parseCsvInserts(MK_CSV, 'material_kinds').length + parseCsvInserts(TAGS_CSV, 'tags').length;
    console.log(`Would generate ${catalogCount + sqlStatements.length} SQL statements`);
    printReport();
    return report;
  }

  if (sqlOnly || uploadR2 || executeD1Flag || full) {
    writeSqlFile();
  }

  if (uploadR2 || full) {
    if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId) {
      console.error('R2 credentials missing. Set CF_ACCOUNT_ID, CF_ACCESS_KEY_ID, CF_SECRET_ACCESS_KEY');
      process.exit(1);
    }
    console.log('\nUploading to R2...');
    for (const dirName of praiseDirs) {
      const praiseDir = path.join(STORAGE_PRAISES, dirName);
      const metadata = parseMetadata(path.join(praiseDir, 'metadata.yml'));
      if (!metadata) continue;
      await uploadMaterialsForPraise(praiseDir, metadata);
    }
  }

  if (executeD1Flag || full) {
    executeD1Remote();
  }

  printReport();
  return report;
}

runIngest().catch(err => {
  console.error(err);
  process.exit(1);
});
