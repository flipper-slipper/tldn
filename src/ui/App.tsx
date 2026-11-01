import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComputedView, ViewEdge, ViewNode, Views } from '../engine/types';
import type { Component, Model, Relationship } from '../model/schema';
import type { Host } from './host';

type Sel = { type: 'node' | 'edge'; id: string } | null;
interface CodeOpen { component: string; ref: number }
interface Notice { id: string; title: string; text: string }

const LEVEL = { context: 1, containers: 2, components: 3 } as const;
const LEVEL_NAME = ['', 'Context', 'Container', 'Component', 'Code'];
const KIND_LABEL: Record<string, string> = { person: 'Person', system: 'Software system', external: 'External system', container: 'Container', component: 'Component' };

export function MapApp({ host }: { host: Host }) {
  const [data, setData] = useState<Views | null>(null);
  const [empty, setEmpty] = useState<{ errors?: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewId, setViewId] = useState('context');
  const [sel, setSel] = useState<Sel>(null);
  const [code, setCode] = useState<CodeOpen | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const last = useRef('');

  const flash = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(null), 3500); }, []);
  useEffect(() => {
    const on = (e: Event) => flash((e as CustomEvent<string>).detail);
    window.addEventListener('vb-toast', on);
    return () => window.removeEventListener('vb-toast', on);
  }, [flash]);

  const load = useCallback(async (first = false) => {
    try {
      const r: any = await host.call('get_views');
      const key = JSON.stringify(r);
      if (key === last.current) return;
      last.current = key;
      if (r.empty) { setEmpty(r); setData(null); return; }
      setEmpty(null);
      setData(r);
      if (first && host.focus) {
        const target = r.views.find((v: ComputedView) => v.scope === host.focus || v.id === host.focus);
        if (target) setViewId(target.id);
      }
    } catch (e) { setError((e as Error).message); }
  }, [host]);

  useEffect(() => {
    load(true);
    const t = setInterval(() => { if (!document.hidden) load(); }, 3000);
    return () => clearInterval(t);
  }, [load]);

  const view = data?.views.find((v) => v.id === viewId) ?? data?.views[0];
  const model = data?.model;
  useEffect(() => { if (data && !data.views.some((v) => v.id === viewId)) setViewId('context'); }, [data, viewId]);

  const goView = (id: string) => { setViewId(id); setSel(null); setCode(null); setNotice(null); };
  const comp = code && model ? findComponent(model, code.component) : null;

  const crumbs = useMemo(() => {
    if (!model || !view) return [];
    const out: { label: string; go?: () => void }[] = [{ label: 'Context', go: () => goView('context') }];
    if (view.level !== 'context' || code) out.push({ label: model.system.name, go: () => goView('containers') });
    if (view.level === 'components') out.push({ label: model.containers.find((c) => c.id === view.scope)?.name ?? '', go: () => goView(view.id) });
    if (comp) out.push({ label: comp.component.name });
    return out;
  }, [model, view, comp]);

  if (error) return <div className="center"><div className="card"><h3>VibeBlocks could not load the map</h3><p>{error}</p></div></div>;
  if (empty) return <EmptyState errors={empty.errors} host={host} />;
  if (!data || !view || !model) return <div className="center muted">Loading map…</div>;

  const level = comp ? 4 : LEVEL[view.level];
  const zoomOut = () => {
    if (notice) return setNotice(null);
    if (code) return setCode(null);
    if (view.level === 'components') return goView('containers');
    if (view.level === 'containers') return goView('context');
  };
  const open = (n: ViewNode) => {
    if (n.zoomTo) return goView(n.zoomTo);
    if (n.kind === 'component') {
      const c = findComponent(model, n.id);
      if (c && c.component.code.length && n.status !== 'proposed') { setSel(null); return setCode({ component: n.id, ref: 0 }); }
      return setNotice({ id: n.id, title: n.status === 'proposed' ? `${n.name} is not built yet` : `No code linked to ${n.name}`, text: n.status === 'proposed' ? 'This component is part of the open proposal. Its code will exist once the agent implements the change.' : 'This component does not point at any code yet. Ask the agent to link it.' });
    }
    if (n.kind === 'external') return setNotice({ id: n.id, title: `No source code for ${n.name}`, text: `${n.name} is an external system, so there is no code for it in ${model.system.name}. You can ask the agent where ${model.system.name} talks to it.` });
    if (n.kind === 'person') return setNotice({ id: n.id, title: n.name, text: `${n.name} is a person who uses ${model.system.name}; there is no code behind them.` });
  };

  const ask = (text: string) => host.send(text);

  return (
    <div className="app">
      <header className="top">
        <div className="titles">
          <nav className="crumbs">{crumbs.map((c, i) => (
            <span key={i}>{i > 0 && <span className="sep">›</span>}{c.go && i < crumbs.length - 1 ? <button className="link" onClick={c.go}>{c.label}</button> : <span>{c.label}</span>}</span>
          ))}</nav>
          <h1>{comp ? comp.component.code[code!.ref]?.file : view.title}</h1>
        </div>
        <div className="right">
          <span className="chip">Level {level} of 4 · {LEVEL_NAME[level]}</span>
          {host.canExpand && <button className="btn sm" onClick={() => host.expand()}>⤢</button>}
        </div>
      </header>

      {data.proposal && <ProposalBar summary={data.proposal.summary} ask={ask} />}

      <div className="body">
        <main className="stage">
          {comp ? (
            <CodeView host={host} model={model} comp={comp} open={code!} setOpen={setCode} />
          ) : (
            <Diagram view={view} sel={sel} setSel={setSel} open={open} />
          )}
          {notice && (
            <div className="overlay"><div className="card">
              <h3>⚠ {notice.title}</h3><p>{notice.text}</p>
              <div className="row">
                <button className="btn dark" onClick={() => setNotice(null)}>Back to diagram</button>
                <button className="btn" onClick={() => ask(contextLine(model, notice.id) + ' Where does our code talk to it, and why?')}>Ask the agent</button>
              </div>
            </div></div>
          )}
          {(view.level !== 'context' || comp) && <button className="btn zoomout" onClick={zoomOut}>← Zoom out</button>}
          <div className="tip muted">{comp ? 'Code is read-only here: ask the agent to change it.' : 'Click to select · double-click (or the pill) to go one level deeper · dashed = proposed or external'}</div>
        </main>
        <Panel model={model} view={view} sel={sel} code={code} ask={ask} openCode={(id) => setCode({ component: id, ref: 0 })} />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- diagram

function Diagram({ view, sel, setSel, open }: { view: ComputedView; sel: Sel; setSel: (s: Sel) => void; open: (n: ViewNode) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [cam, setCam] = useState<{ x: number; y: number; s: number } | null>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const PAD = 40;

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = useCallback(() => {
    const b = view.bounds;
    const s = Math.min((size.w - PAD * 2) / b.w, (size.h - PAD * 2) / b.h, 0.9);
    const s2 = Math.max(s, 0.55);
    return { s: s2, x: (size.w - b.w * s2) / 2 - b.x * s2, y: s2 === s ? (size.h - b.h * s2) / 2 - b.y * s2 : PAD };
  }, [view.bounds, size]);
  useEffect(() => { setCam(fit()); }, [view.id, fit]);
  const c = cam ?? fit();

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = box.current!.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const s = Math.min(2, Math.max(0.2, c.s * Math.exp(-e.deltaY * 0.01)));
      setCam({ s, x: px - (px - c.x) * (s / c.s), y: py - (py - c.y) * (s / c.s) });
    } else setCam({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY });
  };
  const nodes = [...view.nodes].sort((a, b) => Number(b.frame) - Number(a.frame));
  const selNode = sel?.type === 'node' ? view.nodes.find((n) => n.id === sel.id) : undefined;
  const related = (e: ViewEdge) => sel && (sel.type === 'edge' ? sel.id === e.id : e.from === sel.id || e.to === sel.id);

  return (
    <div className="canvas" ref={box} onWheel={onWheel}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.node,.elabel,.pill')) return; drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true; setCam({ ...c, x: d.cx + e.clientX - d.x, y: d.cy + e.clientY - d.y }); }}
      onPointerUp={() => { if (drag.current && !drag.current.moved) setSel(null); drag.current = null; }}>
      <div className="world" style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${c.s})` }}>
        <svg className="edges" width={view.bounds.x + view.bounds.w + 50} height={view.bounds.y + view.bounds.h + 50}>
          <defs>
            {['n', 'p', 'h'].map((k) => (
              <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={`head ${k}`} />
              </marker>
            ))}
          </defs>
          {view.edges.map((e) => {
            const hl = related(e);
            const m = e.status === 'proposed' ? 'p' : hl ? 'h' : 'n';
            return (
              <g key={e.id} className={`edge ${e.status ?? ''} ${e.kind === 'external' ? 'ext' : ''} ${hl ? 'hl' : ''} ${sel && !hl ? 'dim' : ''}`}>
                <path d={pathOf(e.points)} markerEnd={`url(#arrow-${m})`} />
                <path d={pathOf(e.points)} className="hit" onClick={(ev) => { ev.stopPropagation(); setSel({ type: 'edge', id: e.id }); }} />
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div key={n.id}
            className={`node k-${n.kind} ${n.frame ? 'frame' : ''} ${n.stub ? 'stub' : ''} ${n.status ? `st-${n.status}` : ''} ${sel?.id === n.id ? 'sel' : ''} ${n.zoomTo || n.kind === 'component' ? 'drill' : ''}`}
            style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
            onClick={(e) => { e.stopPropagation(); setSel({ type: 'node', id: n.id }); }}
            onDoubleClick={(e) => { e.stopPropagation(); open(n); }}>
            {n.status && <span className={`badge ${n.status}`}>{n.status === 'proposed' ? '+ new' : n.status === 'changed' ? 'will change' : 'will be removed'}</span>}
            {n.frame ? (
              <div className="frame-label">{n.name} <small>[{KIND_LABEL[n.kind]}{n.technology ? `: ${n.technology}` : ''}]</small></div>
            ) : (
              <>
                <div className="name">{n.name}</div>
                <div className="meta">[{metaOf(n)}]</div>
                {n.description && <div className="desc">{n.description}</div>}
              </>
            )}
          </div>
        ))}
        {view.edges.map((e) => e.labelBox && (
          <div key={e.id} className={`elabel ${e.status ?? ''} ${sel && !related(e) ? 'dim' : ''}`} onClick={() => setSel({ type: 'edge', id: e.id })}
            style={{ left: e.labelBox.x - 8, top: e.labelBox.y, width: e.labelBox.w + 16 }}>
            <span>{e.label}</span>{e.technology && <small>[{e.technology}]</small>}
          </div>
        ))}
        {selNode && !selNode.frame && (selNode.zoomTo || selNode.kind !== 'person') && (
          <button className="pill" style={{ left: selNode.x + selNode.w / 2, top: selNode.y + selNode.h + 14 }} onClick={() => open(selNode)}>
            {selNode.zoomTo ? '↗ Zoom in' : selNode.kind === 'component' ? '‹/› Open code' : 'ⓘ Details'}
          </button>
        )}
      </div>
    </div>
  );
}

function pathOf(p: [number, number][]): string {
  if (!p.length) return '';
  if ((p.length - 1) % 3 === 0) {
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 1; i < p.length; i += 3) d += ` C${p[i][0]},${p[i][1]} ${p[i + 1][0]},${p[i + 1][1]} ${p[i + 2][0]},${p[i + 2][1]}`;
    return d;
  }
  return 'M' + p.map(([x, y]) => `${x},${y}`).join(' L');
}

function metaOf(n: ViewNode): string {
  if (n.kind === 'container') return `Container${n.containerType ? ` · ${n.containerType}` : ''}${n.technology ? `: ${n.technology}` : ''}`;
  return `${KIND_LABEL[n.kind]}${n.technology ? `: ${n.technology}` : ''}`;
}

// ---------------------------------------------------------------- side panel

function Panel({ model, view, sel, code, ask, openCode }: { model: Model; view: ComputedView; sel: Sel; code: CodeOpen | null; ask: (t: string) => void; openCode: (id: string) => void }) {
  const [q, setQ] = useState('');
  const node = sel?.type === 'node' ? view.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.type === 'edge' ? view.edges.find((e) => e.id === sel.id) : undefined;
  const focusId = node?.id ?? code?.component ?? null;
  const subject = focusId ? contextLine(model, focusId) : edge ? `[VibeBlocks] The arrow ${nameOf(model, edge.from)} → ${nameOf(model, edge.to)} ("${edge.label}").` : `[VibeBlocks] About the ${view.title} diagram of ${model.system.name}.`;
  const send = (t: string) => { ask(`${subject} ${t}`); setQ(''); };

  return (
    <aside className="panel">
      {node ? <NodeDetails model={model} n={node} openCode={openCode} />
        : edge ? <EdgeDetails model={model} e={edge} />
        : code ? <NodeDetails model={model} n={{ id: code.component } as ViewNode} openCode={openCode} />
        : <Overview model={model} view={view} />}
      <div className="ask">
        <div className="presets">
          {(node || code) && <button className="btn sm" onClick={() => send('Why is this here, and how does it affect the rest of the system?')}>Why is this here?</button>}
          {(node || code) && <button className="btn sm" onClick={() => send('Explain how it works, step by step.')}>Explain</button>}
          {edge && <button className="btn sm" onClick={() => send('What exactly travels over this, and where in the code?')}>What travels here?</button>}
          {!node && !edge && !code && <button className="btn sm" onClick={() => send('Explain this repo at this level.')}>Explain this repo</button>}
        </div>
        <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder={node ? `Ask or tell the agent about ${node.name}…` : 'Ask the agent…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && q.trim()) { e.preventDefault(); send(q.trim()); } }} />
        <button className="btn dark" disabled={!q.trim()} onClick={() => send(q.trim())}>Send to chat</button>
      </div>
    </aside>
  );
}

function NodeDetails({ model, n, openCode }: { model: Model; n: ViewNode; openCode: (id: string) => void }) {
  const found = findAny(model, n.id);
  if (!found) return null;
  const el: any = found.el;
  const ids = new Set([n.id, ...(found.kind === 'container' ? el.components.map((k: Component) => k.id) : []), ...(found.kind === 'system' ? model.containers.flatMap((c) => [c.id, ...c.components.map((k) => k.id)]) : [])]);
  const out = model.relationships.filter((r) => ids.has(r.from) && !ids.has(r.to));
  const inn = model.relationships.filter((r) => ids.has(r.to) && !ids.has(r.from));
  return (
    <div className="details">
      <div className="kind">{KIND_LABEL[found.kind]}{el.type ? ` · ${el.type}` : ''}{el.technology ? ` · ${el.technology}` : ''}</div>
      <h2>{el.name}</h2>
      {n.status && <div className={`badge inline ${n.status}`}>{n.status === 'proposed' ? 'proposed, not built yet' : n.status === 'changed' ? 'changes in the proposal' : 'removed by the proposal'}</div>}
      <p>{el.description || <span className="muted">No description.</span>}</p>
      {found.kind === 'component' && (
        <>
          <h4>Code</h4>
          {el.code.length ? el.code.map((r: any, i: number) => <div key={i}><button className="link mono" onClick={() => openCode(n.id)}>{r.file}{r.symbol ? ` · ${r.symbol}` : ''}</button></div>) : <p className="muted">No code linked.</p>}
        </>
      )}
      {found.kind === 'container' && el.components.length > 0 && <><h4>Components</h4><ul>{el.components.map((k: Component) => <li key={k.id}>{k.name}</li>)}</ul></>}
      {(out.length > 0 || inn.length > 0) && <h4>Arrows</h4>}
      {out.map((r, i) => <RelLine key={'o' + i} model={model} r={r} dir="out" />)}
      {inn.map((r, i) => <RelLine key={'i' + i} model={model} r={r} dir="in" />)}
    </div>
  );
}

function EdgeDetails({ model, e }: { model: Model; e: ViewEdge }) {
  return (
    <div className="details">
      <div className="kind">Arrow{e.kind ? ` · ${e.kind}` : ''}{e.relations.length > 1 ? ` · ${e.relations.length} relationships` : ''}</div>
      <h2>{e.label}</h2>
      <p>{nameOf(model, e.from)} → {nameOf(model, e.to)}</p>
      <h4>What it stands for</h4>
      {e.relations.map((r, i) => <RelLine key={i} model={model} r={r} dir="out" full />)}
    </div>
  );
}

function RelLine({ model, r, dir, full }: { model: Model; r: Relationship; dir: 'in' | 'out'; full?: boolean }) {
  return (
    <div className="rel">
      <span className={`kdot k-${r.kind}`} />
      {full ? <><b>{nameOf(model, r.from)}</b> → <b>{nameOf(model, r.to)}</b>: </> : dir === 'out' ? <>→ <b>{nameOf(model, r.to)}</b>: </> : <>← <b>{nameOf(model, r.from)}</b>: </>}
      {r.description}{r.technology && <span className="muted"> [{r.technology}]</span>}
      {full && r.evidence?.length ? <div className="mono muted">{r.evidence.map((x) => `${x.file}${x.symbol ? ` · ${x.symbol}` : ''}`).join(', ')}</div> : null}
    </div>
  );
}

function Overview({ model, view }: { model: Model; view: ComputedView }) {
  return (
    <div className="details">
      <div className="kind">{view.level === 'context' ? 'System context' : view.level === 'containers' ? 'Containers' : 'Components'}</div>
      <h2>{model.system.name}</h2>
      <p>{model.system.description}</p>
      <h4>Reading the map</h4>
      <ul className="legend">
        <li><span className="lg box" /> part of {model.system.name}</li>
        <li><span className="lg box ext" /> external system (no code here)</li>
        <li><span className="lg box prop" /> proposed, not built yet</li>
        <li><span className="lg line" /> arrow: who talks to whom, about what</li>
      </ul>
      <p className="muted">Select a box or arrow to see what it does. Questions go to your agent’s chat.</p>
    </div>
  );
}

// ---------------------------------------------------------------- code level

function CodeView({ host, model, comp, open, setOpen }: { host: Host; model: Model; comp: { component: Component; container: string }; open: CodeOpen; setOpen: (c: CodeOpen) => void }) {
  const ref = comp.component.code[open.ref];
  const [src, setSrc] = useState<{ text: string; start?: number; end?: number; error?: string } | null>(null);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSrc(null);
    host.call('read_code', { file: ref.file, symbol: ref.symbol }).then(setSrc, (e) => setSrc({ text: '', error: String(e.message ?? e) }));
  }, [host, ref.file, ref.symbol]);
  useEffect(() => { first.current?.scrollIntoView({ block: 'center' }); }, [src]);
  const siblings = model.containers.find((c) => c.id === comp.container)?.components ?? [];
  const rels = model.relationships.filter((r) => r.from === comp.component.id || r.to === comp.component.id);
  return (
    <div className="codelevel">
      <div className="mini">
        <div className="minititle">Diagram</div>
        {siblings.map((k) => (
          <button key={k.id} className={`minibox ${k.id === comp.component.id ? 'on' : ''}`} disabled={!k.code.length} onClick={() => setOpen({ component: k.id, ref: 0 })}>
            <b>{k.name}</b>{k.id === comp.component.id && <small>{ref.file} · selected</small>}
          </button>
        ))}
        {rels.length > 0 && <div className="minititle">Talks to</div>}
        {rels.map((r, i) => <div key={i} className="minirel">{r.from === comp.component.id ? `→ ${nameOf(model, r.to)}` : `← ${nameOf(model, r.from)}`}<small>{r.description}</small></div>)}
      </div>
      <div className="code">
        <div className="tabs">{comp.component.code.map((r, i) => (
          <button key={i} className={`tab ${i === open.ref ? 'on' : ''}`} onClick={() => setOpen({ component: comp.component.id, ref: i })}>{r.file.split('/').pop()}{r.symbol ? ` · ${r.symbol}` : ''}</button>
        ))}</div>
        <div className="lines">
          {!src ? <div className="muted pad">Loading…</div> : src.error ? <div className="pad">{src.error}</div> : src.text.split('\n').map((l, i) => {
            const n = i + 1, hl = src.start && src.end && n >= src.start && n <= src.end;
            return <div key={i} ref={n === src.start ? first : undefined} className={`ln ${hl ? 'hl' : ''}`}><span className="no">{n}</span><span className="tx">{l || ' '}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- bits

function ProposalBar({ summary, ask }: { summary: string; ask: (t: string) => void }) {
  const [modify, setModify] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="proposal">
      <div className="ptext"><b>Proposed plan:</b> {summary} <span className="muted">· dashed = proposed, nothing changed yet</span></div>
      {modify ? (
        <div className="row">
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What should change in the plan?" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { ask(`[VibeBlocks] Modify the proposal "${summary}": ${text.trim()} Update it with propose_change.`); setModify(false); setText(''); } }} />
          <button className="btn sm" onClick={() => setModify(false)}>Cancel</button>
        </div>
      ) : (
        <div className="row">
          <button className="btn dark" onClick={() => ask(`[VibeBlocks] I approve the proposal "${summary}". Implement it, run the tests, then call apply_proposal and show_map.`)}>Approve</button>
          <button className="btn" onClick={() => setModify(true)}>Modify</button>
          <button className="btn" onClick={() => ask(`[VibeBlocks] I reject the proposal "${summary}". Call discard_proposal and do not change the code.`)}>Reject</button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ errors, host }: { errors?: any[]; host: Host }) {
  return (
    <div className="center"><div className="card">
      {errors?.length ? (
        <><h3>The model has errors</h3><ul>{errors.map((e, i) => <li key={i}><code>{e.path}</code> {e.message}</li>)}</ul>
          <button className="btn dark" onClick={() => host.send('[VibeBlocks] The architecture model has errors. Call get_model and fix them with update_model.')}>Ask the agent to fix it</button></>
      ) : (
        <><h3>No map yet</h3><p>This project has no VibeBlocks model.</p>
          <button className="btn dark" onClick={() => host.send('[VibeBlocks] Map this project: call get_guide, read the code, then build the C4 model with update_model and show_map.')}>Ask the agent to map it</button></>
      )}
    </div></div>
  );
}

function findComponent(m: Model, id: string) {
  for (const c of m.containers) { const k = c.components.find((x) => x.id === id); if (k) return { component: k, container: c.id }; }
  return null;
}
function findAny(m: Model, id: string): { kind: string; el: any } | null {
  if (m.system.id === id) return { kind: 'system', el: m.system };
  const p = m.people.find((x) => x.id === id); if (p) return { kind: 'person', el: p };
  const x = m.externals.find((y) => y.id === id); if (x) return { kind: 'external', el: x };
  for (const c of m.containers) {
    if (c.id === id) return { kind: 'container', el: c };
    const k = c.components.find((y) => y.id === id); if (k) return { kind: 'component', el: k };
  }
  return null;
}
function nameOf(m: Model, id: string) { return findAny(m, id)?.el.name ?? id; }
function contextLine(m: Model, id: string) {
  const f = findAny(m, id);
  if (!f) return '[VibeBlocks]';
  const c = f.kind === 'component' ? m.containers.find((x) => x.components.some((k) => k.id === id)) : null;
  const code = f.kind === 'component' && f.el.code.length ? `, code: ${f.el.code.map((r: any) => `${r.file}${r.symbol ? ` ${r.symbol}` : ''}`).join(', ')}` : '';
  return `[VibeBlocks] ${KIND_LABEL[f.kind]} "${f.el.name}" (id ${id}${c ? `, in ${c.name}` : ''}${code}).`;
}
