import { useEffect, useRef, useState } from "react";
import {
  artifact,
  checkout,
  checks,
  diff,
  enterTour,
  evidenceReport,
  execute,
  gate,
  guidance,
  impactPath,
  initialMission,
  limitations,
  markdownReport,
  MAX_BUDGET,
  MIN_BUDGET,
  plan,
  sample,
  stages,
  tour,
  VERSION,
  world,
  type Mission,
  type Stage,
} from "../../../../supabase/functions/_shared/commerce/domain";
import {
  validateAdvice,
  type Advice,
  type AnalysisRequest,
} from "../../../../supabase/functions/_shared/commerce/analyst";
import { callLab, getClient, type LabStatus } from "../../lib/lab-client";
import type { ModelCatalog } from "./ModelPreference";
import TourCoach from "./commerce/TourCoach";
import "../../styles/commerce-release.css";

type LiveAdvice = Advice & {
  model: string;
  generatedAt: string;
  input: AnalysisRequest;
  aiUsage?: LabStatus["usage"];
  metrics?: { providerMs: number; promptTokens?: number; completionTokens?: number; totalTokens?: number; roundTripMs?: number };
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
function Mark({
  kind,
}: {
  kind: "play" | "arrow" | "check" | "pause" | "code" | "box";
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {kind === "play" ? (
        <path d="m8 5 11 7-11 7Z" />
      ) : kind === "arrow" ? (
        <path d="M4 12h15m-6-6 6 6-6 6" />
      ) : kind === "check" ? (
        <path d="m5 12 4 4L19 6" />
      ) : kind === "pause" ? (
        <path d="M8 5v14M16 5v14" />
      ) : kind === "box" ? (
        <>
          <path d="m12 3 9 5v9l-9 5-9-5V8Z" />
          <path d="m3 8 9 5 9-5M12 13v9M7 5l10 6" />
        </>
      ) : (
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />
      )}
    </svg>
  );
}
function Badge({ value }: { value?: string }) {
  return (
    <span className="cr-badge" data-value={value || "not-run"}>
      {value === "pass"
        ? "Passed"
        : value === "fail"
          ? "Failed"
          : value || "Not run"}
    </span>
  );
}
function latest(m: Mission, branch = m.branch) {
  return [...m.runs].reverse().find((r) => r.branch === branch);
}

export default function CommerceRelease() {
  const [m, setM] = useState<Mission>(initialMission);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState("ac-A");
  const [guideIndex, setGuideIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const frames = useRef<Mission[]>([]);
  const [amount, setAmount] = useState("60");
  const [provider, setProvider] = useState<"partial" | "approved" | "declined">(
    "partial",
  );
  const [inputError, setInputError] = useState("");
  const [working, setWorking] = useState(false);
  const [live, setLive] = useState<LiveAdvice | null>(null);
  const [aiError, setAiError] = useState("");
  const [access, setAccess] = useState<LabStatus | null>(null);
  const [accessMessage, setAccessMessage] = useState(
    "Checking your Lab session…",
  );
  const [accessLoading, setAccessLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [model, setModel] = useState("");
  const [modelError, setModelError] = useState("");
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const adviceCache = useRef(new Map<string, LiveAdvice>());
  const attempted = useRef(new Set<string>());
  const inFlight = useRef(false);
  const sessionEpoch = useRef(0);
  const authUser = useRef<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [mobileEvidence, setMobileEvidence] = useState(false);
  const [focusGuide, setFocusGuide] = useState(false);
  const [showAllChecks, setShowAllChecks] = useState(false);
  const inspector = useRef<HTMLElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  const root = useRef<HTMLDivElement>(null);
  const current = latest(m);
  const decision = gate(current, m.budget, m.reviewed);
  const selection = plan(m.budget);
  const selectedCheck = checks.find((c) => c.id === selected);
  const selectedArtifact = artifact(selectedCheck?.source || selected);
  const selectedResult = current?.results.find((r) =>
    selectedCheck ? r.id === selected : r.source === selected,
  );
  const input: AnalysisRequest = {
    stage: m.stage,
    branch: m.branch,
    budget: m.budget,
    reviewed: m.reviewed,
    hasRun: !!current && current.budget === m.budget,
  };
  const signature = JSON.stringify(input);
  const cacheKey = `${model}:${signature}`;
  const cachedAdvice = adviceCache.current.get(cacheKey);
  const activeAdvice = cachedAdvice || (live && JSON.stringify(live.input) === signature && live.model === model ? live : null);
  const stale = !!live && (JSON.stringify(live.input) !== signature || live.model !== model);
  const aiEnabled = import.meta.env.PUBLIC_COMMERCE_AI_ENABLED === "true";
  const canAnalyze = aiEnabled && signedIn && access?.access.state === "approved" && catalog?.models.some(v => v.id === model) && !modelError && !accessLoading && !access.usage.paused && access.usage.lifetime_remaining > 0 && access.usage.daily_remaining > 0;

  useEffect(() => { if (cachedAdvice) setLive(cachedAdvice); }, [cachedAdvice]);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    let disposed = false;
    void getClient().then(client => {
      if (disposed) return;
      subscription = client.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user.id || null;
        if (authUser.current !== nextUser) {
          authUser.current = nextUser;
          sessionEpoch.current++;
          adviceCache.current.clear();
          attempted.current.clear();
          setLive(null);
          setAccess(null);
          setCatalog(null);
          setModel("");
          setAutoAnalyze(false);
        }
        setSignedIn(!!session);
        // Defer Supabase calls outside its auth callback lock.
        if (session) setTimeout(() => { if (!disposed) void refreshAccess(); }, 0);
      }).data.subscription;
    }).catch(() => { if (!disposed) setAccessMessage("Could not check your session. Refresh access to retry."); });
    return () => { disposed = true; subscription?.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!autoAnalyze || !canAnalyze || working || activeAdvice || attempted.current.has(cacheKey)) return;
    const timer = setTimeout(() => { void analyze(false); }, 800);
    return () => clearTimeout(timer);
  }, [autoAnalyze, canAnalyze, working, cacheKey, activeAdvice]);

  useEffect(() => {
    alive.current = true;
    setReady(true);
    const q = new URLSearchParams(location.search).get("stage");
    if (stages.includes(q as Stage)) {
      setM((v) => ({ ...v, stage: q as Stage }));
      setSelected(guidance[q as Stage].citations[0]);
    }
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const url = new URL(location.href);
    url.searchParams.set("stage", m.stage);
    history.replaceState(null, "", url);
  }, [m.stage, ready]);
  useEffect(() => {
    if (!playing || guideIndex === null || working || (autoAnalyze && canAnalyze && !activeAdvice && !attempted.current.has(cacheKey))) return;
    if (guideIndex === tour.length - 1) {
      setPlaying(false);
      return;
    }
    const words = (activeAdvice?.tourTip || tour[guideIndex].text).split(/\s+/).length;
    const timer = setTimeout(() => moveGuide(guideIndex + 1), Math.max(18000, words * 350));
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [playing, guideIndex, working, autoAnalyze, canAnalyze, activeAdvice, cacheKey]);
  useEffect(() => {
    if (!mobileEvidence) return;
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".site-header, .site-footer, .terminal-explorer, .terminal-document, .terminal-status, .cr-hero, .cr-stages, .cr-main, .cr-guide, .cr-activity, .cr-footnote, .cr-mobile-tools",
      ),
    );
    const inertStates = background.map((el) => el.inert);
    const previousOverflow = document.body.style.overflow;
    background.forEach((el) => {
      el.inert = true;
    });
    document.body.style.overflow = "hidden";
    inspectorClose.current?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileEvidence(false);
        returnFocus.current?.focus();
      }
      if (e.key === "Tab" && window.matchMedia("(max-width: 900px)").matches) {
        const elements = Array.from(
          inspector.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], summary",
          ) || [],
        ).filter((el) => el.getClientRects().length);
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", trap);
    const resized = () => {
      if (!window.matchMedia("(max-width: 900px)").matches)
        setMobileEvidence(false);
    };
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("keydown", trap);
      window.removeEventListener("resize", resized);
      background.forEach((el, i) => {
        el.inert = inertStates[i];
      });
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus();
    };
  }, [mobileEvidence]);

  function takeControl() {
    setPlaying(false);
    setGuideIndex(null);
    setFocusGuide(false);
    frames.current = [];
  }
  function moveGuide(index: number) {
    if (index < 0 || index >= tour.length) return;
    if (!frames.current[index])
      frames.current[index] = enterTour(
        index,
        index ? frames.current[index - 1] : initialMission(),
      );
    setM(structuredClone(frames.current[index]));
    setGuideIndex(index);
    setSelected(tour[index].source);
    setSourceOpen(false);
    setFocusGuide(true);
  }
  function startGuide(auto: boolean) {
    frames.current = [];
    moveGuide(0);
    setAmount("60");
    setProvider("partial");
    setPlaying(auto);
    setLive(null);
    setAiError("");
  }
  function switchStage(stage: Stage) {
    takeControl();
    setM((v) => ({ ...v, stage }));
    setSelected(guidance[stage].citations[0]);
    setSourceOpen(false);
  }
  function update(patch: Partial<Mission>, event?: string) {
    takeControl();
    setM((v) => ({
      ...v,
      ...patch,
      events: event ? [...v.events, event].slice(-40) : v.events,
    }));
  }
  function inspect(id: string, open = false) {
    setSelected(id);
    setSourceOpen(open);
    setPlaying(false);
    if (window.matchMedia("(max-width: 900px)").matches) {
      returnFocus.current = document.activeElement as HTMLElement;
      setMobileEvidence(true);
    }
  }
  function runCheckout() {
    const dollars = Number(amount);
    if (
      !amount.trim() ||
      !Number.isFinite(dollars) ||
      dollars < 0 ||
      dollars > 1000 ||
      !Number.isInteger(Math.round(dollars * 1000000) / 10000)
    ) {
      setInputError(
        "Enter an amount from $0 to $1,000 with at most two decimal places.",
      );
      return;
    }
    setInputError("");
    update(
      {
        receipt: checkout(
          { ...sample, authorized: Math.round(dollars * 100), provider },
          m.branch,
        ),
      },
      `Checkout executed · ${m.branch} · authorization ${money(Math.round(dollars * 100))}`,
    );
  }
  function runSuite() {
    const run = execute(m.branch, m.budget);
    update(
      { runs: [...m.runs, run].slice(-20), reviewed: false },
      `${m.branch} suite executed · ${run.results.filter((r) => r.status === "pass").length}/${run.results.length} passed`,
    );
    setSelected(
      run.results.find((r) => r.status === "fail")?.id || run.results[0].id,
    );
  }
  function patchBranch() {
    const branch = m.branch === "baseline" ? "patched" : "baseline";
    update(
      { branch, reviewed: false, receipt: undefined },
      branch === "patched"
        ? "Prepared exact-amount fix applied · rerun required"
        : "Baseline restored",
    );
  }
  async function refreshAccess() {
    const epoch = sessionEpoch.current;
    setAccessLoading(true);
    try {
      const { data } = await (await getClient()).auth.getSession();
      if (!alive.current || epoch !== sessionEpoch.current) return;
      setSignedIn(!!data.session);
      if (!data.session) {
        if (alive.current) {
          setAccess(null);
          setAccessMessage("Sign in to request approved Lab access.");
        }
        return;
      }
      const status = await callLab<LabStatus>("lab-access", {
        action: "status",
      });
      if (alive.current && epoch === sessionEpoch.current) {
        setAccess(status);
        setAccessMessage(
          status.access.state === "approved"
            ? "Signed in · choose a model for this visit."
            : `Lab access is ${status.access.state}. Live analysis requires approval.`,
        );
        if (status.access.state === "approved" && aiEnabled) {
          try {
            const next = await callLab<ModelCatalog>("model-catalog", { action: "list" });
            if (!alive.current || epoch !== sessionEpoch.current) return;
            setCatalog(next);
            setModel(v => next.models.some(item => item.id === v) ? v : next.defaultModel);
            setModelError("");
          } catch {
            if (alive.current && epoch === sessionEpoch.current) {
              setCatalog(null);
              setModelError("Models could not be loaded. Refresh access to retry.");
            }
          }
        }
      }
    } catch (error) {
      if (alive.current && epoch === sessionEpoch.current) {
        setAccess(null);
        setAccessMessage(
          error instanceof Error
            ? error.message
            : "Could not check access. Retry below.",
        );
      }
    } finally {
      if (alive.current && epoch === sessionEpoch.current) {
        setAccessLoading(false);
      }
    }
  }
  async function analyze(manual = true) {
    if (!canAnalyze || inFlight.current) return;
    inFlight.current = true;
    if (manual) setPlaying(false);
    setWorking(true);
    setAiError("");
    const submitted = { ...input };
    const submittedModel = model;
    const submittedKey = cacheKey;
    const epoch = sessionEpoch.current;
    attempted.current.add(submittedKey);
    const started = performance.now();
    try {
      const result = await callLab<LiveAdvice>("commerce-release-analyst", {
        ...submitted,
        model: submittedModel,
        request_id: crypto.randomUUID(),
      });
      const advice = validateAdvice(result);
      if (alive.current && epoch === sessionEpoch.current) {
        const next = { ...result, ...advice, input: submitted, metrics: { ...result.metrics!, roundTripMs: Math.round(performance.now() - started) } };
        adviceCache.current.set(submittedKey, next);
        if (adviceCache.current.size > 30) adviceCache.current.delete(adviceCache.current.keys().next().value!);
        setLive(next);
        if (result.aiUsage)
          setAccess((v) => (v ? { ...v, usage: result.aiUsage! } : v));
      }
    } catch (error) {
      if (alive.current && epoch === sessionEpoch.current)
        setAiError(
          error instanceof Error
            ? error.message
            : "Live AI failed. Retry explicitly.",
        );
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setWorking(false);
        if (epoch === sessionEpoch.current) void refreshAccess();
      }
    }
  }
  function download(format: "json" | "md") {
    const base = evidenceReport(m);
    const value =
      format === "json"
        ? JSON.stringify(
            { ...base, aiAnalysis: live ? { ...live, stale } : null },
            null,
            2,
          )
        : markdownReport(m) +
          (live
            ? `\n\n## Live AI commentary\n\nModel: ${live.model} · ${live.generatedAt} · stale relative to current state: ${stale}\n\n${live.summary}\n\n${live.claims.map((c) => `- ${c.kind}: ${c.text} [${c.citations.join(", ")}]`).join("\n")}\n\nNext action: ${live.nextAction}`
            : "\n\nAI mode: reference fallback; no live analysis in this session.");
    const url = URL.createObjectURL(
      new Blob([value], {
        type:
          format === "json"
            ? "application/json"
            : "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `commerce-release-${m.branch}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const citations = (ids: string[]) => (
    <div className="cr-citations">
      {ids.map((id) => (
        <button key={id} onClick={() => inspect(id, true)}>
          {id}
          <Mark kind="arrow" />
        </button>
      ))}
    </div>
  );
  function aiField(field: "summary" | "risk" | "nextAction" | "tourTip", fallback: string, label = "AI analysis") {
    return <div className="cr-ai-field" aria-busy={working}>
      <div className="cr-ai-field-label"><span>{label}</span><Badge value={activeAdvice ? "Live AI" : working ? "Generating" : "Fallback"} /></div>
      <p>{activeAdvice?.[field] || fallback}</p>
      {!activeAdvice && <small>{working ? "Generating an explanation for this state…" : aiError ? "AI unavailable · reference fallback shown." : "Reference fallback · analyze this stage for live guidance."}</small>}
    </div>;
  }
  const diffView = (
    <section className="cr-code" aria-label="Payment guard diff">
      <div className="cr-subtitle">
        <span>
          <Mark kind="code" /> payment/handler.ts
        </span>
        <Badge
          value={m.branch === "patched" ? "Fix applied" : "Prepared fix"}
        />
      </div>
      <pre>
        <code>
          <span className="cr-code-muted">
            {
              "// Restore the exact-amount invariant\nconst auth = provider.authorize(order);\n"
            }
          </span>
          <span className="cr-removed">{"− " + diff.baseline}</span>
          {"\n"}
          <span className="cr-added">{"+ " + diff.patched}</span>
          {"\n\n"}
          <span className="cr-code-muted">
            {
              "// Otherwise: keep order unpaid\n// and release reserved inventory."
            }
          </span>
        </code>
      </pre>
      <p>
        Prepared sandbox patch. The original change is{" "}
        <button className="cr-link" onClick={() => inspect("pr-A1", true)}>
          pr-A1
        </button>
        .
      </p>
      <button className="cr-button" onClick={patchBranch}>
        {m.branch === "baseline" ? "Apply prepared fix" : "Restore baseline"}
        <Mark kind="arrow" />
      </button>
    </section>
  );
  const checkoutView = (
    <section className="cr-checkout" aria-label="Meridian checkout">
      <div className="cr-subtitle">
        MERIDIAN / CHECKOUT <span>Sandbox</span>
      </div>
      <p className="cr-muted">Review and place your order.</p>
      <div className="cr-product">
        <span className="cr-product-icon">
          <Mark kind="box" />
        </span>
        <div>
          <strong>Industrial sensor kit</strong>
          <small>MRD-S100 · Quantity 1</small>
        </div>
        <strong>$100.00</strong>
      </div>
      <div className="cr-total">
        <span>Order total</span>
        <strong>$100.00</strong>
      </div>
      <div className="cr-form-row">
        <label>
          Authorization amount ($)
          <input
            type="number"
            min="0"
            max="1000"
            step="0.01"
            value={amount}
            onChange={(e) => {
              takeControl();
              setAmount(e.target.value);
              setM((v) => ({ ...v, receipt: undefined }));
            }}
          />
        </label>
        <label>
          Provider response
          <select
            value={provider}
            onChange={(e) => {
              takeControl();
              setProvider(e.target.value as typeof provider);
              setM((v) => ({ ...v, receipt: undefined }));
            }}
          >
            <option value="partial">Partial approval</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
        </label>
      </div>
      <div className="cr-presets">
        {[
          ["Partial", "60", "partial"],
          ["Full", "100", "approved"],
          ["Declined", "0", "declined"],
        ].map(([name, value, response]) => (
          <button
            key={name}
            onClick={() => {
              takeControl();
              setAmount(value);
              setProvider(response as typeof provider);
              setM((v) => ({ ...v, receipt: undefined }));
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {inputError && (
        <p role="alert" className="cr-error">
          {inputError}
        </p>
      )}
      <div
        className="cr-receipt"
        data-bad={
          m.receipt?.status === "confirmed" && m.receipt.captured !== 10000
        }
        role="status"
      >
        {m.receipt ? (
          <>
            <strong>
              {m.receipt.status === "confirmed"
                ? m.receipt.captured !== 10000
                  ? "Order confirmed — invariant violated"
                  : "Order confirmed — fully authorized"
                : m.receipt.status === "invalid"
                  ? "Invalid payment request"
                  : "Order unpaid — authorization rejected"}
            </strong>
            <span>
              {m.receipt.captures} capture · {money(m.receipt.captured)}{" "}
              captured · stock {m.receipt.inventory}
            </span>
          </>
        ) : (
          <>
            <strong>Ready to execute checkout</strong>
            <span>Try the partial payment against the {m.branch} guard.</span>
          </>
        )}
      </div>
      <button className="cr-button cr-primary" onClick={runCheckout}>
        Run checkout
        <Mark kind="arrow" />
      </button>
    </section>
  );
  function resultTable() {
    const baseline = latest(m, "baseline"),
      patched = latest(m, "patched");
    return (
      <div className="cr-results">
        <div className="cr-subtitle">
          <span>Execution evidence</span>
          <span>Actual browser checks</span>
        </div>
        <div className="cr-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Assertion</th>
                <th>Baseline</th>
                <th>Patched</th>
              </tr>
            </thead>
            <tbody>
              {checks
                .filter((c) => showAllChecks || c.mandatory)
                .map((c) => (
                  <tr
                    key={c.id}
                    data-selected={selected === c.id || selected === c.source}
                  >
                    <th>
                      <button onClick={() => inspect(c.id)}>{c.title}</button>
                      <small>
                        {c.mandatory
                          ? "Mandatory"
                          : selection.excluded.includes(c)
                            ? "Outside current plan"
                            : "Selected"}{" "}
                        · {c.id}
                      </small>
                    </th>
                    {[baseline, patched].map((run, i) => (
                      <td key={i}>
                        <Badge
                          value={
                            run?.results.find((r) => r.id === c.id)?.status
                          }
                        />
                        {run && run.budget !== m.budget && (
                          <small>Previous plan</small>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <button
          className="cr-show-checks"
          onClick={() => setShowAllChecks((v) => !v)}
        >
          {showAllChecks
            ? "Show mandatory checks only"
            : "Show 4 additional boundary and contract checks"}
        </button>
        {current && (
          <p className="cr-run-meta">
            {current.results.length} checks · {current.durationMs.toFixed(2)} ms
            measured · {new Date(current.at).toLocaleTimeString()} ·{" "}
            {current.branch}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="commerce-release" ref={root}>
      <header className="cr-hero">
        <div>
          <a className="cr-back" href="/lab" data-astro-reload>
            All experiments / Commerce Release Lab
          </a>
          <h1>
            Ship the change.
            <br className="cr-mobile-break" /> Prove the release.
          </h1>
          <p>
            An executable checkout mission. From requirement to release
            evidence.
          </p>
        </div>
        <div className="cr-hero-actions">
          <div>
            <button
              className="cr-button cr-primary"
              disabled={!ready}
              onClick={() =>
                startGuide(
                  !window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches,
                )
              }
            >
              <Mark kind="play" />
              Watch the story
            </button>
            <button
              className="cr-button"
              disabled={!ready}
              onClick={() => {
                takeControl();
                root.current
                  ?.querySelector<HTMLElement>(".cr-stage-title")
                  ?.focus();
              }}
            >
              Take control
              <Mark kind="arrow" />
            </button>
          </div>
          <span>Synthetic commerce · Browser sandbox</span>
        </div>
      </header>
      <fieldset disabled={!ready} className="cr-fieldset">
        <legend className="cr-sr-only">Commerce release mission</legend>
        <nav className="cr-stages" aria-label="Mission stages">
          {stages.map((stage, i) => (
            <button
              key={stage}
              onClick={() => switchStage(stage)}
              aria-current={m.stage === stage ? "step" : undefined}
            >
              <span>{i + 1}</span>
              {stage}
            </button>
          ))}
        </nav>
        <div className="cr-mobile-tools">
          <Badge value={decision.state} />
          <button
            className="cr-button"
            onClick={() => {
              returnFocus.current = document.activeElement as HTMLElement;
              setMobileEvidence(true);
            }}
          >
            Open evidence
          </button>
        </div>
        <div className="cr-workspace">
          <section
            className="cr-main"
            aria-label={`${m.stage} workspace`}
            data-highlight={focusGuide ? m.stage : undefined}
          >
            <div className="cr-main-heading">
              <h2 className="cr-stage-title" tabIndex={-1}>
                {m.stage === "Requirement"
                  ? "A payment accepted too soon"
                  : m.stage === "Impact"
                    ? "Trace the change to the business rule"
                    : m.stage === "Verify"
                      ? "Prove the fix. Preserve the limits."
                      : "Partial payment authorization"}
              </h2>
              <Badge value={m.branch} />
            </div>
            {m.stage !== "Impact" && m.stage !== "Diagnose" && aiField("summary", guidance[m.stage].text, `AI ${m.stage.toLowerCase()} review`)}
            {aiField("nextAction", "Inspect the evidence and execute the current checks before making a release decision.", "AI next action")}
            {m.stage === "Requirement" && (
              <div className="cr-requirement">
                <div className="cr-story">
                  <div className="cr-subtitle">
                    THE BUYER’S REQUIREMENT / story-A
                  </div>
                  <blockquote>{artifact("story-A")?.content}</blockquote>
                  <div className="cr-rule">
                    <span>Acceptance criterion</span>
                    <h3>{artifact("inv-A")?.content}</h3>
                    <p>
                      Given a $100 order and $60 authorized, expect zero
                      captures, an unpaid order, and released stock.
                    </p>
                    {citations(["story-A", "ac-A", "inv-A"])}
                  </div>
                  <div className="cr-business">
                    <h3>What is at stake?</h3>
                    {aiField("risk", "A confirmed order can trigger fulfillment without enough authorized payment. Connect that consequence to an executable assertion.", "AI business impact")}
                  </div>
                  <button
                    className="cr-button cr-primary"
                    onClick={() => switchStage("Change")}
                  >
                    Inspect the change
                    <Mark kind="arrow" />
                  </button>
                </div>
                <div className="cr-mission-preview">
                  <div className="cr-subtitle">YOUR MISSION</div>
                  <strong className="cr-amount">
                    $100<span>order value</span>
                  </strong>
                  <div className="cr-authorization">
                    <span>$60 authorized</span>
                    <span>$40 shortfall</span>
                  </div>
                  <div className="cr-amount-track" aria-hidden="true">
                    <span />
                  </div>
                  <ol>
                    <li>Reproduce the partial-payment defect.</li>
                    <li>Inspect the failing evidence.</li>
                    <li>Apply and verify the prepared fix.</li>
                  </ol>
                  <p>
                    About 3 minutes guided, plus AI response time.
                    <br />
                    About 5 minutes to explore.
                  </p>
                  <button
                    className="cr-button"
                    onClick={() => startGuide(false)}
                  >
                    Start step-by-step
                    <Mark kind="arrow" />
                  </button>
                </div>
              </div>
            )}
            {(m.stage === "Change" ||
              m.stage === "Tests" ||
              m.stage === "Diagnose") && (
              <>
                <div className="cr-split">
                  {checkoutView}
                  {diffView}
                </div>
                {m.stage === "Diagnose" && (
                  <div className="cr-diagnosis">
                    <h3>Follow the contradiction</h3>
                    {aiField("summary", guidance.Diagnose.text, "AI diagnosis")}
                    {citations(["pr-A1", "test-A1", "inv-A"])}
                  </div>
                )}
              </>
            )}
            {m.stage === "Impact" && (
              <div className="cr-impact">
                {aiField("summary", guidance.Impact.text, "AI impact analysis")}
                <ol className="cr-trace">
                  {[impactPath[0]?.source, ...impactPath.map((e) => e.target)]
                    .filter(Boolean)
                    .map((id, i) => (
                      <li key={id}>
                        <button
                          onClick={() => inspect(id!)}
                          aria-pressed={selected === id}
                        >
                          <span>{artifact(id!)?.type}</span>
                          <strong>{artifact(id!)?.title}</strong>
                          <code>{id}</code>
                        </button>
                        {impactPath[i] && (
                          <span className="cr-edge">
                            {impactPath[i].type.replaceAll("_", " ")}
                            <Mark kind="arrow" />
                          </span>
                        )}
                      </li>
                    ))}
                </ol>
                <details>
                  <summary>Relationship provenance</summary>
                        {impactPath.map((e) => (
                    <p key={e.id}>
                      <code>
                        {e.source} → {e.target}
                      </code>
                      <br />
                      {e.type} · {e.basis} · {e.provenance}
                    </p>
                  ))}
                </details>
                <div className="cr-dependencies">
                  <h3>Potential service propagation</h3>
                  {aiField("risk", "Checkout depends on payment and inventory. Dependencies identify where to investigate; they do not prove causation.", "AI propagation risk")}
                  {citations(["checkout", "payment", "inventory", "pr-A2"])}
                </div>
                <button
                  className="cr-button cr-primary"
                  onClick={() => switchStage("Tests")}
                >
                  Build and run the test plan
                  <Mark kind="arrow" />
                </button>
              </div>
            )}
            {m.stage === "Tests" && (
              <div className="cr-planner">
                <div>
                  <label htmlFor="cr-budget">
                    Test planning budget <strong>{m.budget} min</strong>
                  </label>
                  <input
                    id="cr-budget"
                    type="range"
                    min={MIN_BUDGET}
                    max={MAX_BUDGET}
                    value={m.budget}
                    onChange={(e) =>
                      update(
                        { budget: Number(e.target.value), reviewed: false },
                        "Test budget changed · rerun current plan",
                      )
                    }
                  />
                  <p>
                    {selection.selected.length} selected ·{" "}
                    {selection.excluded.length} excluded · {selection.cost}{" "}
                    illustrative planning minutes. Actual execution duration is
                    measured separately.
                  </p>
                </div>
                <button className="cr-button cr-primary" onClick={runSuite}>
                  Run {m.branch} checks
                  <Mark kind="play" />
                </button>
                <details>
                  <summary>
                    Why these checks? View selection and residuals
                  </summary>
                  {checks.map((c) => (
                    <div className="cr-selection-row" key={c.id}>
                      <strong>{c.title}</strong>
                      <span>
                        {selection.selected.includes(c)
                          ? c.mandatory
                            ? "Mandatory"
                            : "Selected"
                          : "Excluded — budget"}{" "}
                        · {c.cost} planning min
                      </span>
                      <p>{activeAdvice?.checkReasons.find(reason => reason.id === c.id)?.reason || c.reason}</p>
                      <small>{activeAdvice?.checkReasons.some(reason => reason.id === c.id) ? "AI rationale" : "Reference fallback"}</small>
                    </div>
                  ))}
                </details>
              </div>
            )}
            {(m.stage === "Tests" ||
              m.stage === "Diagnose" ||
              m.stage === "Verify") &&
              resultTable()}
            {m.stage === "Diagnose" && (
              <div className="cr-next">
                <button
                  className="cr-button cr-primary"
                  onClick={() => switchStage("Verify")}
                >
                  Continue to verification
                  <Mark kind="arrow" />
                </button>
              </div>
            )}
            {m.stage === "Verify" && (
              <div className="cr-verification">
                <div className="cr-verification-top">
                  <div>
                    <Badge value={decision.state} />
                    <p>{decision.reason}</p>
                  </div>
                  <button className="cr-button cr-primary" onClick={runSuite}>
                    Run {m.branch} checks
                    <Mark kind="play" />
                  </button>
                </div>
                {m.branch === "baseline" && (
                  <button className="cr-button" onClick={patchBranch}>
                    Apply prepared fix
                  </button>
                )}
                {m.budget < MAX_BUDGET && (
                  <button
                    className="cr-button"
                    onClick={() =>
                      update(
                        { budget: MAX_BUDGET, reviewed: false },
                        "Full test plan selected · rerun required",
                      )
                    }
                  >
                    Select all checks
                  </button>
                )}
                <label className="cr-review">
                  <input
                    type="checkbox"
                    checked={m.reviewed}
                    disabled={
                      !current ||
                      current.budget !== m.budget ||
                      current.results.some((r) => r.status === "fail")
                    }
                    onChange={(e) =>
                      update(
                        { reviewed: e.target.checked },
                        "Local evidence review acknowledgment updated",
                      )
                    }
                  />
                  <span>
                    I reviewed the diff and evidence limitations. This
                    acknowledgment is local to the demo.
                  </span>
                </label>
                <details open>
                  <summary>
                    What this evidence does—and does not—establish
                  </summary>
                  <ul>
                    {limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
                <div className="cr-export">
                  <button className="cr-button" onClick={() => download("md")}>
                    Export Markdown
                    <Mark kind="arrow" />
                  </button>
                  <button
                    className="cr-button"
                    onClick={() => download("json")}
                  >
                    Export JSON
                    <Mark kind="arrow" />
                  </button>
                  <a href="/lab/quality-digital-twin" data-astro-reload>
                    Explore the original twin
                  </a>
                </div>
              </div>
            )}
          </section>
          {mobileEvidence && (
            <button
              className="cr-sheet-backdrop"
              aria-label="Close evidence inspector"
              tabIndex={-1}
              onClick={() => {
                setMobileEvidence(false);
                returnFocus.current?.focus();
              }}
            />
          )}
          <aside
            ref={inspector}
            className={`cr-inspector ${mobileEvidence ? "is-open" : ""}`}
            aria-label="Evidence inspector"
          >
            <div className="cr-subtitle">
              <span>EVIDENCE / {selected}</span>
              <button
                className="cr-sheet-close"
                ref={inspectorClose}
                onClick={() => {
                  setMobileEvidence(false);
                  returnFocus.current?.focus();
                }}
              >
                Close
              </button>
            </div>
            <div className="cr-decision" data-state={decision.state}>
              <Badge value={decision.state} />
              <h3>
                {decision.state === "HOLD"
                  ? "Release held"
                  : decision.state === "REVIEW READY"
                    ? "Ready for sandbox review"
                    : decision.state === "CONDITIONAL"
                      ? "Evidence gaps remain"
                      : decision.state === "REVIEW PENDING"
                        ? "Human review pending"
                        : "Evidence comes first"}
              </h3>
              <p>{decision.reason}</p>
            </div>
            <dl className="cr-facts">
              <div>
                <dt>Branch</dt>
                <dd>
                  {m.branch} · {VERSION}
                </dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>Payment / Meridian</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedArtifact?.title}</dd>
              </div>
              <div>
                <dt>Execution</dt>
                <dd>
                  {selectedResult
                    ? `Expected ${selectedResult.expected}; actual ${selectedResult.actual} · ${selectedResult.status}`
                    : "No result for this artifact in the current branch."}
                </dd>
              </div>
            </dl>
            <details
              open={sourceOpen}
              onToggle={(e) => setSourceOpen(e.currentTarget.open)}
              className="cr-source"
            >
              <summary>Inspect original source</summary>
              <pre>{selectedArtifact?.content}</pre>
              <small>
                {selectedArtifact?.provenance} · {world.fixtureRevision}
              </small>
              {selectedResult && (
                <>
                  <h4>Executed assertion</h4>
                  <code>{selectedResult.id}</code>
                  <ul>
                    {selectedResult.events.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </details>
            <details className="cr-ai" open>
              <summary>Analyze with NVIDIA AI</summary>
              <p>{accessMessage}</p>
              {signedIn && <label className="cr-model-select">
                Analysis model
                <select aria-label="Analysis model" value={model} disabled={!catalog || working} onChange={e => { setModel(e.target.value); setAiError(""); }}>
                  {!catalog && <option value="">Loading available models…</option>}
                  {catalog?.models.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
              </label>}
              {modelError && <p role="alert" className="cr-error">{modelError}</p>}
              {access?.access.state === "approved" && <p>{access.usage.lifetime_remaining} personal / {access.usage.daily_remaining} shared daily calls remaining.</p>}
              <div className="cr-ai-actions">
                <button className="cr-button cr-primary" disabled={!canAnalyze || working} onClick={() => void analyze()}>
                  {working ? "Analyzing…" : activeAdvice ? "Analyze again" : "Run live analysis"}
                </button>
                <button className="cr-link" disabled={accessLoading || working} onClick={() => void refreshAccess()}>
                  {accessLoading ? "Checking access…" : "Refresh access"}
                </button>
                {signedIn === false && <a href="/login?next=%2Flab%2Fcommerce-release" data-astro-reload>Sign in</a>}
              </div>
              {signedIn && <div className="cr-model-scope"><small>Model applies to this visit.</small> <a href="/settings" data-astro-reload>Model settings</a></div>}
              <label className="cr-auto-analysis">
                <input type="checkbox" checked={autoAnalyze} disabled={!canAnalyze && !autoAnalyze} onChange={e => setAutoAnalyze(e.target.checked)} />
                Analyze as I explore
              </label>
              <small>One call per new stage or evidence state. Cached explanations are reused. Each dispatched call consumes allowance, including failures. Automatic calls stop when access or allowance is unavailable.</small>
              {!aiEnabled && <p>Live AI is unavailable in this build. Reference fallbacks are shown.</p>}
              {aiError && (
                <p className="cr-error" role="alert">
                  {aiError}
                </p>
              )}
              {live && (
                <div className="cr-live" aria-live="polite">
                  <Badge value={stale ? "Stale analysis" : "Live AI"} />
                  <small>
                    {live.model} · {new Date(live.generatedAt).toLocaleString()}
                  </small>
                  {live.metrics && <small className="cr-ai-metrics">{((live.metrics.roundTripMs || live.metrics.providerMs) / 1000).toFixed(1)}s response · {live.metrics.totalTokens ?? "—"} tokens</small>}
                  {stale && (
                    <p>
                      Inputs changed. This analysis belongs to{" "}
                      {live.input.stage}, {live.input.branch}, budget{" "}
                      {live.input.budget}. Run again for the current state.
                    </p>
                  )}
                  <p>{live.summary}</p>
                  <p>{live.risk}</p>
                  {live.claims.map((c, i) => (
                    <div key={i}>
                      <Badge value={c.kind} />
                      <p>{c.text}</p>
                      {citations(c.citations)}
                    </div>
                  ))}
                  <strong>Suggested next action</strong>
                  <p>{live.nextAction}</p>
                </div>
              )}
            </details>
          </aside>
        </div>
        <section className="cr-guide" aria-label="Workflow guide">
          <div aria-live="polite">
            <strong>
              {guideIndex === null
                ? "YOUR WORKSPACE · TAKE CONTROL"
                : `STEP ${guideIndex + 1} OF ${tour.length} · ${tour[guideIndex].title.toUpperCase()}`}
            </strong>
            <p>
              {guideIndex === null
                ? activeAdvice?.nextAction || "Choose a stage, inspect its evidence, and run AI analysis for contextual guidance."
                : activeAdvice?.tourTip || tour[guideIndex].text}
            </p>
            {guideIndex !== null && <small>{activeAdvice ? "AI guidance" : "Reference fallback"} · {working ? "Waiting for AI…" : playing ? "Advances after at least 18 seconds" : "Paused — read at your pace"}</small>}
          </div>
          <div className="cr-guide-controls">
            <label className="cr-tip-toggle"><input type="checkbox" checked={tipsEnabled} onChange={e => setTipsEnabled(e.target.checked)} /> Show tip cards</label>
            {guideIndex !== null ? (
              <>
                <button
                  className="cr-button"
                  onClick={() => setPlaying((v) => !v)}
                  disabled={guideIndex === tour.length - 1}
                >
                  <Mark kind={playing ? "pause" : "play"} />
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  className="cr-button"
                  disabled={guideIndex === 0}
                  onClick={() => {
                    setPlaying(false);
                    moveGuide(guideIndex - 1);
                  }}
                >
                  Back
                </button>
                <button
                  className="cr-button cr-primary"
                  disabled={guideIndex === tour.length - 1}
                  onClick={() => {
                    setPlaying(false);
                    moveGuide(guideIndex + 1);
                  }}
                >
                  Next
                  <Mark kind="arrow" />
                </button>
                <button className="cr-link" onClick={takeControl}>
                  Take control
                </button>
                <button className="cr-link" onClick={() => startGuide(false)}>
                  Restart
                </button>
              </>
            ) : (
              <>
                <button className="cr-button" onClick={() => startGuide(false)}>
                  Guided mission
                </button>
                <button
                  className="cr-link"
                  onClick={() => {
                    takeControl();
                    setM(initialMission());
                    setSelected("ac-A");
                    setLive(null);
                    setAmount("60");
                    setProvider("partial");
                    setAiError("");
                  }}
                >
                  Reset mission
                </button>
              </>
            )}
          </div>
        </section>
        {guideIndex !== null && tipsEnabled && !mobileEvidence && <TourCoach index={guideIndex} text={activeAdvice?.tourTip || tour[guideIndex].text} live={!!activeAdvice} playing={playing} working={working} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} onHide={() => setTipsEnabled(false)} onNext={() => { setPlaying(false); moveGuide(guideIndex + 1); }} />}
        <details className="cr-activity">
          <summary>
            <span>ACTIVITY</span>
            <span>{m.events.at(-1)}</span>
            <span>View logs</span>
          </summary>
          <ol>
            {m.events.map((event, i) => (
              <li key={i}>
                <code>{String(i + 1).padStart(2, "0")}</code>
                {event}
              </li>
            ))}
          </ol>
          {m.receipt && (
            <>
              <h3>Latest checkout execution</h3>
              <ol>
                {m.receipt.events.map((event, i) => (
                  <li key={i}>{event}</li>
                ))}
              </ol>
            </>
          )}
        </details>
        <footer className="cr-footnote">
          <span>
            Commerce Release Lab · {world.fixtureRevision} · entirely synthetic
          </span>
          <a href="/work/commerce-release">
            Architecture &amp; limitations
            <Mark kind="arrow" />
          </a>
        </footer>
      </fieldset>
    </div>
  );
}
