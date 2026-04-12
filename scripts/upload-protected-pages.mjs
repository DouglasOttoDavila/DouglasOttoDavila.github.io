import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.PROTECTED_PAGES_BUCKET || 'protected-pages';
const SOURCE_DIR = process.env.PROTECTED_PAGES_DIR || 'private_pages';

function fail(msg) {
  console.error(`[protected-pages] ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`[protected-pages] ${msg}`);
}

function readFileAbs(absPath) {
  return fs.readFileSync(absPath);
}

function walkFiles(dirAbs) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(abs));
      continue;
    }

    if (entry.isFile()) {
      files.push(abs);
    }
  }

  return files;
}

function toPosixRelative(rootAbs, fileAbs) {
  return path.relative(rootAbs, fileAbs).split(path.sep).join('/');
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const textTypes = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.htm', 'text/html; charset=utf-8'],
    ['.md', 'text/markdown; charset=utf-8'],
    ['.txt', 'text/plain; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.svg', 'image/svg+xml; charset=utf-8']
  ]);

  const binaryTypes = new Map([
    ['.pdf', 'application/pdf'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.webp', 'image/webp'],
    ['.gif', 'image/gif'],
    ['.zip', 'application/zip']
  ]);

  return textTypes.get(ext) || binaryTypes.get(ext) || 'application/octet-stream';
}

function joinUrl(base, p) {
  return String(base).replace(/\/+$/, '') + '/' + String(p).replace(/^\/+/, '');
}

async function putObject({ bucket, remotePath, body, contentType }) {
  // Storage upload endpoint: PUT /storage/v1/object/<bucket>/<path>
  const url = joinUrl(SUPABASE_URL, `/storage/v1/object/${encodeURIComponent(bucket)}/${remotePath}`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': contentType,
      // Overwrite existing objects deterministically.
      'x-upsert': 'true'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) ${remotePath}: ${text || res.statusText}`);
  }
}

async function main() {
  if (!SUPABASE_URL) fail('Missing SUPABASE_URL.');
  if (!SUPABASE_SERVICE_ROLE_KEY) fail('Missing SUPABASE_SERVICE_ROLE_KEY.');

  const absDir = path.resolve(process.cwd(), SOURCE_DIR);
  if (!fs.existsSync(absDir)) {
    info(`Skipping upload: source dir not found: ${SOURCE_DIR}`);
    process.exit(0);
  }

  const sourceFiles = walkFiles(absDir);
  if (sourceFiles.length === 0) {
    info(`Skipping upload: no files found under "${SOURCE_DIR}".`);
    process.exit(0);
  }

  info(`Uploading ${sourceFiles.length} protected file(s) to bucket "${BUCKET}" from "${SOURCE_DIR}"...`);

  for (const abs of sourceFiles) {
    const remotePath = toPosixRelative(absDir, abs);
    const body = readFileAbs(abs);
    const contentType = getContentType(abs);
    await putObject({ bucket: BUCKET, remotePath, body, contentType });
    info(`Uploaded ${remotePath}`);
  }

  info('Done.');
}

main().catch(err => fail(err?.stack || err?.message || String(err)));
