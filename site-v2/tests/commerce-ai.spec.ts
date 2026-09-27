import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { checks } from "../../supabase/functions/_shared/commerce/domain";
const uid = "11111111-1111-4111-8111-111111111111",
  project = "zlixsxbovbshsyptxymp";
const usage = {
  lifetime_used: 1,
  lifetime_limit: 10,
  lifetime_remaining: 9,
  daily_used: 1,
  daily_limit: 10,
  daily_remaining: 9,
  resets_at: "2026-09-27T03:00:00Z",
  timezone: "America/Sao_Paulo",
  paused: false,
};
async function setup(
  page: Page,
  response: "valid" | "bad" | "error" | "exhausted" = "valid",
) {
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp: 9999999999 })).toString("base64url")}.test`;
  await page.addInitScript(
    ({ token, uid, project }) => {
      localStorage.setItem(
        `sb-${project}-auth-token`,
        JSON.stringify({
          access_token: token,
          refresh_token: "test",
          token_type: "bearer",
          expires_at: 9999999999,
          expires_in: 3600,
          user: {
            id: uid,
            aud: "authenticated",
            email: "demo@example.test",
            app_metadata: {},
            user_metadata: {},
          },
        }),
      );
    },
    { token, uid, project },
  );
  await page.route("**/auth.runtime.json", (route) =>
    route.fulfill({
      json: {
        supabase: {
          url: `https://${project}.supabase.co`,
          anonKey: "test-public",
        },
      },
    }),
  );
  const calls: any[] = [];
  await page.route(`https://${project}.supabase.co/**`, async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ headers, body: "" });
    if (route.request().url().includes("/auth/v1/"))
      return route.fulfill({
        headers,
        json: { id: uid, email: "demo@example.test" },
      });
    if (route.request().url().endsWith("/lab-access"))
      return route.fulfill({
        headers,
        json: {
          access: { state: "approved", is_admin: false },
          usage: {
            ...usage,
            daily_remaining: response === "exhausted" ? 0 : 9,
          },
        },
      });
    if (route.request().url().endsWith("/model-catalog")) return route.fulfill({headers, json: {models: [{id:"test-model", label:"Test model", verified:true}, {id:"fast-model", label:"Fast model", verified:true}], defaultModel:"test-model", checkedAt:"2026-09-27"}});
    const payload = route.request().postDataJSON();
    calls.push(payload);
    if (response === "error")
      return route.fulfill({
        headers,
        status: 502,
        json: {
          error: "AI provider failed. This dispatched execution was counted.",
        },
      });
    return route.fulfill({
      headers,
      json: {
        summary: "Review the exact-amount rule.",
        risk: "AI business impact: underfunded orders can reach fulfillment.",
        tourTip: "AI tip: compare the regression and the repaired guard.",
        checkReasons: checks.map(c => ({id:c.id, reason:`AI rationale for ${c.id}`})),
        claims: [
          {
            kind: response === "bad" ? "verified" : "inferred",
            text: "The partial authorization violates the invariant.",
            citations: ["inv-A"],
          },
        ],
        nextAction: "Run the regression check.",
        model: payload.model,
        generatedAt: "2026-09-26T12:00:00Z",
        aiUsage: usage,
      },
    });
  });
  await page.goto("/lab/commerce-release?stage=Tests");
  const disabledBuild = await page
    .getByText("Live AI is unavailable in this build.", { exact: false })
    .count();
  test.skip(
    !!disabledBuild,
    "Build with PUBLIC_COMMERCE_AI_ENABLED=true to exercise the authenticated adapter.",
  );
  return calls;
}
test("live analysis uses submitted state, validates output and marks changed inputs stale", async ({
  page,
}) => {
  const calls = await setup(page);
  await page.getByRole("button", { name: "Run live analysis" }).click();
  await expect(page.locator(".cr-live")).toContainText("test-model");
  expect(calls[0]).toMatchObject({
    stage: "Tests",
    branch: "baseline",
    budget: 11,
    hasRun: false,
  });
  await page.getByRole("button", { name: "Run baseline checks" }).click();
  await expect(page.locator(".cr-live")).toContainText("Stale analysis");
  await page.getByRole("button", { name: "Run live analysis" }).click();
  await expect(page.locator(".cr-live")).not.toContainText("Stale analysis");
  expect(calls[1].hasRun).toBe(true);
  expect(calls[0].request_id).not.toBe(calls[1].request_id);
});
for (const mode of ["bad", "error"] as const)
  test(`AI ${mode} response remains visibly failed without a fabricated fallback`, async ({
    page,
  }) => {
    await setup(page, mode);
    await page.getByRole("button", { name: "Run live analysis" }).click();
    await expect(page.locator(".cr-ai [role=alert]")).toBeVisible();
    await expect(page.locator(".cr-live")).toHaveCount(0);
    await expect(page.locator(".cr-ai-field").first()).toContainText("reference fallback");
  });
test("exhausted quota disables AI but keeps the commerce sandbox usable", async ({
  page,
}) => {
  await setup(page, "exhausted");
  await expect(
    page.getByRole("button", { name: "Run live analysis" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Run checkout", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("invariant violated");
});

test("signed-in model selection changes request and AI replaces fallback fields", async ({page}) => {
  const calls = await setup(page);
  await expect(page.locator(".cr-ai").getByRole("link", {name:"Sign in", exact:true})).toHaveCount(0);
  await page.getByRole("combobox", {name:"Analysis model"}).selectOption("fast-model");
  await page.getByRole("button", {name:"Run live analysis"}).click();
  await expect(page.locator(".cr-live")).toContainText("fast-model");
  expect(calls[0].model).toBe("fast-model");
  await expect(page.locator(".cr-ai-field").first()).toContainText("Review the exact-amount rule.");
  await expect(page.locator(".cr-ai-field").first()).not.toContainText("Reference fallback");
  await page.getByText("Why these checks? View selection and residuals", {exact:true}).click();
  await expect(page.locator(".cr-selection-row").first()).toContainText("AI rationale for exec-partial");
});

test("automatic analysis is opt-in, caches prior states and stops at quota", async ({page}) => {
  const calls = await setup(page);
  await expect(page.getByRole("button", {name:"Run live analysis"})).toBeEnabled();
  expect(calls).toHaveLength(0);
  await page.getByRole("checkbox", {name:"Analyze as I explore"}).check();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator(".cr-live")).toBeVisible();
  const stages = page.getByRole("navigation",{name:"Mission stages"});
  await stages.getByRole("button",{name:"Impact"}).click();
  await expect.poll(() => calls.length).toBe(2);
  await expect(page.locator(".cr-live")).not.toContainText("Stale analysis");
  await stages.getByRole("button",{name:"Tests"}).click();
  await expect(page.locator(".cr-ai-field").first()).toContainText("Live AI");
  await page.waitForTimeout(1200);
  expect(calls).toHaveLength(2);
});

test("catalog failure fails closed and does not mislabel an authenticated user", async ({page}) => {
  await setup(page);
  await page.route("**/functions/v1/model-catalog", route => route.fulfill({status:503,json:{error:"Unavailable"}}));
  await page.getByRole("button",{name:"Refresh access"}).click();
  await expect(page.locator(".cr-ai")).toContainText("Models could not be loaded");
  await expect(page.getByRole("button",{name:"Run live analysis"})).toBeDisabled();
  await expect(page.locator(".cr-ai").getByRole("link",{name:"Sign in",exact:true})).toHaveCount(0);
});
