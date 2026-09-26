import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import {
  getSnapshot,
  exportSnapshot,
} from "../../supabase/functions/_shared/twin/domain";
async function choose(page: Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
}
async function exported(page: Page) {
  const download = page.waitForEvent("download");
  await page
    .getByRole("region", { name: "Event timeline" })
    .getByRole("button", { name: "Export JSON ↓" })
    .click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test('server-rendered controls wait for hydration before accepting interaction',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/*QualityTwin*',async route=>{await gate;await route.continue();});
 await page.goto('/lab/quality-digital-twin',{waitUntil:'commit'});
 try{await expect(page.getByRole('button',{name:'Next event →',exact:true})).toBeDisabled();}finally{release();}
 await expect(page.getByRole('button',{name:'Next event →',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Next event →',exact:true}).click();await expect(page.getByRole('slider',{name:'Replay position'})).toHaveValue('1');
});
for (const width of [1440, 390])
  test(`guided A/B/C, every what-if and matching export at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/lab");
    await page.locator('a[href="/lab/quality-digital-twin"]').click();
    await expect(
      page.getByRole("slider", { name: "Replay position" }),
    ).toHaveValue("0");
    await page
      .getByRole("button", { name: "Run the partial-authorization check →" })
      .click();
    await expect(page.locator(".tw-transition")).toContainText("Failed");
    await expect(
      page.getByRole("complementary", { name: "Artifact inspector" }),
    ).toContainText("1 failed check remains.");
    await choose(page, "What-if");
    await page
      .getByRole("button", { name: "Resolve A blocker", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Resolve A blocker", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".tw-fork-comparison")).toContainText(
      "Open → Resolved",
    );
    await expect(page.getByRole("tabpanel")).toContainText(
      "1 failed check remains.",
    );
    let s = await exported(page);
    expect(s.mode).toBe("fork");
    expect(s.cursor).toBe(s.events.at(-1).id);
    expect(s.entities.find((e: any) => e.id === "test-A1").status).toBe("fail");
    await page.getByRole("button", { name: "Undo fork edit" }).click();
    expect((await exported(page)).mode).toBe("canonical");
    await page
      .getByRole("button", { name: "Candidate B", exact: false })
      .click();
    await expect(
      page.getByRole("button", { name: "Reopen visual issue", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Latest evidence" }).click();
    await page
      .getByRole("button", { name: "Reopen visual issue", exact: true })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Artifact inspector" }),
    ).toContainText("5 passed · 0 failed · 0 unverified");
    await expect(page.locator(".tw-fork-comparison")).toContainText(
      "Resolved → Open",
    );
    await page.getByRole("button", { name: "Discard fork" }).click();
    expect(await exported(page)).toEqual(
      JSON.parse(exportSnapshot(getSnapshot("B"))),
    );
    await page
      .getByRole("button", { name: "Candidate C", exact: false })
      .click();
    await page.getByRole("button", { name: "Latest evidence" }).click();
    await page
      .getByRole("button", { name: "Retry test: pass", exact: true })
      .click();
    await page.getByRole("button", { name: "Grant C code review" }).click();
    await expect(page.getByRole("tabpanel")).toContainText(
      "Release sign-off is pending.",
    );
    await page
      .getByRole("button", { name: "Retry test: fail", exact: true })
      .click();
    s = await exported(page);
    expect(s.entities.find((e: any) => e.id === "test-C2").status).toBe("fail");
    expect(s.entities.find((e: any) => e.id === "review-C").status).toBe(
      "granted",
    );
    expect(s.entities.find((e: any) => e.id === "signoff-C").status).toBe(
      "pending",
    );
    await page.getByRole("button", { name: "Undo fork edit" }).click();
    expect(
      (await exported(page)).entities.find((e: any) => e.id === "test-C2")
        .status,
    ).toBe("pass");
    await page.getByRole("button", { name: "Previous event" }).click();
    expect(await exported(page)).toEqual(
      JSON.parse(exportSnapshot(getSnapshot("C", "event-C2"))),
    );
    await choose(page, "Analyst");
    await page.getByRole("button", { name: "Replay interpretation" }).click();
    await expect(page.locator(".tw-analysis")).toContainText(
      "Replay · authored synthetic example",
    );
    await page
      .locator(".tw-citations")
      .getByRole("button", {
        name: "20 concurrent retries create one row",
        exact: true,
      })
      .first()
      .click();
    await expect(page.locator(".tw-analysis")).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: "Inspect source ↓", exact: true }).click();
      await expect(page.locator(".tw-source")).toHaveAttribute("open", "");
      await expect(page.locator(".tw-source summary")).toBeFocused();
      await expect(page.locator(".tw-source")).toContainText("test-C2");
    }
    await expect(
      page.getByRole("heading", {
        name: "20 concurrent retries create one row",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Analyze with AI", exact: true }),
    ).toBeDisabled();
    await choose(page, "Artifacts");
    await page.getByLabel("Search artifacts").fill("nothing-matches-here");
    await expect(
      page.getByText("No matching artifacts.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clear search and filters" })
      .click();
    await page.getByLabel("Artifact type").selectOption("telemetry");
    await page.getByLabel("Search artifacts").fill("unmapped");
    await page
      .getByRole("button", {
        name: "Unmapped warehouse observation",
        exact: false,
      })
      .click();
    await expect(
      page.getByText(
        "Unknown / unmapped. No relationship is inferred from a name.",
      ),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("slider", { name: "Replay position" }),
    ).toHaveValue("0");
    await expect(
      page.getByRole("region", { name: "Event timeline" }),
    ).toContainText("Canonical history");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await mkdir("local-page-screenshots/quality-twin-review", {
      recursive: true,
    });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `local-page-screenshots/quality-twin-review/baseline-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Run the partial-authorization check →" })
      .click();
    await choose(page, "System map");
    await page
      .getByRole("heading", { name: "Quality Digital Twin", exact: true })
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `local-page-screenshots/quality-twin-review/payment-${width}.png`,
      fullPage: true,
    });
  });
test("keyboard timeline, topology equivalence, changing trails, playback and theme continuity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/quality-digital-twin");
  const slider = page.getByRole("slider", { name: "Replay position" });
  await expect(slider).toBeEnabled();
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(slider).toHaveValue("2");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("tab", { name: "System map", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Evidence trail", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Evidence trail", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: "Full auth captures once test", exact: false })
    .click();
  await expect(page.locator(".tw-trail")).toContainText(
    "Recorded execution A.2",
  );
  await expect(page.locator(".tw-trail")).not.toContainText(
    "Recorded execution A.1",
  );
  await choose(page, "System map");
  await page.getByRole("button", { name: "Show list", exact: true }).click();
  await page
    .locator(".tw-map-list > div > button")
    .filter({ hasText: "Payment adapter" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment adapter", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Focus on selected service & dependencies" })
    .check();
  await expect(
    page
      .locator(".tw-map-list")
      .getByRole("button", { name: "Catalog search", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(slider).toHaveValue("2");
  await expect(
    page.getByRole("heading", { name: "Payment adapter", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
