import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyWhatIf,
  compare,
  exportSnapshot,
  getEntity,
  getSnapshot,
  getTestOutcomes,
  neighbors,
  timelines,
  whatIf,
  type Scenario,
  type Snapshot,
  type Entity,
} from "../../../../supabase/functions/_shared/twin/domain";
import {
  recordedAnalysis,
  validateAnalysis,
  type Analysis,
} from "../../../../supabase/functions/_shared/twin/analyst";
import { callLab } from "../../lib/lab-client";
import {
  changedEntities,
  concerns,
  eventStory,
  focusedService,
  guidedTrail,
  reasons,
  serviceNames,
  state,
  stories,
  title,
} from "./twin/presentation";
import "../../styles/twin.css";
const panels = [
  "System map",
  "Evidence trail",
  "Artifacts",
  "What-if",
  "Analyst",
] as const;
type Panel = (typeof panels)[number];
const positions: Record<string, [number, number]> = {
  storefront: [12, 50],
  catalog: [36, 15],
  pricing: [36, 85],
  checkout: [60, 50],
  payment: [86, 12],
  inventory: [86, 37],
  credit: [86, 63],
  notifications: [86, 88],
};
function Status({ value }: { value?: string }) {
  return (
    <span className="tw-status" data-status={value}>
      {state(value)}
    </span>
  );
}
export default function QualityTwin() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [scenario, setScenario] = useState<Scenario>("A"),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [forks, setForks] = useState<Snapshot[]>([]),
    [selected, setSelected] = useState("pr-A1"),
    [panel, setPanel] = useState<Panel>("System map"),
    [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [mapList, setMapList] = useState(false),
    [onlyRelated, setOnlyRelated] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [analysis, setAnalysis] = useState<
      | (Analysis & {
          mode: string;
          subject: string;
          model?: string;
          generatedAt?: string;
        })
      | null
    >(null);
  const events = timelines[scenario];
  const canonical = useMemo(
    () => getSnapshot(scenario, cursor ? events[cursor - 1].id : null),
    [scenario, cursor],
  );
  const snapshot = forks.at(-1) || canonical;
  const previous = useMemo(
    () =>
      forks.length > 1
        ? forks[forks.length - 2]
        : forks.length
          ? canonical
          : cursor
            ? getSnapshot(scenario, cursor > 1 ? events[cursor - 2].id : null)
            : canonical,
    [canonical, forks, cursor, scenario],
  );
  const changed = changedEntities(previous, snapshot),
    forkChanges = changedEntities(canonical, snapshot),
    activeEvent = snapshot.events.at(-1),
    story = eventStory(activeEvent, previous, snapshot),
    entity = getEntity(selected, snapshot),
    service = focusedService(selected, snapshot),
    path = guidedTrail(selected, snapshot),
    tests = getTestOutcomes(scenario, snapshot),
    remaining = concerns(snapshot),
    related = neighbors(selected, snapshot);
  const contextKey = JSON.stringify([scenario, cursor, snapshot.events]);
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const requestSerial = useRef(0);
  useEffect(() => {
    setAnalysis(null);
    setError("");
  }, [contextKey]);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (cursor < events.length) {
        const n = cursor + 1;
        setCursor(n);
        setSelected(events[n - 1].targetIds[0]);
      }
      if (cursor + 1 >= events.length) setPlaying(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, [playing, cursor, scenario]);
  function move(n: number) {
    setPlaying(false);
    setForks([]);
    setCursor(n);
    setError("");
    setSelected(n ? events[n - 1].targetIds[0] : `pr-${scenario}1`);
  }
  function change(s: Scenario) {
    setPlaying(false);
    setScenario(s);
    setCursor(0);
    setForks([]);
    setSelected(`pr-${s}1`);
    setQuery("");
    setType("");
    setError("");
  }
  function select(id: string) {
    setSelected(id);
  }
  function fork(
    kind: "test" | "defect" | "review",
    id: string,
    status: string,
  ) {
    try {
      setPlaying(false);
      setForks([
        ...forks,
        applyWhatIf(snapshot, whatIf(snapshot, kind, id, status)),
      ]);
      setSelected(id);
      setError("");
    } catch (e) {
      setError(
        (e as Error).message + " Choose another outcome or discard the fork.",
      );
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportSnapshot(snapshot)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-${scenario}-${snapshot.mode}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function analyze() {
    const context = contextKey,
      serial = ++requestSerial.current,
      subject = selected;
    setPlaying(false);
    setBusy(true);
    setError("");
    setAnalysis(null);
    try {
      const result = await callLab<any>("quality-twin-analyst", {
        scenario,
        cursor: canonical.cursor,
        selected: subject,
        events: snapshot.events.slice(canonical.events.length),
        request_id: crypto.randomUUID(),
      });
      if (
        context !== currentContext.current ||
        serial !== requestSerial.current
      )
        return;
      const validated = validateAnalysis(result, snapshot);
      setAnalysis({
        ...validated,
        claims: [recordedAnalysis(snapshot).claims[0], ...validated.claims],
        subject,
        mode: "Live AI · hypotheses with snapshot facts",
        model: result.model,
        generatedAt: result.generatedAt,
      });
    } catch (e) {
      if (
        context === currentContext.current &&
        serial === requestSerial.current
      )
        setError((e as Error).message);
    } finally {
      if (serial === requestSerial.current) setBusy(false);
    }
  }
  const deps = snapshot.relationships.filter((e) => e.type === "depends_on");
  const connected = new Set([
    service,
    ...deps
      .filter((e) => e.source === service || e.target === service)
      .flatMap((e) => [e.source, e.target]),
  ]);
  const visibleServices = Object.keys(serviceNames).filter(
    (id) => !onlyRelated || connected.has(id),
  );
  const filtered = snapshot.entities.filter(
    (e) =>
      (!e.scenario || e.scenario === scenario) &&
      (!type || e.type === type) &&
      `${e.id} ${title(e)} ${e.content}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const inspectButton = (e: Entity) => (
    <button
      className="tw-artifact"
      key={e.id}
      aria-pressed={selected === e.id}
      data-changed={changed.some((x) => x.id === e.id)}
      onClick={() => select(e.id)}
    >
      <span>
        {title(e)}
        <small>
          {e.type}
          {changed.some((x) => x.id === e.id) ? " · changed this event" : ""}
        </small>
      </span>
      <Status value={e.status} />
    </button>
  );
  return (
    <div className="twin" aria-busy={!ready}>
      <fieldset className="tw-controls" disabled={!ready}>
        <legend className="tw-sr-only">
          Quality Digital Twin interactive explorer
        </legend>
        <div className="tw-world">
          <p>
            <strong>Meridian Industrial Supply</strong>
            <span>
              A fictional B2B store: browse parts, price a contract, place an
              order, settle a payment.
            </span>
          </p>
          <span className="tw-synthetic">Synthetic · public replay</span>
        </div>
        <div className="tw-scenarios" aria-label="Release candidates">
          {(["A", "B", "C"] as Scenario[]).map((s) => (
            <button
              key={s}
              aria-pressed={s === scenario}
              onClick={() => change(s)}
            >
              <span>Candidate {s}</span>
              <strong>{stories[s].title}</strong>
            </button>
          ))}
        </div>
        <section className="tw-story" aria-label="Release story">
          <div>
            <h2>{stories[scenario].question}</h2>
            <p>{stories[scenario].intro}</p>
          </div>
          <div className="tw-story-action">
            <button
              className="tw-primary"
              onClick={() => {
                move(2);
                setPanel("Evidence trail");
              }}
            >
              {stories[scenario].next} →
            </button>
            <small>
              Jump to event 2 of {events.length}; every event is replayable.
            </small>
          </div>
        </section>
        <section className="tw-timeline" aria-label="Event timeline">
          <div className="tw-row">
            <strong>
              {forks.length ? "Local what-if fork" : "Canonical history"}
            </strong>
            <span>
              Event {cursor} / {events.length}
              {forks.length ? ` · ${forks.length} local edits` : ""}
            </span>
            <button className="tw-link" onClick={download}>
              Export JSON ↓
            </button>
          </div>
          <div className="tw-playback">
            <button
              disabled={!cursor}
              onClick={() => move(cursor - 1)}
              aria-label="Previous event"
            >
              ←
            </button>
            <button
              disabled={!!forks.length || cursor === events.length}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <label className="tw-slider">
              Replay position
              <input
                type="range"
                min="0"
                max={events.length}
                value={cursor}
                aria-valuetext={
                  cursor
                    ? `Event ${cursor}: ${title(getEntity(events[cursor - 1].targetIds[0], snapshot))}`
                    : "Baseline: no recorded events"
                }
                onChange={(e) => move(Number(e.target.value))}
              />
            </label>
            <button
              disabled={cursor === events.length}
              onClick={() => move(cursor + 1)}
            >
              Next event →
            </button>
            <button className="tw-link" onClick={() => move(0)}>
              Reset
            </button>
            <button className="tw-link" onClick={() => move(events.length)}>
              Latest evidence
            </button>
          </div>
          <div className="tw-event" aria-live="polite">
            <div>
              <small>
                {activeEvent
                  ? activeEvent.type === "test"
                    ? forks.length
                      ? "Hypothetical execution"
                      : "Observed execution"
                    : activeEvent.type === "incident"
                      ? "Observed telemetry"
                      : "Recorded state change"
                  : "Start here · baseline"}
              </small>
              <h3>{story.heading}</h3>
            </div>
            <div className="tw-transition">
              <span>
                <small>Before</small>
                {story.before}
              </span>
              <span>
                <small>{forks.length ? "What-if event" : "Event"}</small>
                {story.action}
              </span>
              <span>
                <small>After</small>
                {story.after}
              </span>
            </div>
          </div>
          {changed.length > 0 && (
            <div className="tw-changes">
              <b>Changed:</b>
              {changed.map((e) => (
                <button
                  key={e.id}
                  className="tw-link"
                  onClick={() => select(e.id)}
                >
                  {title(e)} · {state(getEntity(e.id, previous)?.status)} →{" "}
                  {state(e.status)}
                </button>
              ))}
            </div>
          )}
          <div
            className="tw-quick-evidence"
            aria-label="Current evidence summary"
          >
            <strong>
              {tests.filter((e) => e.status === "pass").length} passed ·{" "}
              {tests.filter((e) => e.status === "fail").length} failed ·{" "}
              {
                tests.filter((e) => ["not_run", "unknown"].includes(e.status!))
                  .length
              }{" "}
              unverified
            </strong>
            <span>{remaining[0]}</span>
            <button
              className="tw-link"
              onClick={() => setPanel("Evidence trail")}
            >
              Inspect evidence →
            </button>
          </div>
          <details className="tw-event-data">
            <summary>Event source & exact changes</summary>
            <pre>
              {JSON.stringify(
                activeEvent || { cursor: null, time: snapshot.time },
                null,
                2,
              )}
            </pre>
            <pre>
              {compare(previous, snapshot).join("\n") || "No events applied."}
            </pre>
          </details>
        </section>
        <div className="tw-workbench">
          <div className="tw-explorer">
            <div
              className="tw-tabs"
              role="tablist"
              aria-label="Explore the twin"
            >
              {panels.map((name, i) => (
                <button
                  key={name}
                  role="tab"
                  id={`tw-tab-${i}`}
                  aria-controls="tw-panel"
                  aria-selected={panel === name}
                  tabIndex={panel === name ? 0 : -1}
                  onClick={() => setPanel(name)}
                  onKeyDown={(e) => {
                    let next = i;
                    if (e.key === "ArrowRight") next = (i + 1) % panels.length;
                    else if (e.key === "ArrowLeft")
                      next = (i + panels.length - 1) % panels.length;
                    else if (e.key === "Home") next = 0;
                    else if (e.key === "End") next = panels.length - 1;
                    else return;
                    e.preventDefault();
                    setPanel(panels[next]);
                    document.getElementById(`tw-tab-${next}`)?.focus();
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <section
              id="tw-panel"
              role="tabpanel"
              aria-labelledby={`tw-tab-${panels.indexOf(panel)}`}
              tabIndex={0}
              className="tw-panel"
            >
              <div className="tw-mobile-selection">
                <span>Selected: {title(entity)}</span>
                <button
                  className="tw-link"
                  onClick={() => {
                    const source = document.querySelector<HTMLDetailsElement>(".tw-source");
                    if (source) {
                      source.open = true;
                      source.querySelector("summary")?.focus();
                      source.scrollIntoView({ block: "nearest" });
                    }
                  }}
                >
                  Inspect source ↓
                </button>
              </div>
              {panel === "System map" && (
                <>
                  <div className="tw-panel-heading">
                    <div>
                      <h3>From buyer to fulfillment</h3>
                      <p>
                        Select a service to see its contracts, owners and
                        evidence.
                      </p>
                    </div>
                    <button
                      aria-pressed={mapList}
                      onClick={() => setMapList(!mapList)}
                    >
                      {mapList ? "Show map" : "Show list"}
                    </button>
                  </div>
                  <label className="tw-check">
                    <input
                      type="checkbox"
                      checked={onlyRelated}
                      onChange={(e) => setOnlyRelated(e.target.checked)}
                    />{" "}
                    Focus on selected service & dependencies
                  </label>
                  {!mapList && (
                    <div
                      className="tw-map"
                      aria-label="Interactive service topology"
                    >
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <marker
                            id="tw-arrow"
                            markerWidth="5"
                            markerHeight="5"
                            refX="4"
                            refY="2.5"
                            orient="auto"
                          >
                            <path d="M0 0L5 2.5L0 5" />
                          </marker>
                        </defs>
                        {deps
                          .filter(
                            (e) =>
                              visibleServices.includes(e.source) &&
                              visibleServices.includes(e.target),
                          )
                          .map((e) => {
                            const [x, y] = positions[e.source],
                              [tx, ty] = positions[e.target];
                            return (
                              <path
                                key={e.id}
                                className={
                                  e.source === service || e.target === service
                                    ? "is-related"
                                    : ""
                                }
                                d={
                                  x === tx
                                    ? `M${x + 9} ${y} H98 V${ty} H${tx + 9}`
                                    : `M${x + 9} ${y} C${x + 17} ${y},${tx - 17} ${ty},${tx - 10} ${ty}`
                                }
                                markerEnd="url(#tw-arrow)"
                              />
                            );
                          })}
                      </svg>
                      {visibleServices.map((id) => (
                        <button
                          key={id}
                          style={{
                            left: `${positions[id][0]}%`,
                            top: `${positions[id][1]}%`,
                          }}
                          aria-pressed={service === id}
                          onClick={() => select(id)}
                          data-changed={changed.some(
                            (e) => focusedService(e.id, snapshot) === id,
                          )}
                        >
                          <strong>{serviceNames[id]}</strong>
                          <small>
                            {service === id
                              ? "Selected context"
                              : changed.some(
                                    (e) =>
                                      focusedService(e.id, snapshot) === id,
                                  )
                                ? "Evidence changed"
                                : "Service"}
                          </small>
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    className={
                      mapList ? "tw-map-list" : "tw-map-list tw-mobile-only"
                    }
                    aria-label="Service list equivalent"
                  >
                    {visibleServices.map((id) => (
                      <div key={id}>
                        <button
                          aria-pressed={service === id}
                          onClick={() => select(id)}
                        >
                          {serviceNames[id]}
                        </button>
                        <p>
                          {deps.filter((e) => e.source === id).length
                            ? "Depends on: "
                            : "No outgoing dependencies recorded."}
                          {deps
                            .filter((e) => e.source === id)
                            .map((e, i) => (
                              <span key={e.id}>
                                {i ? ", " : ""}
                                <button
                                  className="tw-link"
                                  onClick={() => select(e.target)}
                                >
                                  {serviceNames[e.target]}
                                </button>
                              </span>
                            ))}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="tw-legend">
                    <span>╌→ Possible dependency</span>
                    <span>● Recorded evidence appears in the inspector</span>
                  </p>
                  <p className="tw-note">
                    Dashed links are authored dependencies. They identify
                    possible propagation, never a confirmed defect. AI
                    suggestions stay in the Analyst tab and do not add map
                    links.
                  </p>
                </>
              )}
              {panel === "Evidence trail" && (
                <>
                  <div className="tw-panel-heading">
                    <div>
                      <h3>Follow the evidence</h3>
                      <p>
                        Choose an assertion. Trace its change, business rule and
                        recorded result.
                      </p>
                    </div>
                  </div>
                  <div className="tw-evidence-pick">
                    {tests.map(inspectButton)}
                  </div>
                  {path.length ? (
                    <>
                      <div
                        className="tw-trace-overview"
                        aria-label="Selected evidence path"
                      >
                        {[
                          path[0].source,
                          path.find((e) => e.type === "verifies")?.source,
                          path.at(-1)?.target,
                        ]
                          .filter(
                            (id, index, ids) => id && ids.indexOf(id) === index,
                          )
                          .map((id, i) => (
                            <button key={id} onClick={() => select(id!)}>
                              <small>
                                {i === 0
                                  ? "Change"
                                  : getEntity(id!, snapshot)?.type ===
                                      "invariant"
                                    ? "Business rule"
                                    : "Linked artifact"}
                              </small>
                              {title(getEntity(id!, snapshot))}
                              {getEntity(id!, snapshot)?.status && (
                                <Status
                                  value={getEntity(id!, snapshot)?.status}
                                />
                              )}
                            </button>
                          ))}
                      </div>
                      <details className="tw-guided-links">
                        <summary>
                          Why these artifacts are connected · {path.length}{" "}
                          authored links
                        </summary>
                        <ol className="tw-trail">
                          {path.map((edge, i) => (
                            <li key={edge.id}>
                              <span className="tw-step">{i + 1}</span>
                              <div>
                                <button
                                  className="tw-link"
                                  onClick={() => select(edge.source)}
                                >
                                  {title(getEntity(edge.source, snapshot))}
                                </button>
                                <p>
                                  {reasons[edge.type]} →{" "}
                                  <button
                                    className="tw-link"
                                    onClick={() => select(edge.target)}
                                  >
                                    {title(getEntity(edge.target, snapshot))}
                                  </button>
                                </p>
                                <details>
                                  <summary>Inspect authored link</summary>
                                  <p>
                                    {edge.id}
                                    <br />
                                    {edge.basis} · {edge.provenance}
                                  </p>
                                </details>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </>
                  ) : (
                    <p>
                      No complete directed evidence trail is authored for this
                      selection. Its known neighbors remain in the inspector; no
                      missing link is invented.
                    </p>
                  )}
                  <p className="tw-note">
                    A passing result verifies only its own assertion. A
                    happy-path pass cannot verify concurrent retries or erase a
                    failing partial-payment check.
                  </p>
                </>
              )}
              {panel === "Artifacts" && (
                <>
                  <h3>Find an artifact</h3>
                  <div className="tw-search">
                    <label>
                      Search artifacts
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Title, assertion or exact ID"
                      />
                    </label>
                    <label>
                      Artifact type
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                      >
                        <option value="">All types</option>
                        {[...new Set(snapshot.entities.map((e) => e.type))].map(
                          (t) => (
                            <option key={t}>{t}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <p>
                    {filtered.length} {filtered.length === 1 ? "artifact" : "artifacts"} in this candidate and its shared
                    enterprise.
                  </p>
                  <div className="tw-inventory">
                    {filtered.length ? (
                      filtered.map(inspectButton)
                    ) : (
                      <p>
                        No matching artifacts.{" "}
                        <button
                          className="tw-link"
                          onClick={() => {
                            setQuery("");
                            setType("");
                          }}
                        >
                          Clear search and filters
                        </button>
                      </p>
                    )}
                  </div>
                </>
              )}
              {panel === "What-if" && (
                <>
                  <h3>Change one fact. Keep the rest.</h3>
                  <p>
                    Create a local branch from event {cursor}. The recorded
                    history stays intact.
                  </p>
                  <div className="tw-whatif-actions">
                    {scenario === "A" && (
                      <>
                        <p>
                          Resolve the blocker record. Failed tests keep their
                          results.
                        </p>
                        <button
                          disabled={
                            getEntity("defect-A", snapshot)?.status ===
                            "resolved"
                          }
                          onClick={() => fork("defect", "defect-A", "resolved")}
                        >
                          Resolve A blocker
                        </button>
                      </>
                    )}
                    {scenario === "B" && (
                      <>
                        <p>
                          Reopen the visual issue. Earlier passing executions
                          remain recorded.
                        </p>
                        <button
                          disabled={
                            getEntity("defect-B", snapshot)?.status === "open"
                          }
                          onClick={() => fork("defect", "defect-B", "open")}
                        >
                          Reopen visual issue
                        </button>
                        {getEntity("defect-B", snapshot)?.status === "open" &&
                          !forks.length && (
                            <p>
                              The issue is already open at this event.{" "}
                              <button
                                className="tw-link"
                                onClick={() => move(events.length)}
                              >
                                Replay to its resolution
                              </button>{" "}
                              first.
                            </p>
                          )}
                      </>
                    )}
                    {scenario === "C" && (
                      <>
                        <p>
                          Execute the concurrent-retry assertion or grant code
                          review. Neither grants release sign-off.
                        </p>
                        <div className="tw-row">
                          <button
                            disabled={
                              getEntity("test-C2", snapshot)?.status === "pass"
                            }
                            onClick={() => fork("test", "test-C2", "pass")}
                          >
                            Retry test: pass
                          </button>
                          <button
                            disabled={
                              getEntity("test-C2", snapshot)?.status === "fail"
                            }
                            onClick={() => fork("test", "test-C2", "fail")}
                          >
                            Retry test: fail
                          </button>
                          <button
                            disabled={
                              getEntity("review-C", snapshot)?.status ===
                              "granted"
                            }
                            onClick={() =>
                              fork("review", "review-C", "granted")
                            }
                          >
                            Grant C code review
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="tw-fork-comparison">
                    <h4>
                      {forks.length
                        ? "Local fork compared with canonical history"
                        : "No fork edits yet"}
                    </h4>
                    {forkChanges.length ? (
                      <ul>
                        {forkChanges.map((e) => (
                          <li key={e.id}>
                            <button
                              className="tw-link"
                              onClick={() => select(e.id)}
                            >
                              {title(e)}
                            </button>
                            : {state(getEntity(e.id, canonical)?.status)} →{" "}
                            <strong>{state(e.status)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        {forks.length
                          ? "The local events return these statuses to their canonical values. Fork history is still retained."
                          : "Choose one change above to compare its effect."}
                      </p>
                    )}
                    <div className="tw-row">
                      <button
                        disabled={!forks.length}
                        onClick={() => {
                          setForks(forks.slice(0, -1));
                          setError("");
                        }}
                      >
                        Undo fork edit
                      </button>
                      <button
                        disabled={!forks.length}
                        onClick={() => {
                          setForks([]);
                          setError("");
                        }}
                      >
                        Discard fork
                      </button>
                    </div>
                  </div>
                  <h4>What remains unresolved</h4>
                  <ul>
                    {remaining.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="tw-note">
                    Forks are in memory. Timeline movement, candidate changes
                    and refresh discard them. Export first to keep a copy.
                  </p>
                </>
              )}
              {panel === "Analyst" && (
                <>
                  <h3>An interpretation, with its sources</h3>
                  <p>
                    Public replay is an authored synthetic example, populated
                    with the current evidence. It is not a live model response.
                  </p>
                  <div className="tw-row">
                    <button
                      onClick={() =>
                        setAnalysis({
                          ...recordedAnalysis(snapshot),
                          subject: `pr-${scenario}1`,
                          mode: "Replay · authored synthetic example",
                        })
                      }
                    >
                      Replay interpretation
                    </button>
                    <button
                      disabled={
                        busy ||
                        import.meta.env.PUBLIC_TWIN_AI_ENABLED !== "true" ||
                        entity?.type !== "pr"
                      }
                      onClick={analyze}
                    >
                      {busy ? "Analyzing…" : "Analyze with AI"}
                    </button>
                  </div>
                  <p className="tw-note">
                    {import.meta.env.PUBLIC_TWIN_AI_ENABLED === "true" ? (
                      <>
                        Live AI requires a selected PR,{" "}
                        <a href="/login?returnTo=/lab/quality-digital-twin">
                          approved sign-in
                        </a>{" "}
                        and the shared daily allowance.{" "}
                        <a href="/settings">Account settings</a>.
                      </>
                    ) : (
                      "Live AI unavailable in this build. Public replay, exploration and what-if changes work without credentials."
                    )}
                  </p>
                  {analysis && (
                    <div className="tw-analysis">
                      <strong>{analysis.mode}</strong>
                      <p>
                        Context: {title(getEntity(analysis.subject, snapshot))}{" "}
                        · event {cursor}
                        {forks.length ? " · local fork" : ""}
                        {analysis.model
                          ? ` · ${analysis.model} · ${analysis.generatedAt}`
                          : ""}
                      </p>
                      {analysis.claims.map((claim, i) => (
                        <article key={i}>
                          <small>{claim.label}</small>
                          {claim.label === "verified from fixture" ? (
                            <ul>
                              {tests.map((test) => (
                                <li key={test.id}>
                                  {title(test)}:{" "}
                                  <strong>{state(test.status)}</strong>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>{claim.text}</p>
                          )}
                          <div className="tw-citations">
                            {claim.citations.map((id) => (
                              <button
                                className="tw-link"
                                key={id}
                                onClick={() => select(id)}
                              >
                                {title(getEntity(id, snapshot))}
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                      <p>
                        <strong>Next investigation:</strong> {analysis.nextStep}
                      </p>
                    </div>
                  )}
                </>
              )}
              {error && (
                <p className="tw-error" role="alert">
                  {error}
                  <button className="tw-link" onClick={() => setError("")}>
                    Dismiss
                  </button>
                </p>
              )}
            </section>
          </div>
          <aside className="tw-inspector" aria-label="Artifact inspector">
            <div className="tw-inspector-top">
              <span>Inspecting · {entity?.type}</span>
              <Status value={entity?.status} />
            </div>
            <h3 id="tw-inspector-title" tabIndex={-1}>
              {title(entity)}
            </h3>
            {changed.some((e) => e.id === selected) && (
              <p className="tw-note">
                Changed in the current event:{" "}
                {state(getEntity(selected, previous)?.status)} →{" "}
                {state(entity?.status)}
              </p>
            )}
            <div className="tw-evidence-summary">
              <h4>Candidate {scenario} · evidence now</h4>
              <p>
                {tests.filter((e) => e.status === "pass").length} passed ·{" "}
                {tests.filter((e) => e.status === "fail").length} failed ·{" "}
                {
                  tests.filter((e) =>
                    ["not_run", "unknown"].includes(e.status!),
                  ).length
                }{" "}
                unverified
              </p>
              <ul>
                {remaining.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <button
                className="tw-link"
                onClick={() => setPanel("Evidence trail")}
              >
                Inspect all five assertions →
              </button>
            </div>
            <details
              className="tw-source"
              key={selected}
              open={entity?.type === "pr"}
            >
              <summary>Original artifact & provenance</summary>
              <pre>{entity?.content}</pre>
              <p>
                {entity?.id}
                <br />
                {entity?.provenance}
              </p>
              {entity?.testType && (
                <p>
                  {entity.testType} · authored duration {entity.durationMs}ms
                </p>
              )}
            </details>
            {related.length ? (
              <details className="tw-neighbors" open>
                <summary>Connected artifacts ({related.length})</summary>
                <ul>
                  {related.map((edge) => {
                    const other = getEntity(
                      edge.source === selected ? edge.target : edge.source,
                      snapshot,
                    );
                    return (
                      <li key={edge.id}>
                        <button
                          className="tw-link"
                          onClick={() => select(other!.id)}
                        >
                          {title(other)}
                        </button>
                        <small>
                          {title(getEntity(edge.source, snapshot))}{" "}
                          {reasons[edge.type]}
                        </small>
                        <details>
                          <summary>Exact relationship</summary>
                          <p>
                            {edge.source} → {edge.type} → {edge.target}
                            <br />
                            {edge.provenance}
                          </p>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ) : (
              <p>
                Unknown / unmapped. No relationship is inferred from a name.
              </p>
            )}
          </aside>
        </div>
        <details className="tw-contract">
          <summary>Data contract & snapshot provenance</summary>
          <p>
            {snapshot.contract} · fixture {snapshot.fixtureRevision} · algorithm{" "}
            {snapshot.algorithmVersion}
            <br />
            Snapshot {snapshot.cursor || "baseline"} · {snapshot.time} ·{" "}
            {snapshot.mode}
            <br />
            {snapshot.entities.length} synthetic artifacts ·{" "}
            {snapshot.relationships.length} authored relationships
          </p>
          <p>
            Authored links describe the fixture. Observed results come from
            synthetic events. Summaries are derived from this snapshot. AI
            hypotheses never change the graph.
          </p>
          <button onClick={download}>Export JSON ↓</button>
        </details>
      </fieldset>
    </div>
  );
}
