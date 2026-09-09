// Apply the reviewed Lab migration atomically. API token stays in process memory.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function main() {
const project = 'zlixsxbovbshsyptxymp';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required.');
if (process.env.SUPABASE_URL && process.env.SUPABASE_URL.replace(/\/$/, '') !== `https://${project}.supabase.co`) throw new Error('Unexpected Supabase project.');
const migration = await readFile(new URL('../supabase/migrations/202609080001_lab_access.sql', import.meta.url), 'utf8');
const checksum = createHash('sha256').update(migration).digest('hex');
async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Lab schema operation failed (${response.status}). Inspect the migration in Supabase before retrying.`);
  return response.json();
}
const [exists] = await query("select to_regclass('public.lab_schema_migrations') is not null as installed");
if (exists.installed) {
  const rows = await query("select checksum from public.lab_schema_migrations where version='202609080001'");
  if (rows.length) {
    if (rows[0].checksum !== checksum) throw new Error('Applied Lab migration differs from the local file. Add a new migration instead of rewriting history.');
    console.log('Lab schema already matches the reviewed migration.');
    return;
  }
}
if (!process.argv.includes('--apply')) { console.log('Lab migration is pending. Use --apply after reviewing the migration.'); return; }
// Intentionally do not replay unrelated ignored legacy migrations.
const body = migration.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
await query(`begin;
select pg_advisory_xact_lock(202609080001);
create table if not exists public.lab_schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());
alter table public.lab_schema_migrations enable row level security;
revoke all on public.lab_schema_migrations from public,anon,authenticated;
${body}
insert into public.lab_schema_migrations(version,checksum) values('202609080001','${checksum}');
commit;`);
console.log(`Lab migration applied to ${project}.`);

}
await main().catch(error => { console.error(error.message); process.exitCode = 1; });
