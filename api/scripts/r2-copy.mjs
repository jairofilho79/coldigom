#!/usr/bin/env node
/**
 * Copy coldigom-assets R2 bucket between Cloudflare accounts (S3 API).
 *
 * Env (source — conta coletaneadigitalicm):
 *   SRC_CF_ACCOUNT_ID=ae6f9337c75828a1c114e9ec10119d0f
 *   SRC_CF_ACCESS_KEY_ID=...
 *   SRC_CF_SECRET_ACCESS_KEY=...
 *
 * Env (destination — conta jairofilho79):
 *   DST_CF_ACCOUNT_ID=246ee6c20c011ae98a226d48a7a38902
 *   DST_CF_ACCESS_KEY_ID=...
 *   DST_CF_SECRET_ACCESS_KEY=...
 *
 * Usage (from api/):
 *   npm run migration:r2-copy
 *   npm run migration:r2-copy -- --dry-run
 *   npm run migration:r2-copy -- --concurrency=6
 *   R2_COPY_CONCURRENCY=6 npm run migration:r2-copy
 *
 * Re-run after failures: objects already on destination are skipped automatically.
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const BUCKET = 'coldigom-assets';
const dryRun = process.argv.includes('--dry-run');
/** Progress heartbeat — sparse enough not to affect throughput. */
const PROGRESS_EVERY = 500;
const MAX_RETRIES = 6;

function parseConcurrency() {
  const flag = process.argv.find((a) => a.startsWith('--concurrency='));
  const fromFlag = flag ? Number(flag.slice('--concurrency='.length)) : NaN;
  const fromEnv = Number(process.env.R2_COPY_CONCURRENCY);
  const n = Number.isFinite(fromFlag) ? fromFlag : Number.isFinite(fromEnv) ? fromEnv : 6;
  return Math.max(1, Math.min(32, Math.floor(n)));
}

const concurrency = parseConcurrency();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (!err) return false;
  const code = err.code ?? err.name;
  if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'TimeoutError', 'NetworkingError'].includes(code)) {
    return true;
  }
  const status = err.$metadata?.httpStatusCode;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  if (err.name === 'AggregateError' && Array.isArray(err.errors)) {
    return err.errors.some(isRetryable);
  }
  return false;
}

function errLabel(err) {
  if (!err) return 'unknown error';
  if (err.name === 'AggregateError' && err.errors?.length) {
    return err.errors.map((e) => e.code ?? e.message).join('; ');
  }
  return err.code ?? err.message ?? String(err);
}

async function withRetry(label, fn) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      const delay = Math.min(30_000, 750 * 2 ** (attempt - 1)) + Math.random() * 250;
      console.warn(`[retry ${attempt}/${MAX_RETRIES - 1}] ${label}: ${errLabel(err)} — wait ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function client(prefix) {
  const id = process.env[`${prefix}_CF_ACCOUNT_ID`];
  const key = process.env[`${prefix}_CF_ACCESS_KEY_ID`];
  const secret = process.env[`${prefix}_CF_SECRET_ACCESS_KEY`];
  if (!id || !key || !secret) {
    throw new Error(`Missing ${prefix}_CF_ACCOUNT_ID / ACCESS_KEY_ID / SECRET_ACCESS_KEY`);
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${id}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    maxAttempts: 3,
  });
}

const src = client('SRC');
const dst = client('DST');

function createSemaphore(limit) {
  let active = 0;
  const queue = [];
  return {
    acquire() {
      if (active < limit) {
        active++;
        return Promise.resolve();
      }
      return new Promise((resolve) => queue.push(resolve));
    },
    release() {
      active--;
      const next = queue.shift();
      if (next) {
        active++;
        next();
      }
    },
  };
}

async function* listAll(s3) {
  let token;
  do {
    const res = await withRetry('list objects', () =>
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }))
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) yield obj;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function exists(s3, key) {
  try {
    await withRetry(`head ${key}`, () => s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })));
    return true;
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    if (status === 404 || err.name === 'NotFound' || err.Code === 'NoSuchKey') return false;
    throw err;
  }
}

function logProgress(listed, copied, skipped, failed, done, startMs) {
  const elapsed = Math.round((Date.now() - startMs) / 1000);
  const prefix = dryRun ? '[dry-run] ' : '';
  const failPart = failed ? ` failed=${failed}` : '';
  console.log(`${prefix}[${elapsed}s] listed=${listed} done=${done} copied=${copied} skipped=${skipped}${failPart}`);
}

async function copyObject(key) {
  if (await exists(dst, key)) return 'skipped';
  const got = await withRetry(`get ${key}`, () =>
    src.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  );
  const body = await got.Body.transformToByteArray();
  await withRetry(`put ${key}`, () =>
    dst.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: got.ContentType,
      })
    )
  );
  return 'copied';
}

async function main() {
  let listed = 0;
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;
  const startMs = Date.now();
  const sem = createSemaphore(concurrency);
  const tasks = [];
  const failedKeys = [];

  console.log(
    `R2 copy: bucket=${BUCKET}${dryRun ? ' (dry-run)' : ''} concurrency=${concurrency} — listing…`
  );

  for await (const obj of listAll(src)) {
    listed++;
    const key = obj.Key;
    const atListed = listed === 1 || listed % PROGRESS_EVERY === 0;

    if (dryRun) {
      if (listed <= 5 || atListed) console.log(`[dry-run] ${key}`);
      if (atListed) logProgress(listed, copied, skipped, failed, done, startMs);
      continue;
    }

    if (atListed) logProgress(listed, copied, skipped, failed, done, startMs);

    await sem.acquire();
    tasks.push(
      (async () => {
        try {
          const result = await copyObject(key);
          if (result === 'copied') copied++;
          else skipped++;
        } catch (err) {
          failed++;
          failedKeys.push(key);
          console.error(`[failed] ${key}: ${errLabel(err)}`);
        } finally {
          done++;
          if (done === 1 || done % PROGRESS_EVERY === 0) {
            logProgress(listed, copied, skipped, failed, done, startMs);
          }
          sem.release();
        }
      })()
    );
  }

  await Promise.all(tasks);
  logProgress(listed, copied, skipped, failed, done, startMs);
  console.log(JSON.stringify({ listed, copied, skipped, failed, concurrency, dryRun }, null, 2));

  if (failed > 0) {
    console.error(`\n${failed} object(s) failed. Re-run to retry — already copied objects are skipped.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
