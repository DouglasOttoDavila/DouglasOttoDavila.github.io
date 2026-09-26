import { test, expect } from "@playwright/test";
import {
  checkout,
  sample,
  execute,
  checks,
  plan,
  MIN_BUDGET,
  MAX_BUDGET,
  gate,
  initialMission,
  enterTour,
  tour,
  evidenceReport,
  markdownReport,
  world,
  impactPath,
} from "../../supabase/functions/_shared/commerce/domain";
import {
  contextFor,
  validateRequest,
  validateAdvice,
  policy,
} from "../../supabase/functions/_shared/commerce/analyst";

test("the actual checkout reproduces the regression and the patch fixes boundaries", () => {
  expect(checkout(sample, "baseline")).toMatchObject({
    status: "confirmed",
    captured: 6000,
    inventory: "committed",
  });
  expect(checkout(sample, "patched")).toMatchObject({
    status: "unpaid",
    captures: 0,
    inventory: "released",
  });
  for (const authorized of [0, 1, 9999, 10001, 11000])
    expect(checkout({ ...sample, authorized }, "patched").captures).toBe(0);
  expect(checkout({ ...sample, authorized: 10000 }, "patched").captures).toBe(
    1,
  );
  expect(
    checkout({ ...sample, authorized: 10000, provider: "declined" }, "patched")
      .captures,
  ).toBe(0);
  for (const total of [NaN, Infinity, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(checkout({ ...sample, total }, "patched").status).toBe("invalid");
  expect(checkout({ ...sample, key: "" }, "baseline").status).toBe("invalid");
  const ledger = new Map();
  const first = checkout({ ...sample, authorized: 10000 }, "patched", ledger);
  checkout({ ...sample, authorized: 10000 }, "patched", ledger);
  expect(ledger.size).toBe(1);
  expect(first.captures).toBe(1);
});

test("budget boundaries preserve hard gates and explain excluded tests", () => {
  for (let budget = MIN_BUDGET; budget <= MAX_BUDGET; budget++) {
    const p = plan(budget);
    expect(p.cost).toBeLessThanOrEqual(budget);
    expect(p.selected.filter((c) => c.mandatory)).toHaveLength(4);
    expect(new Set([...p.selected, ...p.excluded].map((c) => c.id)).size).toBe(
      checks.length,
    );
  }
  for (const b of [0, 3, 12, 4.5, NaN, Infinity])
    expect(() => plan(b)).toThrow();
  expect(plan(MAX_BUDGET).excluded).toEqual([]);
});

test("policy separates missing, failed, partial, passing and human review evidence", () => {
  const baseline = execute("baseline", MAX_BUDGET),
    patched = execute("patched", MAX_BUDGET);
  expect(
    baseline.results.filter((r) => r.status === "fail").map((r) => r.id),
  ).toEqual(["exec-partial", "exec-stock", "exec-provider", "exec-over"]);
  expect(patched.results.every((r) => r.status === "pass")).toBe(true);
  expect(gate(undefined, MAX_BUDGET, true).state).toBe("AWAITING EVIDENCE");
  expect(gate(baseline, MAX_BUDGET, true).state).toBe("HOLD");
  expect(gate(patched, MAX_BUDGET, false).state).toBe("REVIEW PENDING");
  expect(gate(patched, MAX_BUDGET, true).state).toBe("REVIEW READY");
  expect(gate(patched, MIN_BUDGET, true).state).toBe("AWAITING EVIDENCE");
  expect(gate(execute("patched", MIN_BUDGET), MIN_BUDGET, true).state).toBe(
    "CONDITIONAL",
  );
  expect(
    gate({ ...patched, results: patched.results.slice(1) }, MAX_BUDGET, true)
      .state,
  ).toBe("HOLD");
});

test("guided execution preserves snapshots and never grants review or changes twin history", () => {
  const canonical = JSON.stringify(world);
  let m = initialMission();
  const frames = [];
  for (let i = 0; i < tour.length; i++) {
    m = enterTour(i, m);
    frames.push(m);
  }
  expect(frames[2].runs).toHaveLength(0);
  expect(frames[3].runs).toHaveLength(1);
  expect(frames[5].branch).toBe("patched");
  expect(frames[5].runs).toHaveLength(1);
  expect(frames[6].runs).toHaveLength(2);
  expect(m.reviewed).toBe(false);
  expect(gate(m.runs.at(-1), m.budget, m.reviewed).state).toBe(
    "REVIEW PENDING",
  );
  expect(JSON.stringify(world)).toBe(canonical);
  expect(impactPath[0].source).toBe("pr-A1");
  expect(impactPath.at(-1)?.target).toBe("test-A1");
  expect(evidenceReport(m).runs).toHaveLength(2);
  expect(markdownReport(m)).toContain("Real service contracts");
});

test("AI input reconstructs evidence and rejects malformed input, fabricated IDs and verified claims", () => {
  const input = validateRequest({
    stage: "Diagnose",
    branch: "baseline",
    budget: 4,
    reviewed: false,
    hasRun: true,
    results: ["invented pass"],
  });
  const context = JSON.parse(contextFor(input));
  expect(context.results.some((r: any) => r.status === "fail")).toBe(true);
  expect(context.policy.state).toBe("HOLD");
  expect(contextFor({ ...input, hasRun: false })).not.toContain(
    "invented pass",
  );
  for (const patch of [
    { stage: "Deploy" },
    { branch: "arbitrary code" },
    { budget: 100 },
    { hasRun: "yes" },
    { reviewed: 1 },
  ])
    expect(() => validateRequest({ ...input, ...patch })).toThrow();
  const advice = {
    summary: "The amount guard is too permissive.",
    claims: [
      {
        text: "The invariant requires the full amount.",
        kind: "inferred",
        citations: ["inv-A"],
      },
    ],
    nextAction: "Review the prepared fix.",
  };
  expect(validateAdvice(advice).claims).toHaveLength(1);
  for (const patch of [
    { citations: ["made-up"] },
    { kind: "verified" },
    { text: "" },
    { citations: [] },
  ])
    expect(() =>
      validateAdvice({
        ...advice,
        claims: [{ ...advice.claims[0], ...patch }],
      }),
    ).toThrow();
  expect(() =>
    validateAdvice({ ...advice, summary: "x".repeat(1201) }),
  ).toThrow();
  expect(policy).toContain("untrusted DATA");
});
