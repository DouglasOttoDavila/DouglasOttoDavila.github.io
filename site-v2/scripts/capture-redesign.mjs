import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route("**/auth.runtime.json", (r) =>
  r.fulfill({
    json: {
      supabase: {
        url: "https://zlixsxbovbshsyptxymp.supabase.co",
        anonKey: "public-test-key",
      },
    },
  }),
);
await mkdir("../docs/redesign-2026-09-13/implementation-captures", {
  recursive: true,
});
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  for (const [name, path] of [
    ["home", "/"],
    ["experience", "/experience"],
    ["writing", "/writing"],
    ["lab", "/lab"],
    ["about", "/about"],
    ["access", "/login"],
  ]) {
    await page.goto("http://127.0.0.1:4326" + path);
    await page.locator("main h1").waitFor();
    if (path === "/login")
      await page
        .getByRole("button", { name: "Continue with Google" })
        .waitFor();
    if (path === "/lab") await page.locator(".catalog-access").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    await page.addStyleTag({
      content: "astro-dev-toolbar{display:none!important}",
    });
    await page.screenshot({
      path:
        "../docs/redesign-2026-09-13/implementation-captures/" +
        name +
        "-" +
        width +
        ".png",
      fullPage: true,
    });
  }
}
await browser.close();
