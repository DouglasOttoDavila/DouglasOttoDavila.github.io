import { test, expect, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
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
    calls.push(route.request().postDataJSON());
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
        claims: [
          {
            kind: response === "bad" ? "verified" : "inferred",
            text: "The partial authorization violates the invariant.",
            citations: ["inv-A"],
          },
        ],
        nextAction: "Run the regression check.",
        model: "test-model",
        generatedAt: "2026-09-26T12:00:00Z",
        aiUsage: usage,
      },
    });
  });
  await page.goto("/lab/commerce-release?stage=Tests");
  await page.locator(".cr-ai > summary").click();
  const disabledBuild = await page
    .getByText("Live AI is not enabled in this build.", { exact: false })
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
  await page.getByRole("button", { name: "Analyze again" }).click();
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
    await expect(page.locator(".cr-advice")).toContainText(
      "Authored explanation",
    );
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
