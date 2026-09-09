import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { RelationshipGraphAdapter } from '../../lib/graph/adapter.js';
import { GraphTraversalUtils } from '../../lib/graph/traversal-utils.js';
import { GraphContextProvider } from '../../lib/graph/context-provider.js';
import { GraphActionInterpreter } from '../../lib/graph/action-interpreter.js';
import { callLab, executionKey } from '../../lib/lab-client';
import { canExecute, message, type ToolProps } from './LabApp';

type GraphData = { nodes: any[]; links: any[]; nodeTypes: string[]; edgeTypes: string[]; meta: any; nodeById: Map<string, any>; edgeById: Map<string, any> };
const endpoint = (value: any) => String(value?.id || value);
export default function ContextGraph({ status, refresh, entityOnly = false }: ToolProps & { entityOnly?: boolean }) {
  const [dataset, setDataset] = useState<GraphData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [edgeHighlights, setEdgeHighlights] = useState<string[]>([]);
  const [assistantTypes, setAssistantTypes] = useState<string[] | null>(null);
  const [labels, setLabels] = useState(false);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const fitRef = useRef<(ids?: string[]) => void>(() => {});
  const request = useRef<{ signature: string; id: string } | null>(null);
  const pendingBody = useRef<any>(null);
  const retry = Boolean(request.current && pendingBody.current?.question === question.trim());
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    fetch('/lab-data/operational-context-graph.dataset.json', { signal: controller.signal }).then(res => { if (!res.ok) throw new Error('The graph dataset could not be loaded.'); return res.json(); }).then(raw => {
      const mapped = RelationshipGraphAdapter.mapOperationalContextDataset(raw);
      setDataset({ ...mapped, nodeById: new Map(mapped.nodes.map((node: any) => [node.id, node])), edgeById: new Map(mapped.links.map((link: any) => [link.id, link])) } as GraphData);
      setSelected(new URLSearchParams(location.search).get('entity') || '');
    }).catch(reason => { if (!controller.signal.aborted) setLoadError(message(reason)); });
    return () => controller.abort();
  }, [loadAttempt]);
  const visible = useMemo(() => dataset?.nodes.filter(node => (filter === 'all' || node.type === filter) && (!assistantTypes || assistantTypes.includes(node.type)) && (!query || `${node.label} ${node.type} ${node.id}`.toLowerCase().includes(query.toLowerCase()))) || [], [dataset, filter, query, assistantTypes]);
  const node = dataset?.nodeById.get(selected);
  const connections = dataset?.links.filter(link => endpoint(link.source) === selected || endpoint(link.target) === selected) || [];
  function select(id: string) { setSelected(id); const url = new URL(location.href); url.searchParams.set('entity', id); window.history.replaceState({}, '', url); }
  function reset() { setSelected(''); setQuery(''); setFilter('all'); setHighlights([]); setEdgeHighlights([]); setAssistantTypes(null); const url = new URL(location.href); url.searchParams.delete('entity'); window.history.replaceState({}, '', url); fitRef.current(); }

  useEffect(() => {
    if (!dataset || !svgRef.current || entityOnly) return;
    const svg = d3.select(svgRef.current); svg.selectAll('*').remove();
    const width = 1000, height = 650;
    const nodes = dataset.nodes.map(node => ({ ...node }));
    const links = dataset.links.map(link => ({ ...link }));
    const layer = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 5]).on('zoom', event => layer.attr('transform', event.transform));
    svg.call(zoom);
    const edges = layer.append('g').selectAll('line').data(links).join('line').attr('class', 'graph-edge').attr('data-edge', (d: any) => d.id);
    const groups = layer.append('g').selectAll<SVGGElement, any>('g').data(nodes).join('g').attr('class', 'graph-node').attr('data-id', (d: any) => d.id).attr('role', 'button').attr('tabindex', 0).attr('aria-label', (d: any) => `${d.label}, ${d.displayType}`).on('click', (_event, d: any) => select(d.id)).on('keydown', (event, d: any) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(d.id); } });
    groups.append('circle').attr('r', (d: any) => d.isSynthetic ? 5 : 7 + Math.min(8, d.connectionCount / 2)).attr('fill', (d: any) => `hsl(${d.accent})`);
    groups.append('text').attr('x', 15).attr('y', 4).text((d: any) => d.label);
    groups.append('title').text((d: any) => `${d.label} — ${d.displayType}`);
    const simulation = d3.forceSimulation<any>(nodes).force('link', d3.forceLink<any, any>(links).id(d => d.id).distance(65)).force('charge', d3.forceManyBody().strength(-140)).force('center', d3.forceCenter(width / 2, height / 2)).force('collision', d3.forceCollide(23));
    groups.call(d3.drag<SVGGElement, any>().on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; }).on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; }).on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
    const tick = () => { edges.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y).attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y); groups.attr('transform', (d: any) => `translate(${d.x},${d.y})`); };
    simulation.stop(); simulation.tick(160); tick();
    simulation.on('tick', tick);
    fitRef.current = (ids?: string[]) => {
      const fitted = ids?.length ? nodes.filter(node => ids.includes(node.id)) : nodes;
      if (!fitted.length) return;
      const x0 = d3.min(fitted, (d: any) => d.x) || 0, x1 = d3.max(fitted, (d: any) => d.x) || width;
      const y0 = d3.min(fitted, (d: any) => d.y) || 0, y1 = d3.max(fitted, (d: any) => d.y) || height;
      const scale = Math.min(2, 0.85 * Math.min(width / Math.max(80, x1 - x0), height / Math.max(80, y1 - y0)));
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
    };
    fitRef.current();
    return () => { simulation.stop(); svg.on('.zoom', null); svg.selectAll('*').remove(); };
  }, [dataset, entityOnly]);

  useEffect(() => {
    if (!svgRef.current || !dataset) return;
    const ids = new Set(visible.map(node => node.id));
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGGElement, any>('.graph-node').attr('display', d => ids.has(d.id) ? null : 'none').attr('aria-pressed', d => String(d.id === selected)).classed('is-selected', d => d.id === selected).classed('is-highlighted', d => highlights.includes(d.id));
    svg.selectAll('.graph-node text').attr('display', labels ? null : 'none');
    svg.selectAll<SVGLineElement, any>('.graph-edge').attr('display', d => ids.has(endpoint(d.source)) && ids.has(endpoint(d.target)) ? null : 'none').classed('is-highlighted', d => edgeHighlights.includes(d.id));
  }, [dataset, visible, selected, highlights, edgeHighlights, labels]);

  let appliedHighlights = highlights;
  const controller: any = {
    getDatasetContext: () => dataset,
    getStateSnapshot: () => ({ selectedNodeId: selected || null, manualFilterType: filter, assistantFilterTypes: assistantTypes, showLabels: labels }),
    refreshVisualState: () => {}, resetGraphState: reset, selectNode: select, focusNode: (id: string) => fitRef.current([id]),
    highlightNodes: (ids: string[]) => { appliedHighlights = ids; setHighlights(ids); }, highlightEdges: setEdgeHighlights, setAssistantNodeTypeFilter: setAssistantTypes,
    getHighlightedNodeIds: () => appliedHighlights, fitNodeIds: (ids: string[]) => fitRef.current(ids)
  };
  async function ask(event: { preventDefault(): void }) {
    event.preventDefault(); if (!dataset || busy || !question.trim() || (!retry && !canExecute(status))) return;
    setBusy(true); setError('');
    if (!pendingBody.current || pendingBody.current.question !== question.trim()) {
      pendingBody.current = { question: question.trim(), conversationHistory: history.slice(-8), graphContext: new GraphContextProvider(controller).buildQueryContext(question, history) };
    }
    const body = pendingBody.current;
    request.current = executionKey(request.current, body);
    try {
      const next = await callLab('operational-graph-assistant', { ...body, request_id: request.current.id });
      setResponse(next); setHistory([...history, { role: 'user', text: question }, { role: 'assistant', text: next.answer }].slice(-8));
      request.current = null; pendingBody.current = null; setQuestion('');
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); await refresh(); }
  }
  if (loadError) return <div role="alert" className="lab-error">{loadError} <button className="text-link" onClick={() => setLoadAttempt(value => value + 1)}>Retry loading graph</button></div>;
  if (!dataset) return <p role="status">Loading the operational context graph…</p>;
  return <div className="graph-workspace">
    <p className="lab-muted">Illustrative delivery dataset · {dataset.nodes.length} entities · {dataset.links.length} relationships. Exploring the graph is free.</p>
    {!entityOnly && <>
      <div className="graph-toolbar"><div><label htmlFor="graph-search">Find an entity</label><input id="graph-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, type, or ID" /></div><div><label htmlFor="graph-filter">Entity type</label><select id="graph-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All types</option>{dataset.nodeTypes.map(type => <option key={type}>{type}</option>)}</select></div><button className="button button-secondary" onClick={() => fitRef.current(visible.map(node => node.id))}>Fit view</button><button className="button button-secondary" aria-pressed={labels} onClick={() => setLabels(!labels)}>{labels ? 'Hide labels' : 'Show labels'}</button><button className="text-link" onClick={reset}>Reset</button></div>
      <div className="graph-stage"><svg ref={svgRef} viewBox="0 0 1000 650" aria-label="Interactive delivery relationship graph" /><span className="graph-hint">Drag to pan · Scroll to zoom · Select an entity</span></div>
      <details className="graph-entity-list"><summary>Browse entities as a list ({visible.length})</summary><div>{visible.map(node => <button key={node.id} className="entity-list-item" onClick={() => select(node.id)} aria-pressed={node.id === selected}><span>{node.label}</span><small>{node.displayType}</small></button>)}</div>{!visible.length && <p>No entities match. Clear your search or select another type.</p>}</details>
    </>}
    <div className="tool-workspace">
      <section className="tool-input" aria-label="Entity details">
        {node ? <><span className="lab-tag">{node.displayType}</span><h2>{node.label}</h2><p>{node.description || node.summary}</p><dl className="entity-facts">{Object.entries(node.attributes || {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl><div className="lab-actions">{entityOnly ? <a className="text-link" href={`/lab/context-graph?entity=${encodeURIComponent(node.id)}`} data-astro-reload>Open in graph →</a> : <a className="text-link" href={`/lab/context-graph/entity?entity=${encodeURIComponent(node.id)}`} data-astro-reload>Open entity record →</a>}<button className="text-link" onClick={() => { const neighbors = GraphTraversalUtils.collectNeighborhood(dataset, [node.id], 1); setHighlights(neighbors.nodeIds); setEdgeHighlights(neighbors.edgeIds); fitRef.current(neighbors.nodeIds); }}>Highlight neighbors</button></div><h3>Connected context</h3><ul className="connection-list">{connections.map(link => { const otherId = endpoint(link.source) === selected ? endpoint(link.target) : endpoint(link.source); return <li key={link.id}><span>{link.label}</span><button className="text-link" onClick={() => select(otherId)}>{dataset.nodeById.get(otherId)?.label || otherId} →</button></li>; })}</ul></> : <div className="tool-empty"><h2>{selected ? 'Entity not found.' : 'Select an entity.'}</h2><p>{selected ? 'This record is not in the demonstration dataset. Return to the graph to explore available entities.' : 'Inspect its attributes, trace connected records, and use that context in the assistant.'}</p>{entityOnly && <a href="/lab/context-graph" className="text-link" data-astro-reload>Back to graph →</a>}</div>}
      </section>
      <section className="tool-output"><h2>Ask with context.</h2><p>The assistant receives the graph, your selected entity, and recent conversation. Review its evidence before applying suggested graph actions.</p><form onSubmit={ask}><label htmlFor="graph-question">Your question</label><textarea id="graph-question" rows={3} required maxLength={4000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Which dependencies could affect this requirement?" /><button className="button button-primary" disabled={busy || !question.trim() || !canExecute(status)}>{busy ? 'Examining the graph…' : 'Ask assistant · 1 execution'}</button></form>{error && <p className="lab-error" role="alert">{error} Retrying the same question will reuse this request.</p>}<div>{error && request.current && <button className="text-link" disabled={!canExecute(status)} onClick={() => { request.current = null; pendingBody.current = null; setError(''); }}>Start a new execution instead</button>}</div><div aria-live="polite" aria-busy={busy}>{response && <><h3>Assistant response</h3><p className="preserve-lines">{response.answer}</p><div className="lab-actions">{response.referencedNodeIds?.map((id: string) => <button key={id} className="text-link" onClick={() => select(id)}>{dataset.nodeById.get(id)?.label || id}</button>)}</div>{response.actions?.length > 0 && <button className="button button-secondary" onClick={() => { const applied = new GraphActionInterpreter(controller).applyActions(response.actions); setResponse({ ...response, applied: [...applied.applied, ...applied.ignored].join(' ') }); }}>Apply suggested graph actions</button>}{response.applied && <p role="status">{response.applied}</p>}</>}</div></section>
    </div>
  </div>;
}
