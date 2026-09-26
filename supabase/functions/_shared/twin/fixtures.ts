import {
  ALGORITHM,
  CONTRACT,
  REVISION,
  validateSnapshot,
  type Entity,
  type Edge,
  type Event,
  type Scenario,
  type Snapshot,
} from "./schema.ts";
const provenance = "authored-fixture:meridian-1";
const entities: Entity[] = [];
const relationships: Edge[] = [];
function entity(
  id: string,
  type: Entity["type"],
  title: string,
  content: string,
  extra: Partial<Entity> = {},
) {
  entities.push({ id, type, title, content, provenance, ...extra });
}
function edge(source: string, type: Edge["type"], target: string) {
  relationships.push({
    id: `${source}:${type}:${target}`,
    source,
    type,
    target,
    provenance,
    basis: "authored relationship",
  });
}
const services = [
  "storefront",
  "catalog",
  "pricing",
  "checkout",
  "payment",
  "inventory",
  "credit",
  "notifications",
];
for (const [i, name] of services.entries()) {
  const team = ["experience", "commerce", "settlement"][i % 3];
  if (!entities.some((e) => e.id === team))
    entity(
      team,
      "team",
      `${team} team`,
      "Fictional Meridian Industrial Supply engineering group.",
    );
  entity(
    name,
    "service",
    name,
    "Meridian B2B industrial supplies: " +
      {
        storefront: "Buyer procurement portal",
        catalog: "Faceted industrial parts search",
        pricing: "Customer contract price calculation",
        checkout: "Order orchestration",
        payment: "Authorization and capture adapter",
        inventory: "Stock reservation",
        credit: "Partner credit ledger",
        notifications: "Order and credit notifications",
      }[name],
  );
  edge(team, "owns", name);
  entity(
    "api-" + name,
    "api",
    name + " contract",
    `POST /v1/${name}; tenant-scoped JSON contract; correlation-id required.`,
  );
  edge(name, "exposes", "api-" + name);
}
for (const [a, b] of [
  ["storefront", "catalog"],
  ["storefront", "pricing"],
  ["storefront", "checkout"],
  ["checkout", "payment"],
  ["checkout", "inventory"],
  ["checkout", "credit"],
  ["credit", "notifications"],
  ["checkout", "notifications"],
])
  edge(a, "depends_on", b);
const specs = {
  A: {
    service: "payment",
    title: "Partial authorization",
    invariant: "Partial authorization must never become a captured payment.",
    diff: "- if (auth.amount === order.total) capture(auth);\n+ if (auth.amount > 0) capture(auth);",
    story:
      "As a buyer, an under-authorized order remains unpaid and stock is released.",
  },
  B: {
    service: "catalog",
    title: "Catalog facets and mobile labels",
    invariant:
      "Facet controls retain accessible labels at 360px and preserve filtered results.",
    diff: '- <button>{icon}</button>\n+ <button aria-label="Filter by grade">{icon}</button>',
    story:
      "As a mobile buyer, I can filter industrial fasteners by material grade.",
  },
  C: {
    service: "credit",
    title: "Partner credit retry",
    invariant:
      "Concurrent retries with one idempotency key create exactly one credit.",
    diff: "- insertCredit(request);\n+ if (!await findCredit(key)) await insertCredit(request);",
    story:
      "As a partner, retrying an interrupted credit request never duplicates my balance.",
  },
};
export const scenarioInfo = specs;
const testTypes = {
  A: ["unit", "api", "contract", "e2e", "integration"],
  B: ["unit", "contract", "visual", "e2e", "performance"],
  C: ["api", "integration", "contract", "e2e", "unit"],
};
for (const scenario of ["A", "B", "C"] as Scenario[]) {
  const p = specs[scenario],
    x = { scenario };
  entity(scenario, "release", "Candidate " + scenario, p.title, x);
  entity("cap-" + scenario, "capability", p.title, p.story, x);
  edge("api-" + p.service, "enables", "cap-" + scenario);
  entity("story-" + scenario, "story", "Buyer outcome " + scenario, p.story, x);
  entity(
    "ac-" + scenario,
    "criterion",
    "Acceptance " + scenario,
    p.invariant,
    x,
  );
  edge("story-" + scenario, "accepts", "ac-" + scenario);
  entity(
    "inv-" + scenario,
    "invariant",
    "Invariant " + scenario,
    p.invariant,
    x,
  );
  edge("ac-" + scenario, "formalizes", "inv-" + scenario);
  edge("cap-" + scenario, "constrains", "inv-" + scenario);
  for (let n = 1; n <= 2; n++) {
    const secondary =
      scenario === "A"
        ? "- return decline;\n+ await reservations.release(orderId); return decline;"
        : scenario === "B"
          ? "- countByFacet(allVisibleProducts);\n+ countByFacet(eligibleFor(contractId, locale));"
          : "- await sendCreditEmail(credit); await ledger.commit(credit);\n+ await ledger.commit(credit); await sendCreditEmail(credit);";
    const service =
      n === 1
        ? p.service
        : scenario === "A"
          ? "checkout"
          : scenario === "C"
            ? "notifications"
            : "catalog";
    entity(
      `pr-${scenario}${n}`,
      "pr",
      `${p.service} change ${n}`,
      n === 1 ? p.diff : secondary,
      { ...x, status: "open" },
    );
    entity(
      `file-${scenario}${n}`,
      "file",
      `services/${service}/${n === 1 ? "handler" : "workflow"}.ts`,
      "Bounded synthetic source excerpt:\n" + (n === 1 ? p.diff : secondary),
      x,
    );
    edge(scenario, "includes", `pr-${scenario}${n}`);
    edge(`pr-${scenario}${n}`, "changes", `file-${scenario}${n}`);
    edge(`file-${scenario}${n}`, "implements", service);
    edge(`pr-${scenario}${n}`, "fulfills", "story-" + scenario);
  }
  for (let n = 1; n <= 5; n++) {
    const assertion =
      scenario === "A"
        ? [
            "Partial auth 60/100 causes zero captures",
            "Full auth captures once",
            "Provider partial status maps to unpaid",
            "Checkout partial auth releases stock",
            "Capture timeout never retries without key",
          ][n - 1]
        : scenario === "B"
          ? [
              "Grade filter preserves matching SKU",
              "Facet contract includes label",
              "360px filter label is visible",
              "Keyboard filter updates results",
              "Facet query p95 stays below 250ms",
            ][n - 1]
          : [
              "One request creates one credit",
              "20 concurrent retries create one row",
              "Unique-key conflict returns original credit",
              "Ledger notifies once after commit",
              "Retry timeout preserves balance",
            ][n - 1];
    entity(
      `test-${scenario}${n}`,
      "test",
      assertion,
      `Assert: ${assertion}. Synthetic tenant meridian-demo, fixed request key sample-42.`,
      {
        ...x,
        status: n === 5 ? "unknown" : "not_run",
        testType: testTypes[scenario][n - 1],
        durationMs: 80 + n * 230,
      },
    );
    entity(
      `ci-${scenario}${n}`,
      "ci",
      `CI ${scenario}.${n}`,
      `Isolated synthetic runner; result for test-${scenario}${n}; no production execution.`,
      { ...x, status: n === 5 ? "unknown" : "not_run" },
    );
    edge("inv-" + scenario, "verifies", `test-${scenario}${n}`);
    edge(`test-${scenario}${n}`, "result", `ci-${scenario}${n}`);
    edge(`test-${scenario}${n}`, "covers", "api-" + p.service);
  }
  edge(`test-${scenario}4`, "requires", `test-${scenario}3`);
  entity(
    "defect-" + scenario,
    "defect",
    scenario === "A"
      ? "Partial capture blocker"
      : scenario === "B"
        ? "Clipped mobile label"
        : "Concurrent retry race hypothesis",
    scenario === "C"
      ? "Suspected check-then-insert race; reproduction pending."
      : "Synthetic defect recorded during candidate verification.",
    {
      ...x,
      status: "open",
      severity:
        scenario === "A" ? "blocker" : scenario === "B" ? "minor" : "major",
    },
  );
  edge("defect-" + scenario, "blocks", scenario);
  entity(
    "review-" + scenario,
    "review",
    "PR code review " + scenario,
    "Human code review only. This is not release sign-off.",
    { ...x, status: "pending" },
  );
  edge("review-" + scenario, "reviews", "pr-" + scenario + "1");
  entity(
    "signoff-" + scenario,
    "signoff",
    "Release sign-off " + scenario,
    "Separate release authority; no readiness decision is made by this twin.",
    { ...x, status: "pending" },
  );
  edge("signoff-" + scenario, "signs_off", scenario);
  entity(
    "incident-" + scenario,
    "incident",
    "Simulation observation " + scenario,
    "Temporal association is not proof of PR causation.",
    { ...x, status: "unobserved" },
  );
  edge("incident-" + scenario, "observes", p.service);
  entity(
    "telemetry-" + scenario,
    "telemetry",
    "Telemetry excerpt " + scenario,
    scenario === "A"
      ? "capture amount=60 requested=100 synthetic=true"
      : scenario === "B"
        ? "viewport=360 label=visible synthetic=true"
        : "key=sample-42 requests=1 credits=1; concurrency not exercised",
    x,
  );
  edge("telemetry-" + scenario, "records", "incident-" + scenario);
}
entity(
  "unmapped-note",
  "telemetry",
  "Unmapped warehouse observation",
  "A warehouse timeout mentioned without a service identifier. Mapping unknown; no inferred link.",
);
export const baseline: Snapshot = {
  contract: CONTRACT,
  fixtureRevision: REVISION,
  algorithmVersion: ALGORITHM,
  scenario: "A",
  cursor: null,
  time: "2026-02-01T09:00:00.000Z",
  mode: "canonical",
  entities,
  relationships,
  events: [],
};
export const timelines: Record<Scenario, Event[]> = { A: [], B: [], C: [] };
function event(
  s: Scenario,
  type: Event["type"],
  target: string,
  status: string,
) {
  const n = timelines[s].length + 1;
  timelines[s].push({
    id: `event-${s}${n}`,
    time: `2026-02-01T09:${String(n).padStart(2, "0")}:00.000Z`,
    actor: type === "review" ? "reviewer:synthetic-lee" : "runner:synthetic",
    source: provenance,
    scenario: s,
    targetIds: [target],
    type,
    payload: { status },
    correlationId: "release-" + s,
  });
}
for (const s of ["A", "B", "C"] as Scenario[]) {
  event(s, "merge", `pr-${s}1`, "merged");
  event(s, "test", `test-${s}1`, s === "A" ? "fail" : "pass");
  if (s !== "C") {
    for (let n = 2; n <= 5; n++)
      event(s, "test", `test-${s}${n}`, s === "A" && n === 4 ? "fail" : "pass");
    event(s, "review", "review-" + s, "granted");
  }
  if (s === "B") event(s, "defect", "defect-B", "resolved");
  event(s, "incident", "incident-" + s, "observed");
}
validateSnapshot(baseline);
function freeze(value: object) {
  Object.freeze(value);
  for (const v of Object.values(value))
    if (v && typeof v === "object") freeze(v);
}
freeze(baseline);
freeze(timelines);
