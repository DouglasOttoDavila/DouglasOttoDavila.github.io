import ModelPreference from "./ModelPreference";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  callLab,
  getClient,
  safeReturnPath,
  LabError,
  type LabStatus,
} from "../../lib/lab-client";
const Analyzer = lazy(() => import("./Analyzer"));
const Classifier = lazy(() => import("./Classifier"));
const ContextGraph = lazy(() => import("./ContextGraph"));
const Settings = lazy(() => import("./Settings"));

export type Surface =
  | "index"
  | "login"
  | "callback"
  | "analyzer"
  | "classifier"
  | "graph"
  | "entity"
  | "settings";
export type ToolProps = { status: LabStatus; refresh: () => Promise<void> };

export default function LabApp({ surface }: { surface: Surface }) {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    const active = () => mounted.current && current === generation.current;
    try {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      if (!active()) return;
      setEmail(data.session?.user.email || "");
      if (!data.session) {
        setStatus(null);
        return;
      }
      const next = await callLab<LabStatus>("lab-access", { action: "status" });
      if (active()) {
        setStatus(next);
        setError("");
      }
    } catch (reason) {
      if (active()) {
        setStatus((previous) =>
          reason instanceof LabError && [401, 403].includes(reason.status)
            ? null
            : previous
              ? { ...previous, usage: { ...previous.usage, paused: true } }
              : null,
        );
        setError(message(reason));
      }
    } finally {
      if (active()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const client = await getClient();
        if (!mounted.current) return;
        if (surface === "callback") {
          const query = new URLSearchParams(location.search);
          if (query.has("error"))
            throw new Error(
              query.get("error_description") ||
                "Google sign-in was cancelled. Please try again.",
            );
          const code = query.get("code");
          if (!code)
            throw new Error(
              "This sign-in link is incomplete or expired. Please sign in again.",
            );
          const result = await client.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          const next = safeReturnPath(sessionStorage.getItem("lab-return-to"));
          sessionStorage.removeItem("lab-return-to");
          location.replace(next);
          return;
        }
        const subscription = client.auth.onAuthStateChange((event) => {
          generation.current++;
          if (event === "SIGNED_OUT") {
            setStatus(null);
            setEmail("");
          }
          setTimeout(() => {
            if (mounted.current) void refresh();
          }, 0);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        await refresh();
      } catch (reason) {
        if (mounted.current) {
          setError(message(reason));
          setLoading(false);
        }
      }
    })();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      generation.current++;
      unsubscribe?.();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh, surface]);

  async function signIn() {
    setWorking(true);
    setError("");
    try {
      const requested =
        surface === "callback"
          ? sessionStorage.getItem("lab-return-to")
          : surface === "login"
            ? new URLSearchParams(location.search).get("next")
            : location.pathname + location.search;
      sessionStorage.setItem("lab-return-to", safeReturnPath(requested));
      const client = await getClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback/` },
      });
      if (error) throw error;
    } catch (reason) {
      setError(message(reason));
      setWorking(false);
    }
  }
  async function signOut() {
    generation.current++;
    setWorking(true);
    try {
      const { error } = await (await getClient()).auth.signOut();
      if (error) throw error;
      setStatus(null);
      setEmail("");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setWorking(false);
    }
  }

  if (loading && surface === "login")
    return (
      <div className="access-login">
        <header className="access-heading">
          <h1>Explore the Lab</h1>
          <p>Sign in with Google to request access to the experiments.</p>
        </header>
        <div className="lab-access access-loading" role="status">
          Checking Lab access…
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="lab-access access-loading" role="status">
        {surface === "callback"
          ? "Completing your Google sign-in…"
          : "Checking Lab access…"}
      </div>
    );
  const approved = status?.access.state === "approved" && !error;
  const returnTo =
    surface === "login"
      ? safeReturnPath(new URLSearchParams(window.location.search).get("next"))
      : "/lab";
  if (surface === "index")
    return (
      <aside className="catalog-access" aria-label="Lab access">
        {approved && status ? (
          <>
            <p>
              <strong>● Lab access approved</strong> ·{" "}
              {status.usage.lifetime_remaining} account runs remaining
            </p>
            <p>{status.usage.daily_remaining} shared runs available today</p>
            {status.usage.paused && <p>Processing is paused.</p>}
          </>
        ) : (
          <p>
            {error && email
              ? "Could not verify your access."
              : status
                ? `Access ${status.access.state}.`
                : email
                  ? "Could not verify your access."
                  : "Take a closer look at the work."}
          </p>
        )}
        <a className="text-link" href="/login" data-astro-reload>
          {email ? "Access details →" : "Sign in to request access →"}
        </a>
        {error && (
          <p className="lab-error" role="alert">
            {error}
          </p>
        )}
      </aside>
    );
  const titles = {
    pending: "Your access request is pending.",
    denied: "Your access request was declined.",
    revoked: "Your Lab access has been revoked.",
  };
  let content: ReactNode = null;
  if (approved && status) {
    const props = { status, refresh };
    if (surface === "analyzer") content = <Analyzer {...props} />;
    if (surface === "classifier") content = <Classifier />;
    if (surface === "graph" || surface === "entity")
      content = <ContextGraph {...props} entityOnly={surface === "entity"} />;
  }
  if (surface === "settings" && approved)
    content = (
      <>
        <ModelPreference />
        {status?.access.is_admin && <Settings refresh={refresh} />}
      </>
    );
  const AccessContainer = surface === "graph" && approved ? "details" : "div";
  return (
    <div className={`lab-app ${surface === "login" ? "access-login" : ""}`}>
      {surface === "login" && (
        <header className="access-heading">
          <h1>{approved ? "You’re ready to explore." : "Explore the Lab"}</h1>
          {!email && (
            <p>Sign in with Google to request access to the experiments.</p>
          )}
        </header>
      )}
      <AccessContainer
        className={
          surface === "graph" && approved
            ? "graph-access-disclosure"
            : undefined
        }
      >
        {surface === "graph" && approved && (
          <summary>Lab access approved · Account and usage details</summary>
        )}
        <section
          className={`lab-access ${approved ? "is-approved" : ""}`}
          aria-label="Lab access"
        >
          <div>
            {(email || surface !== "login") && (
              <p className="lab-status-label">
                {approved
                  ? "Lab access approved"
                  : email
                    ? "Signed in"
                    : "A closer look at the work"}
              </p>
            )}
            {approved && status ? (
              <>
                <p className="usage-line">
                  Account allowance:{" "}
                  <strong>
                    {status.usage.lifetime_remaining} of{" "}
                    {status.usage.lifetime_limit}
                  </strong>{" "}
                  runs remaining
                  <br />
                  Shared daily capacity:{" "}
                  <strong>
                    {status.usage.daily_remaining} of {status.usage.daily_limit}
                  </strong>{" "}
                  runs available
                </p>
                <p className="lab-muted">
                  {email} · Daily reset:{" "}
                  {new Date(status.usage.resets_at).toLocaleString(undefined, {
                    timeZone: status.usage.timezone,
                  })}{" "}
                  ({status.usage.timezone}).
                </p>
                {status.usage.paused && (
                  <p role="status">
                    Processing is paused by Douglas. You can still explore the
                    demonstrations.
                  </p>
                )}
                {!status.usage.paused && !canExecute(status) && (
                  <p role="status">
                    {status.usage.lifetime_remaining <= 0
                      ? "Your account allowance has been used. Contact Douglas to discuss further access."
                      : "Today’s shared allowance has been used. Processing will be available after the daily reset."}
                  </p>
                )}
                {status.usage.lifetime_remaining <= 0 && (
                  <a
                    className="text-link"
                    href="mailto:douglas.odavila@gmail.com"
                  >
                    Discuss further access ↗
                  </a>
                )}
              </>
            ) : (
              <>
                {(email || surface !== "login") && (
                  <h2>
                    {error && email
                      ? "We could not verify your access."
                      : status
                        ? titles[status.access.state as keyof typeof titles]
                        : email
                          ? "We could not verify your access."
                          : "Sign in to explore the Lab."}
                  </h2>
                )}
                {(email || surface !== "login") && (
                  <p>
                    {status?.access.state === "pending"
                      ? "Douglas will review your request. After approval, you can explore the demonstrations within your account allowance."
                      : status
                        ? "Contact Douglas if you would like to discuss access."
                        : "Continue with Google, then Douglas approves your access. Your allowance applies across the processing tools; exploring the simulations is free."}
                  </p>
                )}
                {status && status.access.state !== "approved" && (
                  <a
                    className="text-link"
                    href="mailto:douglas.odavila@gmail.com"
                  >
                    Contact Douglas ↗
                  </a>
                )}
                {email && <p className="lab-muted">{email}</p>}
              </>
            )}
            {error && (
              <p className="lab-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="lab-actions">
            {!email && (
              <>
                <button
                  className="button button-secondary google-button"
                  onClick={signIn}
                  disabled={working}
                >
                  {!working && (
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                    >
                      <path
                        fill="#4285F4"
                        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 44c5.4 0 10-1.8 13.5-4.9l-6.5-5c-1.8 1.2-4.1 1.9-7 1.9-5.2 0-9.7-3.5-11.3-8.2H6v5.2C9.4 39.6 16.2 44 24 44z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M12.7 27.8a12 12 0 0 1 0-7.6V15H6a20 20 0 0 0 0 18z"
                      />
                      <path
                        fill="#EA4335"
                        d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8C34 5.9 29.4 4 24 4 16.2 4 9.4 8.4 6 15l6.7 5.2C14.3 15.5 18.8 12 24 12z"
                      />
                    </svg>
                  )}
                  {working ? "Opening Google…" : "Continue with Google"}
                </button>
                {surface === "login" && (
                  <p className="approval-note">
                    Access is reviewed before live runs are enabled.
                  </p>
                )}
              </>
            )}
            {error && (
              <button className="text-link" onClick={() => void refresh()}>
                Retry access check
              </button>
            )}
            {email && (
              <button
                className="button button-secondary"
                onClick={() => void refresh()}
              >
                Refresh access
              </button>
            )}
            {email && (
              <button
                className="text-link"
                onClick={signOut}
                disabled={working}
              >
                Sign out
              </button>
            )}
            {approved && surface !== "settings" && (
              <a className="text-link" href="/settings" data-astro-reload>
                Site settings →
              </a>
            )}
            {(surface === "login" || surface === "callback") && approved && (
              <a
                className="button button-primary open-lab"
                href={returnTo}
                data-astro-reload
              >
                {returnTo === "/lab"
                  ? "Open the Lab →"
                  : "Continue to experiment →"}
              </a>
            )}
            {surface === "login" && !approved && (
              <a className="text-link browse-experiments" href="/lab">
                Browse experiments →
              </a>
            )}
          </div>
        </section>
      </AccessContainer>
      {surface === "settings" && status && !status.access.is_admin && (
        <p role="alert">
          Administrative settings are available to Douglas only.
        </p>
      )}
      <Suspense fallback={<p role="status">Loading experiment…</p>}>
        {content}
      </Suspense>
    </div>
  );
}

export function canExecute(status: LabStatus) {
  return (
    status.access.state === "approved" &&
    !status.usage.paused &&
    status.usage.lifetime_remaining > 0 &&
    status.usage.daily_remaining > 0
  );
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
