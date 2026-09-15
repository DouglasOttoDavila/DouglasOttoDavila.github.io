// Apply the idempotent model-preference migration using a server-side management token.
import { readFile } from 'node:fs/promises';
const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('SUPABASE_ACCESS_TOKEN is required.');
const query=await readFile(new URL('../supabase/migrations/202609140001_model_preferences.sql',import.meta.url),'utf8');
const response=await fetch('https://api.supabase.com/v1/projects/zlixsxbovbshsyptxymp/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});
if(!response.ok)throw new Error(`Model preference migration failed (${response.status}).`);
console.log('Model preference schema applied.');
