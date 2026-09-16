import { test, expect } from '@playwright/test';
import { setup } from './terminal-fixture';

const routes = ['/', '/work', '/experience', '/writing', '/about', '/lab',
  '/work/user-story-evaluator', '/work/context-graph', '/work/neural-test-signal-classifier', '/work/ai-document-generator',
  '/lab/user-story-analyzer', '/lab/context-graph', '/lab/context-graph/entity?entity=missing',
  '/lab/neural-test-signal-classifier', '/login', '/settings', '/auth/callback', '/404.html'];

test('version persists through client navigation, reload and return to Studio', async ({ page }) => {
  await setup(page, { signedIn: false });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'studio');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('.terminal-explorer')).toBeVisible();
  await page.locator('.site-nav').getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page).toHaveURL(/\/work\/?$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
  await expect(page.locator('.terminal-explorer [aria-current]')).toHaveText('work/');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.locator('.terminal-explorer')).toBeHidden();
  await expect(page.locator('.site-nav [data-work-nav]')).toHaveAttribute('href', '/#work');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'studio');
});

for (const width of [320, 390, 768, 1280, 1536]) {
  test(`Terminal routes fit and retain readable content at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width < 800 ? 844 : 1024 });
    await setup(page, { admin: true });
    await page.addInitScript(() => localStorage.setItem('portfolio-version', 'terminal'));
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Terminal', exact: true })).toBeVisible();
      if (route === '/lab/context-graph') await expect(page.locator('.graph-node').first()).toBeVisible();
      if (route === '/lab/user-story-analyzer') await expect(page.getByLabel('User story and acceptance criteria')).toBeVisible();
      if (route === '/lab/neural-test-signal-classifier') await expect(page.getByLabel('Failure category')).toBeVisible();
      if (route === '/lab') await expect(page.locator('.catalog-access')).toBeVisible();
      if (route === '/login') await expect(page.locator('.access-loading')).toHaveCount(0);
      if (route.includes('entity?')) await expect(page.getByRole('heading', { name: 'Entity not found.' })).toBeVisible();
      if (route === '/settings') await expect(page.getByRole('button', { name: 'Save site settings' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
      expect(overflow.width, route).toBeLessThanOrEqual(overflow.viewport + 1);
      if (width === 1536 || width === 390) {
        const name = route === '/' ? 'home' : route.replace(/[^a-z0-9]+/gi, '-');
        await page.screenshot({ path: `test-results/terminal-${width}-${name}.png` });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('switching versions retains analyzer draft, result and execution count', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/lab/user-story-analyzer');
  await page.getByRole('button', { name: 'Use an example' }).click();
  const input = page.getByLabel('User story and acceptance criteria');
  const draft = await input.inputValue();
  const element = await input.elementHandle();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(input).toHaveValue(draft);
  expect(await element!.evaluate(el => el.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Review story · 1 execution' }).click();
  await expect(page.getByText('A reviewed story.')).toBeVisible();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.getByText('A reviewed story.')).toBeVisible();
  await expect(input).toHaveValue(draft);
  expect(state.executions).toHaveLength(1);
});

test('graph selection, composer, camera and conversation survive theme switches', async ({ page }) => {
  await setup(page);
  await page.goto('/lab/context-graph');
  const node = page.locator('.graph-node').first();
  await node.focus(); await page.keyboard.press('Enter');
  const record = await page.getByRole('link', { name: 'Open entity record' }).getAttribute('href');
  await page.getByRole('button', { name: 'Ask about this entity' }).click();
  await page.getByLabel('Your question').fill('What depends on this entity?');
  const svg = await page.locator('.graph-stage svg').elementHandle();
  const camera = await page.locator('.graph-stage svg > g').getAttribute('transform');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  expect(await svg!.evaluate(el => el.isConnected)).toBe(true);
  await expect(page.locator('.graph-stage svg > g')).toHaveAttribute('transform', camera!);
  await expect(page.getByLabel('Your question')).toHaveValue('What depends on this entity?');
  await page.getByRole('button', { name: 'Ask assistant · 1 execution' }).click();
  await expect(page.getByText('Inspect the requirement and its related tests.')).toBeVisible();
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page.getByText('Inspect the requirement and its related tests.')).toBeVisible();
  await page.getByRole('complementary', { name: 'Graph inspector' }).getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open entity record' })).toHaveAttribute('href', record!);
});

test('unsaved settings and writing filter survive version changes', async ({ page }) => {
  await setup(page, { admin: true });
  await page.goto('/settings');
  await page.getByLabel('Daily executions across all users').fill('12');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.getByLabel('Daily executions across all users')).toHaveValue('12');
  await page.goto('/writing?topic=quality');
  await expect(page.getByRole('button', { name: 'Quality engineering', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await expect(page).toHaveURL(/topic=quality/);
  await expect(page.getByRole('button', { name: 'Quality engineering', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('storage unavailable and reduced motion remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
  expect(await page.locator('.terminal-cursor').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.locator('.site-nav').getByRole('link', { name: 'About', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'terminal');
});

for (const width of [390, 1440]) {
  test(`Terminal expanded graph and entity record at ${width}px`, async ({ page }) => {
    await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('portfolio-version', 'terminal'));
    await page.goto('/lab/context-graph');
    await expect(page.locator('.graph-node').first()).toBeVisible();
    await page.getByRole('button', { name: 'Expand workspace', exact: true }).click();
    await page.locator('.graph-node').first().focus();
    await page.keyboard.press('Enter');
    const record = await page.getByRole('link', { name: 'Open entity record' }).getAttribute('href');
    await page.getByRole('button', { name: 'Ask about this entity' }).click();
    await page.getByLabel('Your question').fill('Keep the expanded workspace usable');
    if (width === 390 && await page.getByRole('button', { name: 'Expand panel', exact: true }).isVisible()) await page.getByRole('button', { name: 'Expand panel', exact: true }).click();
    const box = await page.getByRole('button', { name: /Ask assistant.*1 execution/ }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `test-results/terminal-expanded-graph-${width}.png` });
    await page.goto(record!);
    await expect(page.getByRole('heading', { name: 'Alpha Suite', exact: true })).toBeVisible();
    await expect(page.locator('.access-loading')).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
    await page.screenshot({ path: `test-results/terminal-entity-${width}.png` });
  });
}

test('Terminal sign-in view resolves without an account', async ({ page }) => {
  await setup(page, { signedIn: false });
  await page.addInitScript(() => localStorage.setItem('portfolio-version', 'terminal'));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Google/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/terminal-sign-in.png' });
});
