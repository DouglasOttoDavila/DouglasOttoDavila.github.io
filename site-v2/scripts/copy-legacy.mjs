import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(siteRoot, '..');
const outputDirectory = process.argv[2] === 'public' ? 'public' : 'dist';
const legacyRoot = resolve(siteRoot, outputDirectory, 'legacy');
const legacyEntries = ['content', 'css', 'js', 'assets'];

if (legacyRoot !== resolve(siteRoot, outputDirectory, 'legacy') || !['public', 'dist'].includes(outputDirectory)) throw new Error('Invalid generated output path');
await rm(legacyRoot, { recursive: true, force: true });
await mkdir(legacyRoot, { recursive: true });
const legacyHtml = await readFile(resolve(repositoryRoot, 'index.html'), 'utf8');
const redirect = `<script>(function(){const routes={'relationship-graph':'/lab/context-graph','relationship-entity':'/lab/context-graph/entity','user-story-analyzer':'/lab/user-story-analyzer','neural-test-signal-classifier':'/lab/neural-test-signal-classifier','login':'/login','profile':'/settings'};const [route,query]=location.hash.replace(/^#\\/?/,'').split('?');if(routes[route]){const p=new URLSearchParams(query||location.search);const e=p.get('entity');location.replace(routes[route]+(e?'?entity='+encodeURIComponent(e):''));}})();</script>`;
await writeFile(resolve(legacyRoot, 'index.html'), legacyHtml.replace('<head>', `<head>${redirect}`));

for (const entry of legacyEntries) {
  await cp(resolve(repositoryRoot, entry), resolve(legacyRoot, entry), { recursive: true, filter: path => !path.endsWith('auth.runtime.json') });
}

// Only the public graph dataset is needed. Never copy operational SQL/docs or secrets.
await mkdir(resolve(siteRoot, outputDirectory, 'lab-data'), { recursive: true });
await cp(resolve(repositoryRoot, 'docs/relationship-graph-refactor/operational-context-graph.dataset.json'), resolve(siteRoot, outputDirectory, 'lab-data/operational-context-graph.dataset.json'));
let runtime = { version: 1, supabase: { url: 'https://zlixsxbovbshsyptxymp.supabase.co', anonKey: '' } };
try { runtime = JSON.parse(await readFile(resolve(repositoryRoot, 'content/auth.runtime.json'), 'utf8')); } catch { /* Local sign-in shows a configuration message until provisioned. */ }
if (runtime.supabase.url !== 'https://zlixsxbovbshsyptxymp.supabase.co') throw new Error('Unexpected Supabase project in auth runtime.');
// Explicit public-key allowlist prevents an accidentally expanded runtime from shipping secrets.
const key = runtime.supabase.anonKey;
if (key.startsWith('sb_secret_')) throw new Error('A secret key cannot be published.');
if (key.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (claims.role !== 'anon' || claims.ref !== 'zlixsxbovbshsyptxymp') throw new Error('Only this project’s anon key may be published.');
}
const publicRuntime = JSON.stringify({ version: 1, supabase: { url: runtime.supabase.url, anonKey: key } });
await writeFile(resolve(siteRoot, outputDirectory, 'auth.runtime.json'), publicRuntime);
await writeFile(resolve(legacyRoot, 'content/auth.runtime.json'), publicRuntime);

console.log(`Copied the current interactive portfolio to ${outputDirectory}/legacy.`);
