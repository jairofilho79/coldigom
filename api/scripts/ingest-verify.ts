/**
 * Compare local storage praise folders vs D1 remote praise count.
 * Run from api/: npm run ingest:verify
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

const REPO_ROOT = path.join(process.cwd(), '..');
const STORAGE_PRAISES = path.join(REPO_ROOT, 'storage', 'assets', 'praises');

function countValidMetadataDirs(): number {
  if (!fs.existsSync(STORAGE_PRAISES)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(STORAGE_PRAISES)) {
    const metaPath = path.join(STORAGE_PRAISES, name, 'metadata.yml');
    if (!fs.existsSync(metaPath)) continue;
    const raw = fs.readFileSync(metaPath, 'utf-8');
    if (!raw.trim()) continue;
    try {
      const data = yaml.load(raw) as { praise_id?: string };
      if (data?.praise_id) count++;
    } catch {
      /* skip invalid */
    }
  }
  return count;
}

function queryD1PraiseCount(): number {
  const out = execFileSync(
    'wrangler',
    ['d1', 'execute', 'coldigom', '--remote', '--command', 'SELECT COUNT(*) AS c FROM praises;'],
    { encoding: 'utf-8', cwd: process.cwd() }
  );
  const match = out.match(/"c"\s*:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : NaN;
}

function main(): void {
  const local = countValidMetadataDirs();
  console.log(`Local praises (valid metadata.yml): ${local}`);

  let remote = NaN;
  try {
    remote = queryD1PraiseCount();
    console.log(`D1 remote praises count: ${remote}`);
  } catch (e) {
    console.error('Failed to query D1. Is wrangler logged in?', e);
    process.exit(1);
  }

  if (Number.isNaN(remote)) {
    console.error('Could not parse D1 count from wrangler output');
    process.exit(1);
  }

  const diff = Math.abs(local - remote);
  const pct = local > 0 ? ((diff / local) * 100).toFixed(1) : '0';
  if (diff === 0) {
    console.log('OK: counts match');
    process.exit(0);
  }
  console.warn(`MISMATCH: difference ${diff} (${pct}% of local)`);
  process.exit(diff > local * 0.05 ? 1 : 0);
}

main();
