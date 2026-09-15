import { test, expect } from "@playwright/test";
test("native wheel movement is proportional and never snaps", async ({
  page,
}) => {
  await page.goto("/");
  await page.mouse.move(20, 300);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);
  const y = await page.evaluate(() => scrollY);
  expect(y).toBeLessThan(220);
  await page.waitForTimeout(500);
  expect(Math.abs((await page.evaluate(() => scrollY)) - y)).toBeLessThan(2);
});
test("section navigation updates URL and focus without passive history changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore selected work" }).click();
  await expect(page).toHaveURL(/#work$/);
  await expect(page.locator("#work")).toBeFocused();
  await expect
    .poll(() =>
      page
        .locator("#work")
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    )
    .toBeGreaterThan(70);
  const history = await page.evaluate(() => window.history.length);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
});
test("mobile menu supports Escape and navigates to overview from detail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/experience");
  const menu = page.locator(".site-header").getByRole("button", { name: "Menu" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Writing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/#writing$/);
  await expect(page.locator("#writing")).toBeInViewport();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});
test("article filters survive refresh and Back", async ({ page }) => {
  await page.goto("/writing");
  await page.getByRole("button", { name: "Leadership", exact: true }).click();
  await expect(page.locator(".writing-row:visible")).toHaveCount(1);
  await expect(page).toHaveURL(/topic=leadership/);
  await page.reload();
  await expect(page.locator(".writing-row:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".writing-row:visible")).toHaveCount(7);
  await page.goBack();
  await expect(page.locator(".writing-row:visible")).toHaveCount(1);
});
test("reduced motion, direct anchors, and public content without JavaScript", async ({
  page,
  browser,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "Explore selected work" }).click();
  await expect(page.locator("#work")).toBeInViewport();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.goto("/experience");
  await expect(staticPage.locator(".career-entry")).toHaveCount(5);
  await staticPage.locator("summary").nth(1).click();
  await expect(staticPage.locator("details").nth(1)).toHaveAttribute(
    "open",
    "",
  );
  await staticPage.goto("/writing");
  await expect(staticPage.locator(".writing-row")).toHaveCount(7);
  await context.close();
});
for (const width of [320, 390, 768, 1024, 1440, 1920])
  test("public routes fit at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/auth.runtime.json", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    for (const path of [
      "/",
      "/work",
      "/experience",
      "/writing",
      "/lab",
      "/about",
      "/login",
      "/work/context-graph",
    ]) {
      await page.goto(path);
      await page.locator("main h1").waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        path,
      ).toBeTruthy();
    }
  });

test("route navigation focuses the heading and Back restores the originating project link", async ({
  page,
}) => {
  await page.goto("/work");
  const link = page.getByRole("link", { name: "Explore project" }).first();
  await link.click();
  await expect(page.locator("main h1")).toBeFocused();
  await page.goBack();
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
  await page.goForward();
  await expect(page.locator("main h1")).toBeFocused();
});
test("workflow is keyboard selectable without hiding the evidence", async ({
  page,
}) => {
  await page.goto("/");
  const risk = page.getByRole("button", { name: "Risk", exact: true });
  await risk.focus();
  await page.keyboard.press("Enter");
  await expect(risk).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".workflow-caption")).toContainText("ambiguities");
  await expect(page.locator(".workflow-stages>li")).toHaveCount(4);
});
test("enlarged text keeps public reading content within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  for (const path of ["/", "/experience", "/writing", "/about"]) {
    await page.goto(path);
    await page.addStyleTag({
      content:
        "body{font-size:200%}p,li,a,button,summary{font-size:1em!important}",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      path,
    ).toBeTruthy();
  }
});
