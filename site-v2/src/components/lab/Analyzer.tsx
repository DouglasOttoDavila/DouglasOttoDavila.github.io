import { useRef, useState } from 'react';
import { callLab, executionKey } from '../../lib/lab-client';
import { canExecute, message, type ToolProps } from './LabApp';

export default function Analyzer({ status, refresh }: ToolProps) {
  const [story, setStory] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const retry = Boolean(request.current && request.current.signature === JSON.stringify({ story_content: story.trim() }));
  async function analyze(event: { preventDefault(): void }) {
    event.preventDefault(); if (busy || !story.trim() || (!retry && !canExecute(status))) return;
    setBusy(true); setError('');
    const body = { story_content: story.trim() };
    request.current = executionKey(request.current, body);
    try {
      const next = await callLab('user-story-analyzer', { ...body, request_id: request.current.id });
      setResult(next); request.current = null;
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); await refresh(); }
  }
  const scores = result?.invest_score;
  const improvement = result?.story_improvement?.body;
  return <div className="tool-workspace analyzer-workspace">
    <form onSubmit={analyze} className="tool-input">
      <div className="tool-section-heading"><h2>Start with a user story.</h2><span className="lab-tag">Deterministic review</span></div>
      <p>Review clarity and testability against INVEST criteria. This version uses explicit scoring rules and configurable templates.</p>
      <label htmlFor="story">User story and acceptance criteria</label>
      <textarea id="story" rows={12} maxLength={12000} required value={story} onChange={event => setStory(event.target.value)} placeholder="As a customer, I want to… so that…" />
      <div className="lab-actions"><button type="button" className="text-link" onClick={() => setStory('As a customer, I want to reset my password so that I can regain access to my account.\n\nAcceptance criteria:\nGiven a registered email, when I request a reset, then a single-use link arrives within 60 seconds.')}>Use an example</button><span className="lab-muted">{story.length.toLocaleString()} / 12,000</span></div>
      <button type="submit" className="button button-primary" disabled={busy || !story.trim() || (!retry && !canExecute(status))}>{busy ? 'Reviewing story…' : retry ? 'Retry existing request' : 'Review story · 1 execution'}</button>
      {error && <p role="alert" className="lab-error">{error} Your input is saved here; retrying the same request will not run it twice.</p>}
      {error && request.current && <button type="button" className="text-link" disabled={!canExecute(status)} onClick={() => { request.current = null; setError(''); }}>Start a new execution instead</button>}
    </form>
    <section className="tool-output" aria-live="polite" aria-busy={busy}>
      <h2>The review</h2>
      {!scores ? <div className="tool-empty"><span className="lab-tag">Ready for your story</span><h3>See what is clear. Find what is missing.</h3><p>Your review will show six INVEST scores, suggestions, a revised story, and acceptance criteria for you to inspect.</p></div> : <>
        <p>{scores.overall_comment}</p>
        <dl className="score-list">{['independent', 'negotiable', 'valuable', 'estimable', 'small', 'testable'].map(key => <div key={key}><dt>{key}</dt><dd><meter min={0} max={5} value={scores[key]} aria-label={key} /> <strong>{scores[key]} / 5</strong></dd></div>)}</dl>
        {improvement && <>
          <h3>Suggested improvements</h3><ul className="review-list">{Object.entries(improvement).filter(([key]) => key.endsWith('Suggestion')).map(([key, value]) => <li key={key}>{String(value)}</li>)}</ul>
          <h3>Revised story</h3><p>{improvement.rewrittenStory}</p>
          <h3>Acceptance criteria draft</h3><pre>{improvement.gherkinAcceptanceCriteria}</pre>
          <h3>Missing context</h3><p>{improvement.missingContextOrDependencies}</p>
          <button type="button" className="text-link" onClick={() => { const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'story-review.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download review ↓</button>
        </>}
      </>}
    </section>
  </div>;
}
