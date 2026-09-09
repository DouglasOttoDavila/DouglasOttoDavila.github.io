import { useEffect, useState } from 'react';
import { classify, labels, type Signals } from '../../lib/classifier';

const samples: { name: string; signals: Signals }[] = [
  { name: 'Checkout retry failure', signals: { retry: true, flip: 0.82, duration: 2.88, churn: 9, keyword: 'timeout' } },
  { name: 'API assertion after service change', signals: { retry: false, flip: 0.18, duration: 1.375, churn: 35, keyword: 'assertion' } },
  { name: 'Browser grid timeout', signals: { retry: false, flip: 0.46, duration: 3.8, churn: 5, keyword: 'network' } }
];
export default function Classifier() {
  const [signals, setSignals] = useState<Signals>(samples[0].signals);
  const [name, setName] = useState(samples[0].name);
  const [playing, setPlaying] = useState(false);
  const [sample, setSample] = useState(0);
  const result = classify(signals);
  function next() { const index = (sample + 1) % samples.length; setSample(index); setSignals(samples[index].signals); setName(samples[index].name); }
  useEffect(() => { if (!playing) return; const timer = setInterval(next, 3200); return () => clearInterval(timer); }, [playing, sample]);
  function update(key: keyof Signals, value: number | string | boolean) { setPlaying(false); setSignals({ ...signals, [key]: value }); }
  return <div className="tool-workspace classifier-workspace">
    <section className="tool-input">
      <div className="tool-section-heading"><h2>Adjust the failure signals.</h2><span className="lab-tag">Free simulation</span></div>
      <p>Explore the original browser scoring model. These illustrative likelihoods are not predictions from a trained Python model.</p>
      <label htmlFor="signal-name">Test or suite</label><input id="signal-name" value={name} onChange={e => { setName(e.target.value); setPlaying(false); }} maxLength={160} />
      <label htmlFor="signal-keyword">Failure category</label><select id="signal-keyword" value={signals.keyword} onChange={e => update('keyword', e.target.value)}><option value="assertion">Assertion</option><option value="timeout">Timeout</option><option value="network">Browser or network</option><option value="dependency">Dependency unavailable</option></select>
      <label className="checkbox-label"><input type="checkbox" checked={signals.retry} onChange={e => update('retry', e.target.checked)} /> Retry passed</label>
      {([{ key: 'flip', label: 'Pass/fail flip rate', min: 0, max: 1, step: 0.01 }, { key: 'duration', label: 'Duration relative to baseline', min: 0.5, max: 4, step: 0.1 }, { key: 'churn', label: 'Changed files', min: 0, max: 40, step: 1 }] as const).map(item => <div key={item.key} className="range-field"><label htmlFor={`signal-${item.key}`}>{item.label} <output>{signals[item.key]}{item.key === 'duration' ? '×' : ''}</output></label><input id={`signal-${item.key}`} type="range" min={item.min} max={item.max} step={item.step} value={signals[item.key]} onChange={e => update(item.key, Number(e.target.value))} /></div>)}
      <div className="lab-actions"><button className="button button-secondary" onClick={() => setPlaying(!playing)}>{playing ? 'Pause examples' : 'Play examples'}</button><button className="text-link" onClick={() => { setPlaying(false); next(); }}>Next example →</button></div>
    </section>
    <section className="tool-output" aria-live={playing ? 'off' : 'polite'}>
      <p className="lab-status-label">{name || 'Custom failure'}</p><h2>{labels[result.winner]}</h2>
      <div className="signal-pipeline" aria-label="Intermediate activation levels">{Object.entries(result.hidden).map(([key, value]) => <div key={key}><span>{key}</span><meter min={0} max={1} value={value} aria-label={`${key} activation`} /><strong>{value.toFixed(2)}</strong></div>)}</div>
      <h3>Illustrative likelihoods</h3><dl className="score-list">{Object.entries(result.probabilities).map(([key, value]) => <div key={key}><dt>{labels[key as keyof typeof labels]}</dt><dd><meter min={0} max={1} value={value} aria-label={labels[key as keyof typeof labels]} /><strong>{Math.round(value * 100)}%</strong></dd></div>)}</dl>
      <h3>Suggested next step</h3><p>{result.action}</p>
      <p className="lab-muted">Changing signals and playing examples uses no execution allowance.</p>
    </section>
  </div>;
}
