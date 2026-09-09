import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { callLab, getClient, safeReturnPath, LabError, type LabStatus } from '../../lib/lab-client';
import Analyzer from './Analyzer';
import Classifier from './Classifier';
import ContextGraph from './ContextGraph';
import Settings from './Settings';

export type Surface = 'index' | 'login' | 'callback' | 'analyzer' | 'classifier' | 'graph' | 'entity' | 'settings';
export type ToolProps = { status: LabStatus; refresh: () => Promise<void> };

export default function LabApp({ surface }: { surface: Surface }) {
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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
      setEmail(data.session?.user.email || '');
      if (!data.session) { setStatus(null); return; }
      const next = await callLab<LabStatus>('lab-access', { action: 'status' });
      if (active()) { setStatus(next); setError(''); }
    } catch (reason) {
      if (active()) { setStatus(previous => reason instanceof LabError && [401, 403].includes(reason.status) ? null : previous ? { ...previous, usage: { ...previous.usage, paused: true } } : null); setError(message(reason)); }
    } finally { if (active()) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const client = await getClient();
        if (!mounted.current) return;
        if (surface === 'callback') {
          const query = new URLSearchParams(location.search);
          if (query.has('error')) throw new Error(query.get('error_description') || 'Google sign-in was cancelled. Please try again.');
          const code = query.get('code');
          if (!code) throw new Error('This sign-in link is incomplete or expired. Please sign in again.');
          const result = await client.auth.exchangeCodeForSession(code);
          if (result.error) throw result.error;
          const next = safeReturnPath(sessionStorage.getItem('lab-return-to'));
          sessionStorage.removeItem('lab-return-to');
          location.replace(next);
          return;
        }
        const subscription = client.auth.onAuthStateChange((event) => { generation.current++; if (event === 'SIGNED_OUT') { setStatus(null); setEmail(''); } setTimeout(() => { if (mounted.current) void refresh(); }, 0); });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
        await refresh();
      } catch (reason) { if (mounted.current) { setError(message(reason)); setLoading(false); } }
    })();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => { mounted.current = false; generation.current++; unsubscribe?.(); clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh, surface]);

  async function signIn() {
    setWorking(true); setError('');
    try {
      const requested = surface === 'login' || surface === 'callback' ? new URLSearchParams(location.search).get('next') : location.pathname + location.search;
      sessionStorage.setItem('lab-return-to', safeReturnPath(requested));
      const client = await getClient();
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback/` } });
      if (error) throw error;
    } catch (reason) { setError(message(reason)); setWorking(false); }
  }
  async function signOut() {
    generation.current++;
    setWorking(true);
    try { const { error } = await (await getClient()).auth.signOut(); if (error) throw error; setStatus(null); setEmail(''); }
    catch (reason) { setError(message(reason)); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="lab-access" role="status">{surface === 'callback' ? 'Completing your Google sign-in…' : 'Checking Lab access…'}</div>;
  const approved = status?.access.state === 'approved';
  const titles = { pending: 'Your access request is pending.', denied: 'Your access request was declined.', revoked: 'Your Lab access has been revoked.' };
  let content: ReactNode = null;
  if (approved && status) {
    const props = { status, refresh };
    if (surface === 'analyzer') content = <Analyzer {...props} />;
    if (surface === 'classifier') content = <Classifier />;
    if (surface === 'graph' || surface === 'entity') content = <ContextGraph {...props} entityOnly={surface === 'entity'} />;
  }
  if (surface === 'settings' && status?.access.is_admin) content = <Settings refresh={refresh} />;
  return <div className="lab-app">
    <section className={`lab-access ${approved ? 'is-approved' : ''}`} aria-label="Lab access">
      <div>
        <p className="lab-status-label">{approved ? 'Lab access approved' : email ? 'Signed in' : 'A closer look at the work'}</p>
        {approved && status ? <>
          <p className="usage-line"><strong>{status.usage.lifetime_remaining} of {status.usage.lifetime_limit}</strong> executions left for your account <span aria-hidden="true">·</span> <strong>{status.usage.daily_remaining} of {status.usage.daily_limit}</strong> available site-wide today</p>
          <p className="lab-muted">{email} · Daily reset: {new Date(status.usage.resets_at).toLocaleString(undefined, { timeZone: status.usage.timezone })} ({status.usage.timezone}).</p>
          {status.usage.paused && <p role="status">Processing is paused by Douglas. You can still explore the demonstrations.</p>}
          {!status.usage.paused && !canExecute(status) && <p role="status">{status.usage.lifetime_remaining <= 0 ? 'Your account allowance has been used. Contact Douglas to discuss further access.' : 'Today’s shared allowance has been used. Processing will be available after the daily reset.'}</p>}
        </> : <>
          <h2>{status ? titles[status.access.state as keyof typeof titles] : email ? 'We could not verify your access.' : 'Sign in to explore the Lab.'}</h2>
          <p>{status?.access.state === 'pending' ? 'Douglas will review your request. After approval, you can explore every demonstration with a shared execution allowance.' : status ? 'Contact Douglas if you would like to discuss access.' : 'Continue with Google, then Douglas approves your access. Your allowance applies across the processing tools; exploring the simulations is free.'}</p>
          {email && <p className="lab-muted">{email}</p>}
        </>}
        {error && <p className="lab-error" role="alert">{error}</p>}
      </div>
      <div className="lab-actions">
        {!email && <button className="button button-primary" onClick={signIn} disabled={working}>{working ? 'Opening Google…' : 'Continue with Google'}</button>}
        {email && <button className="button button-secondary" onClick={() => void refresh()}>Refresh access</button>}
        {email && <button className="text-link" onClick={signOut} disabled={working}>Sign out</button>}
        {status?.access.is_admin && surface !== 'settings' && <a className="text-link" href="/settings" data-astro-reload>Site settings →</a>}
        {(surface === 'login' || surface === 'callback') && approved && <a className="button button-primary" href="/lab" data-astro-reload>Open the Lab →</a>}
      </div>
    </section>
    {surface === 'settings' && status && !status.access.is_admin && <p role="alert">Site settings are available to Douglas only.</p>}
    {content}
  </div>;
}

export function canExecute(status: LabStatus) { return status.access.state === 'approved' && !status.usage.paused && status.usage.lifetime_remaining > 0 && status.usage.daily_remaining > 0; }
export function message(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }
