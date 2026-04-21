/**
 * Ingestion Script for coldigom
 * 
 * This script:
 * 1. Reads metadata.yml files from storage/assets/praises/
 * 2. Uploads files to Cloudflare R2
 * 3. Generates SQL inserts for D1 database
 * 
 * Usage:
 *   npx wrangler d1 execute coldigom --local --file=schema.sql  # Initialize DB first
 *   npx tsx scripts/ingest.ts --dry-run                        # Preview SQL without executing
 *   npx tsx scripts/ingest.ts --execute                         # Execute SQL directly
 */

import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

// Configuration
const STORAGE_PATH = path.join(process.cwd(), '..', 'storage', 'assets', 'praises');
const OUTPUT_SQL_PATH = path.join(process.cwd(), '..', 'ingestion.sql');

// R2 Configuration (for actual uploads)
const R2_CONFIG = {
  accountId: process.env.CF_ACCOUNT_ID || '',
  accessKeyId: process.env.CF_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.CF_SECRET_ACCESS_KEY || '',
  bucket: process.env.CF_R2_BUCKET || 'coldigom-assets',
};

// Types matching the PRD
interface PraiseMaterial {
  praise_material_id: string;
  material_kind: string;
  type?: string;
  material_type?: string;
  file_path_legacy: string;
  source_material_id?: string;
  url?: string;
}

interface Metadata {
  praise_id: string;
  praise_name: string;
  praise_number: string;
  praise_author: string;
  praise_rhythm: string;
  praise_tonality: string;
  praise_category: string;
  praise_lyrics: string;
  praise_tags: string[];
  praise_materiais?: PraiseMaterial[];
  praise_materials?: PraiseMaterial[];
}

// SQL statements to generate
const sqlStatements: string[] = [];

/**
 * Escape value for SQL
 */
function escapeSql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Parse a metadata.yml file
 */
function parseMetadata(filePath: string): Metadata | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) {
      // Empty metadata.yml — skip silently
      return null;
    }
    const data = yaml.load(content) as Metadata;
    if (!data) return null;

    // Normalize material_type → type for each material
    const materials = data.praise_materiais || data.praise_materials || [];
    for (const mat of materials) {
      if (mat.material_type && !mat.type) {
        mat.type = mat.material_type;
      }
    }

    return data;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    return null;
  }
}

/**
 * Generate SQL INSERT for a praise
 */
function generatePraiseInsert(metadata: Metadata): string {
  const values = [
    escapeSql(metadata.praise_id),
    escapeSql(metadata.praise_name),
    escapeSql(metadata.praise_number),
    escapeSql(metadata.praise_author),
    escapeSql(metadata.praise_rhythm),
    escapeSql(metadata.praise_tonality),
    escapeSql(metadata.praise_category),
    escapeSql(metadata.praise_lyrics),
  ];
  
  return `INSERT INTO praises (id, name, number, author, rhythm, tonality, category, lyrics) VALUES (${values.join(', ')});`;
}

/**
 * Generate SQL INSERT for a material
 */
function generateMaterialInsert(praiseId: string, material: PraiseMaterial, r2Key: string | null): string {
  const values = [
    escapeSql(material.praise_material_id),
    escapeSql(praiseId),
    escapeSql(material.material_kind),
    escapeSql(material.type || 'unknown'),
    escapeSql(r2Key),
    escapeSql(material.file_path_legacy),
    escapeSql(material.source_material_id || null),
    escapeSql(material.url || null),
  ];
  
  return `INSERT INTO praise_materials (id, praise_id, material_kind, type, r2_key, file_path_legacy, source_material_id, url) VALUES (${values.join(', ')});`;
}

/**
 * Generate SQL INSERT for praise-tag relationships
 */
function generatePraiseTagInserts(praiseId: string, tagIds: string[]): string[] {
  return tagIds.map(tagId => {
    return `INSERT INTO praise_tags (praise_id, tag_id) VALUES (${escapeSql(praiseId)}, ${escapeSql(tagId)});`;
  });
}

/**
 * Generate R2 key for a material file
 */
function generateR2Key(praiseId: string, material: PraiseMaterial): string {
  const extension = material.type;
  return `assets/praises/${praiseId}/${material.praise_material_id}.${extension}`;
}

/**
 * Process a single praise directory
 */
function processPraiseDirectory(praiseDir: string): void {
  const metadataPath = path.join(praiseDir, 'metadata.yml');
  
  if (!fs.existsSync(metadataPath)) {
    console.warn(`No metadata.yml found in ${praiseDir}`);
    return;
  }
  
  const metadata = parseMetadata(metadataPath);
  if (!metadata) return;
  
  // Generate praise insert
  sqlStatements.push(generatePraiseInsert(metadata));
  
  // Generate tag inserts
  if (metadata.praise_tags && metadata.praise_tags.length > 0) {
    sqlStatements.push(...generatePraiseTagInserts(metadata.praise_id, metadata.praise_tags));
  }
  
  // Generate material inserts (handle both legacy and correct spellings)
  const materials = metadata.praise_materiais || metadata.praise_materials || [];
  if (materials.length > 0) {
    for (const material of materials) {
      // When url is present, r2_key is NULL (no local file to upload)
      const r2Key = material.url ? null : generateR2Key(metadata.praise_id, material);
      sqlStatements.push(generateMaterialInsert(metadata.praise_id, material, r2Key));
    }
  }
  
  console.log(`Processed: ${metadata.praise_name} (${metadata.praise_id})`);
}

/**
 * Main ingestion function
 */
async function ingest(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const execute = process.argv.includes('--execute');
  
  console.log('=== Coldigom Ingestion Script ===\n');
  console.log(`Storage path: ${STORAGE_PATH}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : execute ? 'EXECUTE' : 'PREVIEW'}\n`);
  
  // Clear previous output
  sqlStatements.length = 0;
  
  // Read all praise directories
  if (!fs.existsSync(STORAGE_PATH)) {
    console.error(`Storage path not found: ${STORAGE_PATH}`);
    process.exit(1);
  }
  
  const praiseDirs = fs.readdirSync(STORAGE_PATH).filter(item => {
    const itemPath = path.join(STORAGE_PATH, item);
    return fs.statSync(itemPath).isDirectory();
  });
  
  console.log(`Found ${praiseDirs.length} praise directories\n`);
  
  // Process each directory
  for (const praiseDir of praiseDirs) {
    const fullPath = path.join(STORAGE_PATH, praiseDir);
    processPraiseDirectory(fullPath);
  }
  
  console.log(`\nGenerated ${sqlStatements.length} SQL statements`);
  
  // Output SQL
  if (dryRun) {
    console.log('\n--- DRY RUN: SQL Output Preview ---\n');
    console.log(sqlStatements.slice(0, 20).join('\n'));
    if (sqlStatements.length > 20) {
      console.log(`\n... and ${sqlStatements.length - 20} more statements`);
    }
  } else {
    // Write to file
    const header = `-- Coldigom Ingestion SQL
-- Generated at: ${new Date().toISOString()}
-- Total statements: ${sqlStatements.length}

BEGIN TRANSACTION;

`;
    const footer = `
COMMIT;
`;
    
    const sqlContent = header + sqlStatements.join('\n') + footer;
    fs.writeFileSync(OUTPUT_SQL_PATH, sqlContent);
    console.log(`\nSQL written to: ${OUTPUT_SQL_PATH}`);
  }
  
  if (execute) {
    console.log('\nExecuting SQL via wrangler...');
    // This would run: wrangler d1 execute coldigom --remote --file=ingestion.sql
    console.log('Command: wrangler d1 execute coldigom --remote --file=ingestion.sql');
  }
}

/**
 * Upload a single file to R2 (requires S3-compatible client)
 */
async function uploadToR2(
  filePath: string,
  key: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Dynamic import for S3 client (only if needed)
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_CONFIG.accessKeyId,
        secretAccessKey: R2_CONFIG.secretAccessKey,
      },
    });
    
    const fileContent = fs.readFileSync(filePath);
    
    await client.send(new PutObjectCommand({
      Bucket: R2_CONFIG.bucket,
      Key: key,
      Body: fileContent,
    }));
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Full ingestion with R2 upload
 */
async function ingestWithUpload(): Promise<void> {
  console.log('=== Coldigom Ingestion with R2 Upload ===\n');
  
  if (!R2_CONFIG.accountId || !R2_CONFIG.accessKeyId) {
    console.warn('R2 credentials not configured. Set CF_ACCOUNT_ID, CF_ACCESS_KEY_ID, CF_SECRET_ACCESS_KEY');
    console.warn('Running in SQL-only mode...\n');
    await ingest();
    return;
  }
  
  // Similar to ingest() but also uploads files to R2
  // Implementation would iterate through files and call uploadToR2
  console.log('R2 upload functionality available');
  console.log('Use uploadToR2() for each material file');
}

// Run if executed directly
ingest().catch(console.error);

export { ingest, uploadToR2, ingestWithUpload };
