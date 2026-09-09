import { test, expect, type Page } from '@playwright/test';

const y = (page: Page) => page.evaluate(() => window.scrollY);
async function ready(page: Page, route = '/') {
  await page.goto(route);
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.mouse.move(10, 300);
}
async function settled(page: Page) {
  await expect(page.locator('html')).not.toHaveClass(/lenis-smooth/);
}

test('wheel lands on main sections and momentum never skips a section', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const principles = await page.locator('.principles').evaluate(el => {
    const rect = el.getBoundingClientRect();
    const header = document.querySelector('.site-header')!.getBoundingClientRect().height;
    return Math.round(scrollY + rect.top + rect.height / 2 - (innerHeight + header) / 2);
  });
  await page.mouse.wheel(0, 80);
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  expect(await y(page)).toBeLessThan(principles);
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(90);
  }
  await settled(page);
  expect(Math.abs(await y(page) - principles)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('principles-stop.png') });
  await page.waitForTimeout(220);
  await page.mouse.wheel(0, 80);
  await expect.poll(() => y(page)).toBeGreaterThan(principles + 50);
  const before = await y(page);
  await page.mouse.wheel(0, -80);
  await expect.poll(() => y(page)).toBeLessThan(before);
  await settled(page);
  expect(Math.abs(await y(page) - principles)).toBeLessThan(2);
});

test('long sections retain overlapping reading stops before the next main section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/writing');
  const index = page.locator('.writing-index');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowDown');
    await settled(page);
    const rect = await index.boundingBox();
    if (rect && rect.y < 150) break;
  }
  const before = await y(page);
  await page.keyboard.press('ArrowDown');
  await settled(page);
  const after = await y(page);
  expect(after - before).toBeGreaterThan(0);
  expect(after - before).toBeLessThan(844 * 0.8);
  await expect(page.locator('.contact-band')).not.toBeInViewport();
});

test('case studies focus their main text headings below the sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page, '/work/context-graph');
  await page.keyboard.press('ArrowDown');
  await settled(page);
  const first = page.locator('.case-study-body > h2').first();
  await expect(first).toBeInViewport();
  const header = await page.locator('.site-header').boundingBox();
  expect((await first.boundingBox())!.y).toBeGreaterThan(header!.height);
  const before = await y(page);
  await page.keyboard.press('ArrowDown');
  await settled(page);
  expect(await y(page)).toBeGreaterThan(before);
});

test('each arrow press advances one reading stop and holding does not skip', async ({ page }) => {
  await ready(page);
  await page.keyboard.down('ArrowDown');
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  await settled(page);
  const stopped = await y(page);
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(250);
  expect(await y(page)).toBe(stopped);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => y(page)).toBeLessThan(stopped - 30);
  await settled(page);
});

test('nested scrolling, editable fields and graph gestures retain native ownership', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const fixture = document.createElement('div');
    fixture.style.cssText = 'position:fixed;inset:150px auto auto 50px;z-index:9999;background:black';
    fixture.innerHTML = '<textarea aria-label="Scroll test input">one\ntwo\nthree</textarea><div id="nested" tabindex="0" style="height:100px;width:200px;overflow:auto"><div style="height:1000px">Nested</div></div><div class="graph-stage" style="height:100px">Graph gesture</div>';
    document.body.append(fixture);
  });
  await page.locator('#nested').hover();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.locator('#nested').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await y(page)).toBe(0);
  await page.getByRole('textbox', { name: 'Scroll test input' }).focus();
  await page.keyboard.press('ArrowDown');
  expect(await y(page)).toBe(0);
  const native = await page.locator('.graph-stage').evaluate(el => {
    const wheel = new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true });
    el.dispatchEvent(wheel);
    return !wheel.defaultPrevented;
  });
  expect(native).toBe(true);
});

test('reduced motion works initially and when toggled during inertia', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  expect(await page.locator('html').evaluate(el => getComputedStyle(el).scrollBehavior)).toBe('auto');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.mouse.move(10, 300);
  await page.mouse.wheel(0, 700);
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).not.toHaveClass(/lenis/);
  const stopped = await y(page);
  await page.waitForTimeout(200);
  expect(await y(page)).toBe(stopped);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => y(page)).toBeGreaterThan(stopped);
});

test('Astro navigation restores history and never multiplies keyboard listeners', async ({ page }) => {
  await ready(page);
  await page.mouse.wheel(0, 650);
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  await settled(page);
  const restored = await y(page);
  await page.locator('.site-nav a[href="/about"]').evaluate((el: HTMLAnchorElement) => el.click());
  await expect(page).toHaveURL(/\/about\/?$/);
  await expect.poll(() => y(page)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => y(page)).toBe(restored);
  await expect(page.locator('html')).toHaveClass(/lenis/);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => y(page)).toBeGreaterThan(restored);
  await settled(page);
  const next = await y(page);
  await page.keyboard.press('ArrowUp');
  await settled(page);
  expect(next).toBeGreaterThan(restored);
  expect(Math.abs(await y(page) - restored)).toBeLessThan(2);
});

test('native scrollbar/programmatic movement and page keys interrupt inertia', async ({ page }) => {
  await ready(page);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  await page.mouse.down();
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect(await y(page)).toBe(200);
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)))).toBeLessThan(2);
  await page.keyboard.press('ArrowDown');
  await settled(page);
  await page.keyboard.press('Home');
  await expect.poll(() => y(page)).toBe(0);
});

test('touch gestures remain native on a narrow viewport and content growth updates bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page, '/404.html');
  expect(await page.evaluate(() => {
    const event = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'targetTouches', { value: [{ clientX: 10, clientY: 200 }] });
    document.body.dispatchEvent(event);
    return !event.defaultPrevented;
  })).toBe(true);
  await page.evaluate(() => {
    const content = document.createElement('div');
    content.style.height = '3000px';
    document.querySelector('main > section')!.append(content);
  });
  await page.waitForTimeout(300); // ResizeObserver debounce after dynamic content arrives.
  await page.mouse.wheel(0, 1600);
  await expect.poll(() => y(page)).toBeGreaterThan(0);
  await settled(page);
  const first = await y(page);
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => y(page)).toBeGreaterThan(first);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const route of ['/', '/about', '/experience', '/writing', '/work', '/work/ai-document-generator', '/work/context-graph', '/work/neural-test-signal-classifier', '/work/user-story-evaluator', '/lab', '/login', '/settings', '/auth/callback', '/lab/context-graph', '/lab/context-graph/entity', '/lab/neural-test-signal-classifier', '/lab/user-story-analyzer', '/404.html']) {
  test(`shared scrolling loads on ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await ready(page, route);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => y(page)).toBeGreaterThan(0);
    await settled(page);
    expect(errors).toEqual([]);
  });
}
