import type { Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
const project = 'zlixsxbovbshsyptxymp';
const uid = '11111111-1111-4111-8111-111111111111';
const usage = { lifetime_used: 0, lifetime_limit: 10, lifetime_remaining: 10, daily_used: 0, daily_limit: 10, daily_remaining: 10, resets_at: '2026-09-09T03:00:00Z', timezone: 'America/Sao_Paulo', paused: false };
export async function setup(page: Page, options: { signedIn?: boolean; state?: string; admin?: boolean; quota?: Partial<typeof usage> } = {}) {
  const access = { state: options.state || 'approved', is_admin: options.admin || false };
  const currentUsage = { ...usage, ...options.quota };
  const settings = { lifetime_limit: 10, daily_limit: 10, timezone: 'America/Sao_Paulo', notification_email: 'owner@example.test', paused: false };
  const requests = [{ user_id: uid, email: 'recruiter@example.test', full_name: 'Test recruiter', state: 'pending', is_admin: false }];
  const actions: any[] = [];
  const executions: any[] = [];
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', exp: 9999999999 })).toString('base64url')}.test`;
  if (options.signedIn !== false) await page.addInitScript(({ token, uid, project }) => {
    localStorage.setItem(`sb-${project}-auth-token`, JSON.stringify({ access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_at: 9999999999, expires_in: 3600, user: { id: uid, email: 'recruiter@example.test', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } }));
  }, { token, uid, project });
  await page.route('**/auth.runtime.json', route => route.fulfill({ json: { supabase: { url: `https://${project}.supabase.co`, anonKey: 'public-test-key' } } }));
  let preferredModel = 'nvidia/nemotron-3-super-120b-a12b';
  await page.route(`https://${project}.supabase.co/**`, async route => {
    const url = route.request().url();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers });
    if (url.includes('/auth/v1/')) return route.fulfill({ headers, json: { id: uid, email: 'recruiter@example.test' } });
    const body = route.request().postDataJSON();
    if (url.endsWith('/model-catalog')) { if(body.action === 'save') preferredModel=body.model; return route.fulfill({headers,json:{models:[{id:'nvidia/nemotron-3-super-120b-a12b',label:'Nemotron Super',verified:true},{id:'meta/llama-3.2-11b-vision-instruct',label:'Llama 11B',verified:true}],defaultModel:preferredModel,checkedAt:'2026-09-14'}}); }
    if (url.endsWith('/lab-access')) {
      actions.push(body);
      if (body.action === 'admin_overview') return route.fulfill({ headers, json: { requests, settings, logs: [], notifications: [] } });
      if (body.action === 'settings') Object.assign(settings, body.settings);
      if (body.action === 'review') requests[0].state = body.state;
      return route.fulfill({ headers, json: { access, usage: currentUsage } });
    }
    executions.push(body);
    if (url.endsWith('/user-story-analyzer')) return route.fulfill({ headers, json: { invest_score: { independent: 4, negotiable: 4, valuable: 5, estimable: 4, small: 5, testable: 4, overall_comment: 'This story has a clear outcome.' }, story_improvement: { body: { independentSuggestion: 'Keep the scope focused.', rewrittenStory: 'A reviewed story.', gherkinAcceptanceCriteria: 'Given a customer\nWhen a reset is requested\nThen a link arrives', missingContextOrDependencies: 'Define link expiration.' } } } });
    return route.fulfill({ headers, json: { answer: 'Inspect the requirement and its related tests.', referencedNodeIds: [], actions: [] } });
  });
  return { access, currentUsage, actions, executions, settings };
}
