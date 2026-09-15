import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
const report = [];
for (const route of [
  "/",
  "/experience",
  "/writing",
  "/lab",
  "/about",
  "/login",
  "/work",
  "/work/context-graph",
  "/404",
]) {
  await page.goto("http://127.0.0.1:4326" + route);
  await page.locator("main h1").waitFor();
  if (route === "/login")
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
  if (route === "/lab") await page.locator(".catalog-access").waitFor();
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const rgb = (s) => {
      const m = s.match(/[\d.]+/g);
      return m ? m.map(Number) : [0, 0, 0, 0];
    };
    const lum = (c) =>
      c
        .slice(0, 3)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    let minimum = 100;
    const failures = [];
    let checked = 0;
    for (const el of document.querySelectorAll("main *,header *,footer *")) {
      if (
        !(el instanceof HTMLElement) ||
        !el.getClientRects().length ||
        el.closest("[hidden],.sr-only") ||
        !Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent.trim(),
        )
      )
        continue;
      const style = getComputedStyle(el);
      let node = el,
        bg;
      while (node) {
        const c = rgb(getComputedStyle(node).backgroundColor);
        if (c.length < 4 || c[3] >= 0.99) {
          bg = c;
          break;
        }
        node = node.parentElement;
      }
      bg ||= [250, 251, 248];
      const fg = rgb(style.color);
      if (fg.length > 3 && fg[3] === 0) continue;
      const a = lum(fg),
        b = lum(bg),
        ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      minimum = Math.min(minimum, ratio);
      checked++;
      const large =
        parseFloat(style.fontSize) >= 24 ||
        (parseFloat(style.fontSize) >= 18.66 &&
          Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        failures.push({
          text: el.textContent.trim().slice(0, 80),
          color: style.color,
          ratio: Number(ratio.toFixed(2)),
        });
    }
    return {
      title: document.title,
      h1: document.querySelector("main h1")?.textContent,
      checkedText: checked,
      minimumTextContrast: Number(minimum.toFixed(2)),
      contrastFailures: failures,
      overflow: document.documentElement.scrollWidth > innerWidth,
      internalLinks: [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .filter((h) => h.startsWith("/") || h.startsWith("#")),
    };
  });
  report.push({ route, ...result });
}
const hrefs = [
  ...new Set(
    report.flatMap((r) => r.internalLinks).filter((h) => h.startsWith("/")),
  ),
];
const links = [];
for (const href of hrefs) {
  const response = await page.request.get("http://127.0.0.1:4326" + href);
  links.push({ href, status: response.status() });
}
await mkdir("../docs/redesign-2026-09-13/implementation-captures", {
  recursive: true,
});
await writeFile(
  "../docs/redesign-2026-09-13/implementation-captures/browser-audit.json",
  JSON.stringify(
    {
      note: "Local browser audit. Contrast samples visible HTML text against solid ancestor surfaces; not a complete WCAG certification. Lab uses signed-out fixture configuration. External OAuth and production field performance are not simulated as live evidence.",
      routes: report,
      links,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      routes: report.length,
      textSamples: report.reduce((n, r) => n + r.checkedText, 0),
      contrastFailures: report.flatMap((r) => r.contrastFailures),
      brokenInternalLinks: links.filter((l) => l.status >= 400),
    },
    null,
    2,
  ),
);
await browser.close();
