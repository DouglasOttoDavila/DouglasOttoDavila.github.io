type Entity = {
  id: string;
  type: string;
  title: string;
  content: string;
  provenance: string;
  status?: string;
};
type Relationship = {
  id: string;
  source: string;
  target: string;
  type: string;
  provenance: string;
  basis: "authored relationship";
};

export const VERSION = "commerce-sandbox/1";
// Browser-safe projection of the canonical Meridian records. The Edge Function
// validates against the full twin corpus; this projection keeps the static
// browser test/runtime independent from Deno's `.ts` import resolver.
export const world = { fixtureRevision: "meridian-1" };
const records: Entity[] = [
  ["story-A", "story", "Buyer outcome A", "As a buyer, an under-authorized order remains unpaid and stock is released."],
  ["ac-A", "criterion", "Acceptance A", "Partial authorization must never become a captured payment."],
  ["inv-A", "invariant", "Invariant A", "Partial authorization must never become a captured payment."],
  ["pr-A1", "pr", "payment change 1", "- if (auth.amount === order.total) capture(auth);\n+ if (auth.amount > 0) capture(auth);"],
  ["file-A1", "file", "services/payment/handler.ts", "Bounded synthetic source excerpt for the payment guard."],
  ["payment", "service", "payment", "Authorization and capture adapter"],
  ["api-payment", "api", "payment contract", "POST /v1/payment; tenant-scoped JSON contract."],
  ["cap-A", "capability", "Partial authorization", "Checkout payment capability."],
  ["checkout", "service", "checkout", "Order orchestration"],
  ["test-A1", "test", "Partial auth 60/100 causes zero captures", "0"],
  ["test-A2", "test", "Full auth captures once", "1"],
  ["test-A3", "test", "Provider partial status maps to unpaid", "unpaid"],
  ["test-A4", "test", "Checkout partial auth releases stock", "released"],
].map(([id, type, title, content]) => ({ id, type, title, content, provenance: "authored-fixture:meridian-1", status: type === "test" ? "not_run" : undefined }));
const getRecord = (id: string) => records.find((record) => record.id === id);
export const stages = [
  "Requirement",
  "Change",
  "Impact",
  "Tests",
  "Diagnose",
  "Verify",
] as const;
export type Stage = (typeof stages)[number];
export type Branch = "baseline" | "patched";
export type Checkout = {
  total: number;
  authorized: number;
  provider: "approved" | "partial" | "declined";
  key: string;
};
export type Receipt = {
  status: "confirmed" | "unpaid" | "invalid";
  captures: number;
  captured: number;
  inventory: "committed" | "released";
  events: string[];
};

// Prices are integer cents. Both UI and assertions execute this function; no eval or generated code.
export function checkout(
  input: Checkout,
  branch: Branch,
  ledger = new Map<string, Receipt>(),
): Receipt {
  if (
    !Number.isSafeInteger(input.total) ||
    input.total <= 0 ||
    !Number.isSafeInteger(input.authorized) ||
    input.authorized < 0 ||
    !input.key ||
    !["approved", "partial", "declined"].includes(input.provider)
  ) {
    return {
      status: "invalid",
      captures: 0,
      captured: 0,
      inventory: "released",
      events: ["request rejected: invalid amount or key"],
    };
  }
  const previous = ledger.get(input.key);
  if (previous)
    return {
      ...previous,
      events: [
        ...previous.events,
        "idempotency: existing receipt returned; no additional capture",
      ],
    };
  const accepted =
    input.provider !== "declined" &&
    (branch === "baseline"
      ? input.authorized > 0
      : input.authorized === input.total);
  const result: Receipt = {
    status: accepted ? "confirmed" : "unpaid",
    captures: accepted ? 1 : 0,
    captured: accepted ? input.authorized : 0,
    inventory: accepted ? "committed" : "released",
    events: [
      "inventory reserved",
      `provider: ${input.provider}; authorized=${input.authorized}; requested=${input.total}`,
      `guard (${branch}): ${accepted}`,
      accepted
        ? "payment captured; order confirmed; inventory committed"
        : "no capture; order unpaid; inventory released",
    ],
  };
  ledger.set(input.key, result);
  return result;
}
export const sample: Checkout = {
  total: 10000,
  authorized: 6000,
  provider: "partial",
  key: "sample-42",
};
export type Check = {
  id: string;
  title: string;
  source: string;
  cost: number;
  mandatory: boolean;
  reason: string;
  expected: string;
  input: Checkout;
  observe: (r: Receipt) => string;
  retry?: boolean;
};
export const checks: Check[] = [
  {
    id: "exec-partial",
    source: "test-A1",
    title: "Partial authorization never captures",
    cost: 1,
    mandatory: true,
    reason: "Changed payment invariant; mandatory release gate.",
    expected: "0",
    input: sample,
    observe: (r) => String(r.captures),
  },
  {
    id: "exec-full",
    source: "test-A2",
    title: "Full authorization captures once",
    cost: 1,
    mandatory: true,
    reason: "Protect the successful purchase path.",
    expected: "1",
    input: { ...sample, authorized: 10000, provider: "approved" },
    observe: (r) => String(r.captures),
  },
  {
    id: "exec-declined",
    source: "api-payment",
    title: "Declined payment remains unpaid",
    cost: 1,
    mandatory: true,
    reason: "Provider rejection must never confirm an order.",
    expected: "unpaid",
    input: { ...sample, authorized: 0, provider: "declined" },
    observe: (r) => r.status,
  },
  {
    id: "exec-stock",
    source: "test-A4",
    title: "Partial payment releases inventory",
    cost: 1,
    mandatory: true,
    reason: "Compensation protects stock after rejected authorization.",
    expected: "released",
    input: sample,
    observe: (r) => r.inventory,
  },
  {
    id: "exec-provider",
    source: "test-A3",
    title: "Partial provider response maps to unpaid",
    cost: 2,
    mandatory: false,
    reason: "Contract behavior around partial approval.",
    expected: "unpaid",
    input: sample,
    observe: (r) => r.status,
  },
  {
    id: "exec-over",
    source: "inv-A",
    title: "Mismatched excess authorization is rejected",
    cost: 2,
    mandatory: false,
    reason: "Boundary of the exact-amount contract.",
    expected: "0",
    input: { ...sample, authorized: 11000 },
    observe: (r) => String(r.captures),
  },
  {
    id: "exec-zero",
    source: "api-payment",
    title: "Zero-value order is rejected",
    cost: 1,
    mandatory: false,
    reason: "Validate untrusted monetary input before capture.",
    expected: "invalid",
    input: { ...sample, total: 0 },
    observe: (r) => r.status,
  },
  {
    id: "exec-retry",
    source: "api-payment",
    title: "Sequential duplicate reuses the receipt",
    cost: 2,
    mandatory: false,
    reason: "Local sequential retry protection; not concurrent safety.",
    expected: "1",
    input: { ...sample, authorized: 10000, provider: "approved" },
    observe: (r) => String(r.captures),
    retry: true,
  },
];
export const MIN_BUDGET = 4;
export const MAX_BUDGET = checks.reduce((n, c) => n + c.cost, 0);
export function plan(budget: number) {
  if (!Number.isInteger(budget) || budget < MIN_BUDGET || budget > MAX_BUDGET)
    throw new Error("Invalid test budget");
  let cost = 0;
  const selected = checks.filter((c) => {
    if (c.mandatory || cost + c.cost <= budget) {
      cost += c.cost;
      return true;
    }
    return false;
  });
  return {
    selected,
    excluded: checks.filter((c) => !selected.includes(c)),
    cost,
  };
}
export type Result = {
  id: string;
  source: string;
  title: string;
  expected: string;
  actual: string;
  status: "pass" | "fail";
  events: string[];
};
export function executeCheck(check: Check, branch: Branch): Result {
  const ledger = new Map<string, Receipt>();
  let receipt = checkout(check.input, branch, ledger);
  if (check.retry) {
    checkout(check.input, branch, ledger);
    receipt = {
      ...receipt,
      captures: [...ledger.values()].reduce((n, r) => n + r.captures, 0),
      events: [
        ...receipt.events,
        "duplicate request executed; counted stored captures",
      ],
    };
  }
  const actual = check.observe(receipt);
  return {
    id: check.id,
    source: check.source,
    title: check.title,
    expected: check.expected,
    actual,
    status: actual === check.expected ? "pass" : "fail",
    events: receipt.events,
  };
}
export type Run = {
  version: string;
  branch: Branch;
  budget: number;
  mode: "browser-execution";
  at: string;
  durationMs: number;
  results: Result[];
};
export function execute(branch: Branch, budget: number): Run {
  const started = performance.now();
  const results = plan(budget).selected.map((c) => executeCheck(c, branch));
  return {
    version: VERSION,
    branch,
    budget,
    mode: "browser-execution",
    at: new Date().toISOString(),
    durationMs: performance.now() - started,
    results,
  };
}
export function gate(run: Run | undefined, budget: number, reviewed: boolean) {
  if (!run || run.budget !== budget)
    return {
      state: "AWAITING EVIDENCE",
      reason: "Execute the current test plan. Previous runs remain in history.",
    };
  if (run.results.some((r) => r.status === "fail"))
    return {
      state: "HOLD",
      reason:
        "An executed assertion failed. Inspect the result before release review.",
    };
  if (
    checks
      .filter((c) => c.mandatory)
      .some(
        (c) => !run.results.some((r) => r.id === c.id && r.status === "pass"),
      )
  )
    return {
      state: "HOLD",
      reason: "A mandatory check has no passing execution.",
    };
  if (plan(budget).excluded.length)
    return {
      state: "CONDITIONAL",
      reason:
        "Mandatory checks pass; budget-excluded checks remain unverified.",
    };
  if (!reviewed)
    return {
      state: "REVIEW PENDING",
      reason:
        "Sandbox checks pass. Acknowledge the diff and evidence limitations.",
    };
  return {
    state: "REVIEW READY",
    reason:
      "The sandbox evidence is ready for human review. This is not production release approval.",
  };
}
export const limitations = [
  "Browser checks execute the local commerce model; they do not contact a payment provider.",
  "Real service contracts, capture timeouts and concurrent distributed retries remain unverified.",
  "Planning minutes are illustrative costs, not measured runtime or claimed CI savings.",
  "The local acknowledgment is not an organizational approval or release sign-off.",
];
export function artifact(id: string): Entity | undefined {
  return getRecord(id);
}
export const impactPath: Relationship[] = [
  { id: "pr-A1:changes:file-A1", source: "pr-A1", target: "file-A1", type: "changes", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
  { id: "file-A1:implements:payment", source: "file-A1", target: "payment", type: "implements", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
  { id: "payment:exposes:api-payment", source: "payment", target: "api-payment", type: "exposes", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
  { id: "api-payment:enables:cap-A", source: "api-payment", target: "cap-A", type: "enables", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
  { id: "cap-A:constrains:inv-A", source: "cap-A", target: "inv-A", type: "constrains", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
  { id: "inv-A:verifies:test-A1", source: "inv-A", target: "test-A1", type: "verifies", provenance: "authored-fixture:meridian-1", basis: "authored relationship" },
];
export const sourceIds = [
  "story-A",
  "ac-A",
  "pr-A1",
  "file-A1",
  "payment",
  "api-payment",
  "cap-A",
  "inv-A",
  "test-A1",
  "test-A2",
  "test-A3",
  "test-A4",
  "checkout",
  "inventory",
  "pr-A2",
];
export const diff = {
  baseline: "if (auth.amount > 0) capture(auth);",
  patched: "if (auth.amount === order.total) capture(auth);",
};
export const guidance: Record<Stage, { text: string; citations: string[] }> = {
  Requirement: {
    text: "“Payment succeeded” is ambiguous. Specify that only an authorization matching the full order amount may be captured; otherwise the order remains unpaid and stock is released.",
    citations: ["story-A", "ac-A", "inv-A"],
  },
  Change: {
    text: "The proposed change accepts any positive amount. The original exact-amount guard was stronger. A positive authorization does not prove the order is fully authorized.",
    citations: ["pr-A1", "file-A1", "inv-A"],
  },
  Impact: {
    text: "The explicit source trail links the changed payment handler to the payment API, the business invariant, and its assertions. Service dependencies are potential propagation paths, not proof of defects.",
    citations: ["file-A1", "payment", "api-payment", "inv-A"],
  },
  Tests: {
    text: "Keep partial authorization, the successful purchase path, decline handling, and stock compensation as mandatory checks. A smaller plan trades optional boundary evidence for planning time.",
    citations: ["test-A1", "test-A2", "test-A4"],
  },
  Diagnose: {
    text: "A 60/100 authorization satisfies the relaxed positive-amount guard. Restore the exact-amount condition, then rerun both the regression and the successful checkout path.",
    citations: ["pr-A1", "test-A1", "inv-A"],
  },
  Verify: {
    text: "Passing local assertions support review of this prepared fix. Real provider contracts, distributed retries, and organizational release approval still require separate evidence.",
    citations: ["api-payment", "inv-A", "test-A1"],
  },
};
export type Mission = {
  stage: Stage;
  branch: Branch;
  budget: number;
  reviewed: boolean;
  runs: Run[];
  receipt?: Receipt;
  events: string[];
};
export function initialMission(): Mission {
  return {
    stage: "Requirement",
    branch: "baseline",
    budget: MAX_BUDGET,
    reviewed: false,
    runs: [],
    events: ["Mission initialized · no tests have run"],
  };
}
export const tour = [
  {
    stage: "Requirement",
    title: "Define the business rule",
    text: "A buyer must never receive a confirmed order for an under-authorized payment. Inspect the acceptance criterion.",
    source: "ac-A",
  },
  {
    stage: "Change",
    title: "Read the change",
    text: "The new guard accepts any positive amount. Compare it with the original exact-amount rule.",
    source: "pr-A1",
  },
  {
    stage: "Impact",
    title: "Follow the evidence",
    text: "Trace the changed file through the payment service and API to the business invariant and its assertion.",
    source: "inv-A",
  },
  {
    stage: "Tests",
    title: "Reproduce the failure",
    text: "The baseline has just executed. The checkout confirmed a $100 order with only $60 authorized. Open the failing assertion.",
    source: "test-A1",
  },
  {
    stage: "Diagnose",
    title: "Explain the contradiction",
    text: "A successful provider response is insufficient. The changed amount condition admits the partial payment.",
    source: "pr-A1",
  },
  {
    stage: "Diagnose",
    title: "Apply the prepared fix",
    text: "The sandbox now uses exact-amount authorization. Changing code has not yet produced new test evidence.",
    source: "file-A1",
  },
  {
    stage: "Verify",
    title: "Verify both outcomes",
    text: "The patched checks have now executed. Compare baseline and patched results. External provider behavior is still unverified.",
    source: "test-A1",
  },
  {
    stage: "Verify",
    title: "Review the evidence package",
    text: "Take control to acknowledge the diff and limitations, then export the review package. The guide never grants approval for you.",
    source: "inv-A",
  },
] as const;
export function enterTour(index: number, previous: Mission): Mission {
  const frame = tour[index];
  if (!frame) throw new Error("Invalid tour frame");
  const m = structuredClone(previous);
  m.stage = frame.stage;
  if (index === 3) {
    m.runs.push(execute("baseline", m.budget));
    m.receipt = checkout(sample, "baseline");
    m.events.push("Baseline suite executed in browser");
  }
  if (index === 5) {
    m.branch = "patched";
    m.reviewed = false;
    m.receipt = undefined;
    m.events.push("Prepared patch applied · verification pending");
  }
  if (index === 6) {
    m.runs.push(execute("patched", m.budget));
    m.receipt = checkout(sample, "patched");
    m.events.push("Patched suite executed in browser");
  }
  return m;
}
export function evidenceReport(m: Mission) {
  const current = [...m.runs].reverse().find((r) => r.branch === m.branch);
  return {
    version: VERSION,
    fixtureRevision: world.fixtureRevision,
    scenario: "A",
    data: "synthetic",
    exportedAt: new Date().toISOString(),
    branch: m.branch,
    budget: m.budget,
    policy: gate(current, m.budget, m.reviewed),
    localReviewAcknowledged: m.reviewed,
    selected: plan(m.budget).selected.map((c) => c.id),
    excluded: plan(m.budget).excluded.map((c) => ({
      id: c.id,
      reason: "Outside current illustrative planning budget",
    })),
    runs: m.runs,
    limitations,
    sourceArtifacts: sourceIds.map((id) => artifact(id)),
    sourceRelationships: impactPath,
  };
}
export function markdownReport(m: Mission) {
  const r = evidenceReport(m);
  return `# Commerce Release Lab — review evidence\n\nSynthetic Meridian checkout · ${r.version} · ${r.fixtureRevision}\n\nExported: ${r.exportedAt}\n\n## Decision\n\n${r.policy.state}: ${r.policy.reason}\n\nBranch: ${m.branch}. Planning budget: ${m.budget} illustrative minutes. Local review acknowledgment: ${m.reviewed}.\n\n## Execution history\n\n${m.runs.map((run) => `### ${run.branch} · ${run.at}\n\nBrowser execution · ${run.durationMs.toFixed(2)} ms · budget ${run.budget}\n\n| Assertion | Expected | Actual | Outcome | Source |\n|---|---|---|---|---|\n${run.results.map((t) => `| ${t.title} | ${t.expected} | ${t.actual} | ${t.status} | ${t.source} |`).join("\n")}`).join("\n\n")}\n\n## Excluded from current plan\n\n${r.excluded.map((c) => `- ${c.id}: ${c.reason}`).join("\n") || "None."}\n\n## Limitations\n\n${limitations.map((l) => "- " + l).join("\n")}\n\n## Source artifacts\n\n${r.sourceArtifacts.map((a) => `### ${a?.id}\n\n${a?.title}\n\n${a?.content}\n\nProvenance: ${a?.provenance}`).join("\n\n")}`;
}
