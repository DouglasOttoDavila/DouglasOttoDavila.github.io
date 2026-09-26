import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";

async function stage(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Mission stages" })
    .getByRole("button", { name, exact: false })
    .click();
}
async function report(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

test("public flagship is discoverable and checkout exercises real branch behavior", async ({
  page,
}) => {
  await page.goto("/lab");
  await page.getByRole("link", { name: "Open Commerce Release Lab" }).click();
  await expect(
    page.getByRole("heading", { name: "Ship the change. Prove the release." }),
  ).toBeVisible();
  await stage(page, "Change");
  await page.getByRole("button", { name: "Run checkout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("invariant violated");
  await page
    .getByRole("button", { name: "Apply prepared fix", exact: true })
    .click();
  await page.getByRole("button", { name: "Run checkout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Order unpaid");
  await page.getByRole("button", { name: "Full", exact: true }).click();
  await page.getByRole("button", { name: "Run checkout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("fully authorized");
  await page
    .getByRole("spinbutton", { name: "Authorization amount" })
    .fill("-1");
  await page.getByRole("button", { name: "Run checkout", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Enter an amount");
});

test("guided mission executes, restores earlier snapshots, and requires a human acknowledgment", async ({
  page,
}) => {
  await page.goto("/lab/commerce-release");
  await page.getByRole("button", { name: "Start step-by-step" }).click();
  const guide = page.getByRole("region", { name: "Workflow guide" });
  for (let i = 0; i < 3; i++)
    await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("invariant violated");
  await guide.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Impact workspace" }),
  ).toBeVisible();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  for (let i = 0; i < 4; i++)
    await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide).toContainText("STEP 8 OF 8");
  let r = await report(page);
  expect(r.runs).toHaveLength(2);
  expect(r.policy.state).toBe("REVIEW PENDING");
  expect(r.localReviewAcknowledged).toBe(false);
  await page.getByRole("checkbox", { name: "I reviewed the diff" }).check();
  r = await report(page);
  expect(r.policy.state).toBe("REVIEW READY");
  expect(r.runs[0].results.some((x: any) => x.status === "fail")).toBe(true);
  expect(r.runs[1].results.every((x: any) => x.status === "pass")).toBe(true);
  expect(r.sourceArtifacts.find((x: any) => x.id === "test-A1").status).toBe(
    "not_run",
  );
  expect(r.limitations.join(" ")).toContain("concurrent");
});

test("budget invalidates current evidence, mandatory checks survive, and previous runs remain", async ({
  page,
}) => {
  await page.goto("/lab/commerce-release?stage=Tests");
  await page.getByRole("button", { name: "Apply prepared fix" }).click();
  await page.getByRole("button", { name: "Run patched checks" }).click();
  await page.getByRole("slider", { name: "Test planning budget" }).fill("4");
  await expect(
    page.getByRole("complementary", { name: "Evidence inspector" }),
  ).toContainText("Execute the current test plan");
  await page.getByRole("button", { name: "Run patched checks" }).click();
  await stage(page, "Verify");
  const r = await report(page);
  expect(r.policy.state).toBe("CONDITIONAL");
  expect(r.runs).toHaveLength(2);
  expect(r.selected).toHaveLength(4);
  expect(r.excluded).toHaveLength(4);
});

test("theme switch retains mission and reduced motion keeps guide under user control", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/commerce-release");
  await page.getByRole("button", { name: "Watch the story" }).click();
  const guide = page.getByRole("region", { name: "Workflow guide" });
  await expect(
    guide.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "studio");
  await expect(guide).toContainText("STEP 2 OF 8");
  await page.getByRole("button", { name: "Terminal", exact: true }).click();
  await expect(guide).toContainText("STEP 2 OF 8");
});

test("mobile inspector supports escape and focus restoration with no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab/commerce-release");
  const open = page.getByRole("button", { name: "Open evidence" });
  await open.click();
  await expect(
    page.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("capture desktop/mobile and Studio together after the executable failure", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("local-page-screenshots/commerce-release", { recursive: true });
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    await page.goto("/lab/commerce-release?stage=Tests");
    await page
      .getByRole("button", { name: "Run checkout", exact: true })
      .click();
    await page.getByRole("button", { name: "Run baseline checks" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    });
    await page.screenshot({
      path: `local-page-screenshots/commerce-release/tests-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, behavior: "instant" });
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  await page.screenshot({
    path: "local-page-screenshots/commerce-release/studio-1536.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
