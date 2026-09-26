import {
  getEntity,
  getTestOutcomes,
  tracePath,
  type Edge,
  type Entity,
  type Event,
  type Scenario,
  type Snapshot,
} from "../../../../../supabase/functions/_shared/twin/domain";

// Presentation annotations only. IDs are explicit; no inferred domain edges or fixture edits.
export const serviceNames: Record<string, string> = {
  storefront: "Buyer storefront",
  catalog: "Catalog search",
  pricing: "Contract pricing",
  checkout: "Order orchestration",
  payment: "Payment adapter",
  inventory: "Stock reservation",
  credit: "Partner credit ledger",
  notifications: "Notifications",
};
export const stories: Record<
  Scenario,
  { title: string; question: string; intro: string; next: string }
> = {
  A: {
    title: "A payment accepted too soon",
    question: "Can a partial payment become a captured order?",
    intro:
      "A relaxed payment guard accepts any authorized amount. Follow the checks that expose the partial-capture defect.",
    next: "Run the partial-authorization check",
  },
  B: {
    title: "A catalog buyers can navigate",
    question: "Do mobile labels and contract facets hold up?",
    intro:
      "Catalog changes narrow the assortment and label mobile filters. Follow five checks and the resolution of a visual issue.",
    next: "Run the first catalog check",
  },
  C: {
    title: "One request is not a retry test",
    question: "Can concurrent retries create two credits?",
    intro:
      "The ledger checks for an existing key before inserting. A single request passes; concurrent safety still needs evidence.",
    next: "Inspect the happy-path result",
  },
};
const names: Record<string, string> = {
  "pr-A1": "Relax the payment capture guard",
  "pr-A2": "Release stock after a declined payment",
  "pr-B1": "Label the mobile facet control",
  "pr-B2": "Scope facets to the buyer contract",
  "pr-C1": "Check the key before inserting a credit",
  "pr-C2": "Send notifications after ledger commit",
};
export function title(e: Entity | undefined) {
  if (!e) return "Unknown artifact";
  if (serviceNames[e.id]) return serviceNames[e.id];
  if (names[e.id]) return names[e.id];
  if (e.type === "invariant" || e.type === "criterion") return e.content;
  if (e.type === "ci")
    return "Recorded execution " + e.title.replace("CI ", "");
  if (e.type === "story") return e.content;
  return e.title;
}
export const statusText: Record<string, string> = {
  pass: "Passed",
  fail: "Failed",
  not_run: "Not run",
  unknown: "Unknown",
  open: "Open",
  resolved: "Resolved",
  pending: "Pending",
  granted: "Granted",
  withheld: "Withheld",
  merged: "Merged",
  observed: "Observed",
  unobserved: "Not observed",
};
export function state(status?: string) {
  return status ? statusText[status] || status : "Authored context";
}
export const reasons: Record<Edge["type"], string> = {
  owns: "owns and maintains this service",
  depends_on:
    "may be affected through this service dependency; no regression is established",
  exposes: "makes this API contract available",
  enables: "supports this business capability",
  constrains: "must preserve this business rule",
  verifies: "has this test assertion; coverage alone does not mean it ran",
  result: "has this recorded execution outcome",
  changes: "changes this source file",
  implements: "belongs to the implementation of this service",
  fulfills: "addresses this buyer story",
  accepts: "defines this acceptance criterion",
  formalizes: "expresses this invariant",
  includes: "includes this proposed change",
  reviews: "records code review, separate from release sign-off",
  signs_off: "records the separate release authorization",
  blocks: "tracks a defect association; inspect its current state",
  observes: "records an observation, not proof of PR causation",
  records: "contains the simulation telemetry",
  covers: "exercises this API contract",
  requires: "requires this test to pass first",
};
export function changedEntities(a: Snapshot, b: Snapshot) {
  return b.entities.filter((e) => getEntity(e.id, a)?.status !== e.status);
}
export function eventStory(
  event: Event | undefined,
  before: Snapshot,
  after: Snapshot,
) {
  if (!event)
    return {
      heading: "Before the first recorded event",
      before: "Proposed changes; no events applied.",
      action: "Merge the first change to begin.",
      after: "Five checks unverified. Existing defects are open.",
    };
  const target = getEntity(event.targetIds[0], after),
    old = getEntity(event.targetIds[0], before);
  return {
    heading: title(target),
    before: state(old?.status),
    action:
      event.type === "test"
        ? "A synthetic test run completes"
        : event.type === "merge"
          ? "The change is merged into this candidate"
          : event.type === "defect"
            ? "The defect record is updated"
            : event.type === "review"
              ? "A human code review is recorded"
              : event.type === "incident"
                ? "Simulation telemetry is observed"
                : "An authored dependency changes",
    after: state(target?.status),
  };
}
export function concerns(s: Snapshot) {
  const tests = getTestOutcomes(s.scenario, s),
    failed = tests.filter((e) => e.status === "fail"),
    missing = tests.filter(
      (e) => e.status === "not_run" || e.status === "unknown",
    );
  const result: string[] = [];
  if (failed.length)
    result.push(
      `${failed.length} failed ${failed.length === 1 ? "check remains" : "checks remain"}.`,
    );
  if (missing.length)
    result.push(
      `${missing.length} ${missing.length === 1 ? "check has" : "checks have"} no passing execution.`,
    );
  if (getEntity("defect-" + s.scenario, s)?.status === "open")
    result.push(
      s.scenario === "C"
        ? "The concurrent-retry race is still an open hypothesis."
        : "The " +
            (s.scenario === "A" ? "partial-capture blocker" : "visual issue") +
            " is open.",
    );
  if (getEntity("review-" + s.scenario, s)?.status !== "granted")
    result.push("Code review is pending.");
  result.push(
    "Release sign-off is " +
      state(getEntity("signoff-" + s.scenario, s)?.status).toLowerCase() +
      ".",
  );
  return result;
}
export function focusedService(id: string, s: Snapshot) {
  const allowed = new Set([
    "changes",
    "implements",
    "exposes",
    "enables",
    "constrains",
    "verifies",
    "result",
    "covers",
  ]);
  let layer = [id];
  const seen = new Set(layer);
  for (let depth = 0; depth < 7; depth++) {
    const match = layer.find((x) => getEntity(x, s)?.type === "service");
    if (match) return match;
    const next: string[] = [];
    for (const edge of s.relationships.filter((e) => allowed.has(e.type))) {
      const to = layer.includes(edge.source)
        ? edge.target
        : layer.includes(edge.target)
          ? edge.source
          : null;
      if (to && !seen.has(to)) {
        seen.add(to);
        next.push(to);
      }
    }
    layer = next;
  }
  return undefined;
}
export function guidedTrail(selected: string, s: Snapshot) {
  const graph = {
    ...s,
    relationships: s.relationships.filter(
      (e) => !["depends_on", "owns", "requires"].includes(e.type),
    ),
  };
  const end =
    getEntity(selected, s)?.type === "test"
      ? s.relationships.find(
          (e) => e.source === selected && e.type === "result",
        )?.target
      : getEntity(selected, s)?.type === "ci"
        ? selected
        : `ci-${s.scenario}${s.scenario === "C" ? 2 : 1}`;
  for (const pr of [`pr-${s.scenario}1`, `pr-${s.scenario}2`]) {
    const file = graph.relationships.find(
      (e) => e.source === pr && e.type === "changes",
    )?.target;
    if (!file) continue;
    const prefix = tracePath(pr, file, graph);
    const middle = selected === pr ? [] : tracePath(file, selected, graph);
    if (selected !== pr && selected !== file && !middle.length) continue;
    const tail = end
      ? tracePath(selected === pr ? file : selected, end, graph)
      : [];
    return [...prefix, ...middle, ...tail];
  }
  return [];
}
