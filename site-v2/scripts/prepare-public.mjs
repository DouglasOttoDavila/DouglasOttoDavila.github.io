import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = process.argv[2] || 'public';
if (!['public', 'dist'].includes(outputDirectory)) throw new Error('Invalid output directory');
const legacyRoot = resolve(siteRoot, outputDirectory, 'legacy');
// Remove previously generated legacy bundles; only the compatibility redirect ships.
if (legacyRoot !== resolve(siteRoot, outputDirectory, 'legacy')) throw new Error('Invalid generated output path');
await rm(legacyRoot, { recursive: true, force: true });
await mkdir(legacyRoot, { recursive: true });
await writeFile(resolve(legacyRoot, 'index.html'), await readFile(resolve(siteRoot, 'scripts/legacy-redirect.html'), 'utf8'));
const config = JSON.parse(await readFile(resolve(siteRoot, 'config/auth.config.json'), 'utf8'));
let runtime = { version: 1, supabase: { url: config.supabase.url, anonKey: '' } };
try { runtime = JSON.parse((await readFile(resolve(siteRoot, 'config/auth.runtime.json'), 'utf8')).replace(/^\uFEFF/, '')); } catch (error) { if (error.code !== 'ENOENT') throw error; /* Local sign-in requires provisioning. */ }
if (runtime.supabase.url !== config.supabase.url) throw new Error('Unexpected Supabase project in auth runtime.');
// Explicit public-key allowlist prevents an accidentally expanded runtime from shipping secrets.
const key = runtime.supabase.anonKey;
if (typeof key !== 'string') throw new Error('Missing public anon key.');
if (key.startsWith('sb_secret_')) throw new Error('A secret key cannot be published.');
if (key.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (claims.role !== 'anon' || claims.ref !== 'zlixsxbovbshsyptxymp') throw new Error('Only this project’s anon key may be published.');
}
const publicRuntime = JSON.stringify({ version: 1, supabase: { url: runtime.supabase.url, anonKey: key } });
await writeFile(resolve(siteRoot, outputDirectory, 'auth.runtime.json'), publicRuntime);

console.log(`Prepared public auth configuration and bookmark redirect in ${outputDirectory}.`);
