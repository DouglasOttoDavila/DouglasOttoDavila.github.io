import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const PROJECT_URL = 'https://zlixsxbovbshsyptxymp.supabase.co';
export type Usage = { lifetime_used: number; lifetime_limit: number; lifetime_remaining: number; daily_used: number; daily_limit: number; daily_remaining: number; resets_at: string; timezone: string; paused: boolean };
export type LabStatus = { access: { state: 'pending' | 'approved' | 'denied' | 'revoked'; is_admin: boolean }; usage: Usage };
let clientPromise: Promise<SupabaseClient> | undefined;

export function getClient() {
  if (!clientPromise) clientPromise = (async () => {
    const response = await fetch('/auth.runtime.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again later.');
    const config = (await response.json()).supabase;
    if (config?.url !== PROJECT_URL || !config?.anonKey) throw new Error('Sign-in is not configured yet. Please contact Douglas.');
    return createClient(config.url, config.anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } });
  })().catch(error => { clientPromise = undefined; throw error; });
  return clientPromise;
}

export function safeReturnPath(value: string | null) {
  if (!value || !/^\/(?:lab(?:\/|\?|$)|settings(?:\/|\?|$))/.test(value) || /[\\\r\n]/.test(value)) return '/lab';
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : '/lab';
}

export class LabError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function callLab<T = any>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new LabError('Your session has ended. Sign in again to continue.', 401);
  const configResponse = await fetch('/auth.runtime.json');
  const config = await configResponse.json();
  const response = await fetch(`${PROJECT_URL}/functions/v1/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabase.anonKey, Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new LabError(payload.error || `Request failed (${response.status}). Please try again.`, response.status);
  return payload;
}

export function executionKey(previous: { signature: string; id: string } | null, body: object) {
  const signature = JSON.stringify(body);
  return previous?.signature === signature ? previous : { signature, id: crypto.randomUUID() };
}
