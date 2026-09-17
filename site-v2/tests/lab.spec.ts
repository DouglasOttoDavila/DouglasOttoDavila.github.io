import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';
const project = 'zlixsxbovbshsyptxymp';
const uid = '11111111-1111-4111-8111-111111111111';
const usage = { lifetime_used: 0, lifetime_limit: 10, lifetime_remaining: 10, daily_used: 0, daily_limit: 10, daily_remaining: 10, resets_at: '2026-09-09T03:00:00Z', timezone: 'America/Sao_Paulo', paused: false };
async function setup(page: Page, options: { signedIn?: boolean; state?: string; admin?: boolean; quota?: Partial<typeof usage> } = {}) {
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

test('signed-out deep links expose sign-in, not tool controls; no legacy links', async ({ page }) => {
  await setup(page, { signedIn: false }); await page.goto('/lab/user-story-analyzer');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByLabel('User story and acceptance criteria')).toHaveCount(0);
  await page.goto('/lab'); await expect(page.locator('a[href*="/legacy/"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open experiment' })).toHaveCount(3);
});
test('pending approval and revoked users cannot access tool controls', async ({ page }) => {
  const state = await setup(page, { state: 'pending' }); await page.goto('/lab/user-story-analyzer');
  await expect(page.getByRole('heading', { name: 'Your access request is pending.' })).toBeVisible();
  state.access.state = 'revoked'; await page.getByRole('button', { name: 'Refresh access' }).click();
  await expect(page.getByRole('heading', { name: 'Your Lab access has been revoked.' })).toBeVisible();
  await expect(page.getByLabel('User story and acceptance criteria')).toHaveCount(0);
});
test('approved analyzer preserves input and presents structured results', async ({ page }) => {
  const state = await setup(page); await page.goto('/lab/user-story-analyzer');
  await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: 'Review story · 1 execution' }).click();
  await expect(page.getByText('A reviewed story.')).toBeVisible();
  expect(state.executions).toHaveLength(1); expect(state.executions[0].request_id).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.getByLabel('User story and acceptance criteria')).toHaveValue(/As a customer/);
  await expect(page.getByRole('button', { name: 'Download review' })).toBeVisible();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: 'test-results/analyzer-desktop.png', fullPage: true });
});
test('global quota disables processing but preserves simulation', async ({ page }) => {
  await setup(page, { quota: { daily_remaining: 0, daily_used: 10 } }); await page.goto('/lab/user-story-analyzer');
  await page.getByRole('button', { name: 'Use an example' }).click();
  await expect(page.getByRole('button', { name: 'Review story · 1 execution' })).toBeDisabled();
  await page.goto('/lab/neural-test-signal-classifier');
  await expect(page.getByLabel('Failure category')).toBeVisible();
  await page.getByLabel('Failure category').selectOption('assertion');
  await page.getByLabel('Retry passed').uncheck();
  await page.getByLabel('Changed files').fill('40');
  await expect(page.getByRole('heading', { name: 'Product regression', exact: true })).toBeVisible();
});
test('graph supports entity inspection, filtering, assistant and new entity URLs', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await setup(page); await page.goto('/lab/context-graph');
  await expect(page.locator('.graph-node').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/graph-desktop.png', fullPage: true });
  await page.locator('.graph-node').first().focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Open entity record' })).toBeVisible();
  const recordUrl = await page.getByRole('link', { name: 'Open entity record' }).getAttribute('href');
  expect(recordUrl).toContain('/lab/context-graph/entity?entity=');
  await page.getByRole('button', { name: 'Ask about this entity' }).click();
  await page.getByLabel('Your question').fill('Which tests cover this requirement?');
  await page.getByRole('button', { name: 'Ask assistant · 1 execution' }).click();
  await expect(page.getByText('Inspect the requirement and its related tests.')).toBeVisible();
  await page.goto(recordUrl!); await expect(page.getByRole('link', { name: 'Open in graph' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
test('admin approves and configures quotas; non-admin settings remain unavailable', async ({ page }) => {
  const state = await setup(page, { admin: true }); await page.goto('/settings');
  await page.getByRole('button', { name: 'Approve access', exact: true }).click();
  await expect(page.getByText('Access approved. The notification is queued.')).toBeVisible();
  await page.getByLabel('Daily executions across all users').fill('12');
  await page.getByRole('button', { name: 'Save site settings' }).click();
  await expect(page.getByText('Site settings saved.', { exact: false })).toBeVisible();
  expect(state.settings.daily_limit).toBe(12);
  state.access.is_admin = false; await page.getByRole('button', { name: 'Refresh access' }).click();
  await expect(page.getByText('Administrative settings are available to Douglas only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save site settings' })).toHaveCount(0);
});
test('mobile tools fit the viewport and logout closes the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  for (const path of ['/lab/user-story-analyzer', '/lab/neural-test-signal-classifier', '/lab/context-graph']) {
    await page.goto(path);
    if (path.endsWith('context-graph')) await page.locator('.graph-access-disclosure > summary').click();
    await expect(page.getByText('Lab access approved', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/mobile-${path.split('/').pop()}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.locator('.graph-stage')).toHaveCount(0);
});
test('legacy bookmark forwards to the new gated route', async ({ page }) => {
  await setup(page, { signedIn: false }); await page.goto('/legacy/index.html#relationship-graph');
  await expect(page).toHaveURL(/\/lab\/context-graph/);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});
test('expired callback reports recoverable error without leaking tokens', async ({ page }) => {
  await setup(page, { signedIn: false }); await page.goto('/auth/callback?error=access_denied&error_description=Google%20sign-in%20cancelled');
  await expect(page.getByRole('alert')).toContainText('Google sign-in cancelled');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('root legacy hashes including slash and entity parameters forward correctly', async ({ page }) => {
  await setup(page, { signedIn: false });
  await page.goto('/#/relationship-entity?entity=sample-entity');
  await expect(page).toHaveURL(/\/lab\/context-graph\/entity\?entity=sample-entity/);
  await page.goto('/index.html#user-story-analyzer');
  await expect(page).toHaveURL(/\/lab\/user-story-analyzer/);
  await page.goto('/legacy/index.html#/relationship-graph');
  await expect(page).toHaveURL(/\/lab\/context-graph/);
});

test('lost response at the last slot can be replayed without a new execution', async ({ page }) => {
  const state = await setup(page);
  let firstId = ''; let attempts = 0;
  await page.route('**/functions/v1/user-story-analyzer', async route => {
    attempts++; const body = route.request().postDataJSON();
    if (!firstId) { firstId = body.request_id; state.currentUsage.lifetime_remaining = 0; await route.abort(); }
    else { expect(body.request_id).toBe(firstId); await route.fulfill({ json: { invest_score: { independent: 4, negotiable: 4, valuable: 4, estimable: 4, small: 4, testable: 4, overall_comment: 'Recovered existing result.' } } }); }
  });
  await page.goto('/lab/user-story-analyzer'); await page.getByRole('button', { name: 'Use an example' }).click();
  await page.getByRole('button', { name: 'Review story · 1 execution' }).click();
  await expect(page.getByRole('button', { name: 'Retry existing request' })).toBeEnabled();
  await page.getByRole('button', { name: 'Retry existing request' }).click();
  await expect(page.getByText('Recovered existing result.')).toBeVisible(); expect(attempts).toBe(2);
});

test('a late status response cannot restore tools after logout', async ({ page }) => {
  await setup(page); await page.goto('/lab/user-story-analyzer');
  await expect(page.getByLabel('User story and acceptance criteria')).toBeVisible();
  let release!: () => void;
  const delayed = new Promise<void>(resolve => release = resolve);
  await page.route('**/functions/v1/lab-access', async route => { await delayed; await route.fulfill({ json: { access: { state: 'approved', is_admin: true }, usage } }); });
  await page.getByRole('button', { name: 'Refresh access' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); release();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByLabel('User story and acceptance criteria')).toHaveCount(0);
});

test('access screen distinguishes lifetime and shared daily allowances and preserves return destination', async ({ page }) => {
  await setup(page, { quota: { lifetime_remaining: 4 } }); await page.goto('/login?next=/lab/user-story-analyzer');
  await expect(page.getByRole('heading', { name: 'You’re ready to explore.' })).toBeVisible();
  await expect(page.locator('.usage-line')).toContainText('Account allowance: 4 of 10 runs remaining');
  await expect(page.locator('.usage-line')).toContainText('Shared daily capacity: 10 of 10 runs available');
  await expect(page.getByRole('link', { name: 'Continue to experiment' })).toHaveAttribute('href', '/lab/user-story-analyzer');
  await expect(page.getByRole('link', { name: 'Site settings' })).toHaveAttribute('href', '/settings');
  await page.screenshot({ path: 'test-results/redesign/access-approved.png', fullPage: true });
});
test('account exhaustion, pause, and status failures stay explicit', async ({ page }) => {
  const state = await setup(page, { quota: { lifetime_remaining: 0 } }); await page.goto('/login');
  await expect(page.getByText('Your account allowance has been used.', { exact: false })).toBeVisible();
  state.currentUsage.paused = true; await page.getByRole('button', { name: 'Refresh access' }).click();
  await expect(page.getByText('Processing is paused by Douglas.', { exact: false })).toBeVisible();
  await page.route('**/functions/v1/lab-access', route => route.fulfill({ status: 503, json: { error: 'Access service unavailable.' } }));
  await page.getByRole('button', { name: 'Refresh access' }).click();
  await expect(page.getByRole('alert')).toContainText('Access service unavailable');
  await expect(page.getByRole('button', { name: 'Retry access check' })).toBeVisible();
});


test('graph inspector preserves canvas, drafts and viewport on desktop and mobile', async ({ page }) => {
  await setup(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/lab/context-graph');
    await page.locator('.graph-node').first().waitFor();
    await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
    const before = await page.evaluate(() => scrollY);
    await page.locator('.graph-node').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('complementary', { name: 'Graph inspector' })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(before);
    const transform = await page.locator('.graph-stage svg > g').getAttribute('transform');
    await page.getByRole('button', { name: 'Ask about this entity' }).click();
    await page.getByLabel('Your question').fill('Keep this draft');
    await page.locator('.graph-panel-tabs').getByRole('button', { name: 'Details', exact: true }).click();
    await page.locator('.graph-panel-tabs').getByRole('button', { name: 'Assistant', exact: true }).click();
    await expect(page.getByLabel('Your question')).toHaveValue('Keep this draft');
    expect(await page.locator('.graph-stage svg > g').getAttribute('transform')).toBe(transform);
    if (width === 390 && await page.getByRole('button', { name: 'Expand panel', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand panel', exact: true }).click();
    const box = await page.getByRole('button', { name: 'Ask assistant · 1 execution' }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await page.screenshot({path: 'test-results/graph-inspector-'+width+'.png'});
    expect(await page.locator('header').first().evaluate(el => Boolean(el.closest('[inert]')))).toBeTruthy();
    if (width === 390) {
      await page.setViewportSize({ width, height: 450 });
      await page.getByLabel('Your question').focus();
      await expect.poll(async () => { const submit = await page.getByRole('button', { name: 'Ask assistant · 1 execution' }).boundingBox(); return submit!.y + submit!.height; }).toBeLessThanOrEqual(450);
      await page.setViewportSize({ width, height: 900 });
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', {name:'Graph inspector'})).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});


test('model preference persists while graph override remains local to visit', async ({page}) => {
 const state = await setup(page);
 await page.goto('/settings');
 await page.getByLabel('Default assistant model').selectOption('meta/llama-3.2-11b-vision-instruct');
 await page.getByRole('button',{name:'Save model preference'}).click();
 await expect(page.getByText('Your default model was saved.')).toBeVisible();
 await page.reload();await expect(page.getByLabel('Default assistant model')).toHaveValue('meta/llama-3.2-11b-vision-instruct');
 await page.goto('/lab/context-graph');await page.locator('.graph-node').first().waitFor();
 await page.getByRole('button',{name:'Assistant',exact:true}).click();
 await page.getByLabel('Model for this graph').selectOption('nvidia/nemotron-3-super-120b-a12b');
 await page.getByLabel('Your question').fill('Which tests cover this requirement?');
 await page.getByRole('button',{name:'Ask assistant · 1 execution'}).click();
 await expect(page.getByText('Inspect the requirement and its related tests.')).toBeVisible();
 expect(state.executions[0].model).toBe('nvidia/nemotron-3-super-120b-a12b');
 await page.goto('/settings');await expect(page.getByLabel('Default assistant model')).toHaveValue('meta/llama-3.2-11b-vision-instruct');
 await page.goto('/lab/context-graph');await page.locator('.graph-node').first().waitFor();await page.getByRole('button',{name:'Assistant',exact:true}).click();await expect(page.getByLabel('Model for this graph')).toHaveValue('');
});


test('retired legacy pages fall back to home and entity bookmarks retain their parameter', async ({ page }) => {
  await setup(page, { signedIn: false });
  await page.goto('/legacy/index.html');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/legacy/index.html#unknown-page');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/legacy/index.html#/relationship-entity?entity=sample%20entity');
  await expect(page).toHaveURL(/\/lab\/context-graph\/entity\?entity=sample%20entity/);
});
