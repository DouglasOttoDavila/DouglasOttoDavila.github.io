import { baseline, timelines } from "./fixtures.ts";
import {
  validateSnapshot,
  type Event,
  type Scenario,
  type Snapshot,
} from "./schema.ts";
export * from "./schema.ts";
export { scenarioInfo, timelines } from "./fixtures.ts";
export function getEntity(id: string, s: Snapshot) {
  return s.entities.find((e) => e.id === id);
}
export function neighbors(id: string, s: Snapshot, type?: string) {
  return s.relationships.filter(
    (e) => (e.source === id || e.target === id) && (!type || e.type === type),
  );
}
export function tracePath(
  from: string,
  to: string,
  s: Snapshot,
  maxDepth = 10,
) {
  const queue = [{ id: from, path: [] as Snapshot["relationships"] }],
    seen = new Set([from]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.id === to) return current.path;
    if (current.path.length >= Math.min(maxDepth, 20)) continue;
    for (const edge of s.relationships.filter((e) => e.source === current.id)) {
      if (!seen.has(edge.target)) {
        seen.add(edge.target);
        queue.push({ id: edge.target, path: [...current.path, edge] });
      }
    }
  }
  return [];
}
export function getChanges(release: Scenario, s = getSnapshot(release)) {
  return s.relationships
    .filter((e) => e.source === release && e.type === "includes")
    .flatMap((e) =>
      s.relationships.filter(
        (r) => r.source === e.target && r.type === "changes",
      ),
    );
}
export function getTestOutcomes(release: Scenario, s: Snapshot) {
  return s.entities.filter((e) => e.type === "test" && e.scenario === release);
}
export function getEvidence(id: string, s: Snapshot) {
  return s.relationships
    .filter((e) => e.source === id && e.type === "verifies")
    .map((e) => ({
      test: getEntity(e.target, s)!,
      basis: "observed fact",
      verified: getEntity(e.target, s)?.status === "pass",
    }));
}
export function getUnmapped(s: Snapshot) {
  return s.entities.filter(
    (e) => !s.relationships.some((r) => r.source === e.id || r.target === e.id),
  );
}
export function reduceEvent(snapshot: Snapshot, event: Event): Snapshot {
  validateSnapshot(snapshot);
  if (
    !event ||
    !["id", "time", "actor", "source", "correlationId"].every(
      (k) => typeof event[k as keyof Event] === "string",
    ) ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  )
    throw new Error("Invalid event fields.");
  if (event && JSON.stringify(event).length > 2000)
    throw new Error("Event exceeds bounded payload size.");
  if (
    !event ||
    !event.id ||
    !event.actor ||
    !event.source ||
    !event.correlationId ||
    !event.payload ||
    event.scenario !== snapshot.scenario ||
    !Array.isArray(event.targetIds) ||
    event.targetIds.length !== 1 ||
    snapshot.events.some((e) => e.id === event.id) ||
    !Number.isFinite(Date.parse(event.time)) ||
    Date.parse(event.time) <= Date.parse(snapshot.time)
  )
    throw new Error("Invalid event identity, scenario or chronology.");
  if (
    event.causationId &&
    !snapshot.events.some((e) => e.id === event.causationId)
  )
    throw new Error("Unknown causation event.");
  const s = structuredClone(snapshot),
    target = getEntity(event.targetIds[0], s);
  if (!target || (target.scenario && target.scenario !== s.scenario))
    throw new Error("Unknown or incompatible target.");
  const rules = {
    test: { kind: "test", states: ["pass", "fail"] },
    defect: { kind: "defect", states: ["open", "resolved"] },
    review: { kind: "review", states: ["granted", "withheld"] },
    merge: { kind: "pr", states: ["merged"] },
    incident: { kind: "incident", states: ["observed"] },
  };
  if (event.type === "dependency") {
    const other = getEntity(event.payload.target || "", s);
    if (
      target.type !== "service" ||
      other?.type !== "service" ||
      other.id === target.id ||
      typeof event.payload.add !== "boolean"
    )
      throw new Error("Invalid dependency.");
    const id = `${target.id}:depends_on:${other.id}`,
      exists = s.relationships.some((e) => e.id === id);
    if (exists === event.payload.add)
      throw new Error("Dependency already in requested state.");
    s.relationships = s.relationships.filter((e) => e.id !== id);
    if (event.payload.add)
      s.relationships.push({
        id,
        source: target.id,
        target: other.id,
        type: "depends_on",
        provenance: event.source,
        basis: "authored relationship",
      });
  } else {
    const rule = rules[event.type];
    if (
      !rule ||
      target.type !== rule.kind ||
      !rule.states.includes(event.payload.status || "") ||
      target.status === event.payload.status
    )
      throw new Error("Impossible or redundant transition.");
    if (
      event.type === "test" &&
      event.payload.status === "pass" &&
      s.relationships.some(
        (e) =>
          e.source === target.id &&
          e.type === "requires" &&
          getEntity(e.target, s)?.status !== "pass",
      )
    )
      throw new Error("Required test has not passed.");
    target.status = event.payload.status;
    if (event.type === "test")
      for (const e of s.relationships.filter(
        (e) => e.source === target.id && e.type === "result",
      ))
        getEntity(e.target, s)!.status = target.status;
  }
  s.cursor = event.id;
  s.time = event.time;
  s.events.push(structuredClone(event));
  validateSnapshot(s);
  return s;
}
export function getSnapshot(
  release: Scenario,
  throughEventId?: string | null,
): Snapshot {
  if (!Object.hasOwn(timelines, release)) throw new Error("Unknown release.");
  let s = structuredClone(baseline);
  s.scenario = release;
  const events = timelines[release];
  const count =
    throughEventId === null
      ? 0
      : throughEventId === undefined
        ? events.length
        : events.findIndex((e) => e.id === throughEventId) + 1;
  if (throughEventId && count === 0) throw new Error("Unknown event cursor.");
  for (const event of events.slice(0, count)) s = reduceEvent(s, event);
  return s;
}
export function applyWhatIf(s: Snapshot, e: Event) {
  if (s.events.filter((e) => e.source === "visitor:what-if").length >= 20)
    throw new Error("Fork limit reached; reset to continue.");
  if (e.source !== "visitor:what-if")
    throw new Error("What-if source required.");
  return { ...reduceEvent(s, e), mode: "fork" as const };
}
export function whatIf(
  s: Snapshot,
  type: Event["type"],
  target: string,
  status: string,
): Event {
  return {
    id: `fork-${s.scenario}-${s.events.length + 1}`,
    time: new Date(Date.parse(s.time) + 1000).toISOString(),
    actor: "visitor",
    source: "visitor:what-if",
    scenario: s.scenario,
    targetIds: [target],
    type,
    payload: { status },
    correlationId: "fork-" + s.scenario,
  };
}
export function compare(a: Snapshot, b: Snapshot) {
  return [
    ...b.entities
      .filter((e) => getEntity(e.id, a)?.status !== e.status)
      .map(
        (e) =>
          `${e.id}: ${getEntity(e.id, a)?.status ?? "unknown"} → ${e.status}`,
      ),
    ...b.relationships
      .filter((e) => !a.relationships.some((r) => r.id === e.id))
      .map((e) => "Added " + e.id),
    ...a.relationships
      .filter((e) => !b.relationships.some((r) => r.id === e.id))
      .map((e) => "Removed " + e.id),
  ];
}
export function exportSnapshot(s: Snapshot) {
  validateSnapshot(s);
  return JSON.stringify(
    {
      ...s,
      evidence: getEvidence("inv-" + s.scenario, s),
      unmapped: getUnmapped(s).map((e) => e.id),
    },
    null,
    2,
  );
}
for (const scenario of ["A", "B", "C"] as Scenario[]) getSnapshot(scenario);
