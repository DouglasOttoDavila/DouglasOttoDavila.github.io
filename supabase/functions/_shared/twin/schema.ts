export const CONTRACT = "quality-twin/1";
export const REVISION = "meridian-1";
export const ALGORITHM = "evidence-1";
export type Scenario = "A" | "B" | "C";
export type Outcome = "pass" | "fail" | "not_run" | "unknown";
export type Kind =
  | "team"
  | "service"
  | "capability"
  | "story"
  | "criterion"
  | "invariant"
  | "api"
  | "file"
  | "pr"
  | "test"
  | "ci"
  | "defect"
  | "incident"
  | "telemetry"
  | "review"
  | "signoff"
  | "release";
export type Entity = {
  id: string;
  type: Kind;
  title: string;
  content: string;
  provenance: string;
  scenario?: Scenario;
  status?: string;
  testType?: string;
  durationMs?: number;
  severity?: string;
};
export const edgeRules = {
  owns: ["team", "service"],
  depends_on: ["service", "service"],
  exposes: ["service", "api"],
  enables: ["api", "capability"],
  constrains: ["capability", "invariant"],
  verifies: ["invariant", "test"],
  result: ["test", "ci"],
  changes: ["pr", "file"],
  implements: ["file", "service"],
  fulfills: ["pr", "story"],
  accepts: ["story", "criterion"],
  formalizes: ["criterion", "invariant"],
  includes: ["release", "pr"],
  reviews: ["review", "pr"],
  signs_off: ["signoff", "release"],
  blocks: ["defect", "release"],
  observes: ["incident", "service"],
  records: ["telemetry", "incident"],
  covers: ["test", "api"],
  requires: ["test", "test"],
} as const;
export type Edge = {
  id: string;
  source: string;
  target: string;
  type: keyof typeof edgeRules;
  provenance: string;
  basis: "authored relationship";
};
export type Event = {
  id: string;
  time: string;
  actor: string;
  source: string;
  scenario: Scenario;
  targetIds: string[];
  type: "test" | "defect" | "review" | "merge" | "incident" | "dependency";
  payload: { status?: string; target?: string; add?: boolean };
  correlationId: string;
  causationId?: string;
};
export type Snapshot = {
  contract: string;
  fixtureRevision: string;
  algorithmVersion: string;
  scenario: Scenario;
  cursor: string | null;
  time: string;
  mode: "canonical" | "fork";
  entities: Entity[];
  relationships: Edge[];
  events: Event[];
};
export function assertContract(s: Snapshot) {
  if (
    s.contract !== CONTRACT ||
    s.fixtureRevision !== REVISION ||
    s.algorithmVersion !== ALGORITHM
  )
    throw new Error(
      "Unsupported contract or fixture revision; explicit migration required.",
    );
}
export function validateSnapshot(s: Snapshot) {
  assertContract(s);
  if (
    !["A", "B", "C"].includes(s.scenario) ||
    !["canonical", "fork"].includes(s.mode)
  )
    throw new Error("Invalid snapshot metadata");
  const eventIds = new Set<string>();
  let previous = -Infinity;
  for (const e of s.events) {
    const time = Date.parse(e.time);
    if (
      !Number.isFinite(time) ||
      time <= previous ||
      eventIds.has(e.id) ||
      e.scenario !== s.scenario
    )
      throw new Error("Invalid event history");
    previous = time;
    eventIds.add(e.id);
  }
  if (
    s.events.length &&
    (s.cursor !== s.events.at(-1)!.id || s.time !== s.events.at(-1)!.time)
  )
    throw new Error("Cursor does not match history");
  const ids = new Set<string>();
  for (const e of s.entities) {
    if (ids.has(e.id) || !e.id || !e.title || !e.content || !e.provenance)
      throw new Error("Invalid or duplicate entity: " + e.id);
    ids.add(e.id);
  }
  const edgeIds = new Set<string>();
  for (const e of s.relationships) {
    const a = s.entities.find((x) => x.id === e.source),
      b = s.entities.find((x) => x.id === e.target),
      rule = edgeRules[e.type];
    if (
      edgeIds.has(e.id) ||
      !a ||
      !b ||
      !rule ||
      a.type !== rule[0] ||
      b.type !== rule[1] ||
      !e.provenance ||
      e.basis !== "authored relationship" ||
      (a.scenario && b.scenario && a.scenario !== b.scenario)
    )
      throw new Error("Invalid relationship: " + e.id);
    edgeIds.add(e.id);
  }
  for (const e of s.entities) {
    const states: Partial<Record<Kind, string[]>> = {
      test: ["pass", "fail", "not_run", "unknown"],
      ci: ["pass", "fail", "not_run", "unknown"],
      defect: ["open", "resolved"],
      review: ["pending", "granted", "withheld"],
      signoff: ["pending", "granted", "withheld"],
      pr: ["open", "merged"],
      incident: ["unobserved", "observed"],
    };
    if (states[e.type] && !states[e.type]!.includes(e.status || ""))
      throw new Error("Impossible state: " + e.id);
    if (e.type === "test" && (!e.testType || !e.durationMs))
      throw new Error("Missing test metadata");
  }
  for (const edge of s.relationships.filter((e) => e.type === "result"))
    if (
      s.entities.find((e) => e.id === edge.source)?.status !==
      s.entities.find((e) => e.id === edge.target)?.status
    )
      throw new Error("Test/CI contradiction");
}
