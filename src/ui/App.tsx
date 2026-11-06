import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComputedView, ViewEdge, ViewNode, Views } from '../engine/types';
import type { Component, Model, Relationship } from '../model/schema';
import type { Host } from './host';
import { helpFor } from '../help';

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
  const [help, setHelp] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  // the side panel's width (or height, when it sits under the map), dragged from its edge
  const [panelSize, setPanelSizeState] = useState<number | null>(() => { try { return Number(localStorage.getItem('vb-panel')) || null; } catch { return null; } });
  const setPanelSize = (n: number) => { setPanelSizeState(n); try { localStorage.setItem('vb-panel', String(Math.round(n))); } catch { /* private window */ } };
  const stacked = () => matchMedia('(max-width: 1100px)').matches;
  const resize = useRef<{ start: number; size: number; stacked: boolean } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [mode, setModeState] = useState<Mode>(() => { try { return localStorage.getItem('vb-mode') === 'zoom' ? 'zoom' : 'click'; } catch { return 'click'; } });
  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem('vb-mode', m); } catch { /* private window */ } };
  const last = useRef('');
  const pinch = useRef(0);
  // after any level change, ignore the rest of that pinch: one pinch moves one level
  const settle = useRef(0);
  const settling = () => {
    if (Date.now() >= settle.current) return false;
    settle.current = Math.max(settle.current, Date.now() + 300); // still pinching: keep waiting for the fingers to stop
    return true;
  };
  useEffect(() => { settle.current = Date.now() + 600; pinch.current = 0; }, [viewId, code]);

  // A pinch arrives as ctrl+wheel; without this the browser zooms the whole page instead of the map.
  useEffect(() => {
    const stop = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    window.addEventListener('wheel', stop, { passive: false });
    return () => window.removeEventListener('wheel', stop);
  }, []);

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

  // Fetch every component's code in the background once the map is here, so going down to the code
  // level is instant instead of waiting on a round trip through the host.
  useEffect(() => {
    if (!data) return;
    const refs = data.model.containers.flatMap((c) => c.components.flatMap((k) => k.code));
    let stop = false;
    (async () => {
      for (const r of refs) {
        if (stop) return;
        const key = codeKey(r.file, r.symbol);
        if (!codeCache.has(key)) await host.call('read_code', { file: r.file, symbol: r.symbol }).then((x) => codeCache.set(key, x), () => {});
      }
    })();
    return () => { stop = true; };
  }, [data, host]);

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
  if (help) return <Help host={host} close={() => setHelp(false)} />;
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
  // In the browser tab, questions go to the map's own chat instead of the host's.
  const askChat = async (text: string) => {
    if (!host.chat || chatBusy) return;
    setChatBusy(true);
    setChat((m) => [...m, { who: 'you', text: text.replace(/^\[VibeBlocks\]\s*/, '') }, { who: 'claude', text: '' }]);
    const add = (t: string) => setChat((m) => [...m.slice(0, -1), { ...m[m.length - 1], text: m[m.length - 1].text + t }]);
    const note = (t: string) => setChat((m) => [...m.slice(0, -1), { ...m[m.length - 1], note: t }]);
    try { await host.chat(text, add, note); }
    catch (e) { setChat((m) => [...m.slice(0, -1), { who: 'claude', text: m[m.length - 1].text, error: (e as Error).message }]); }
    finally { setChatBusy(false); }
  };
  const asker = host.canAsk ? ask : host.chat ? askChat : null;
  // pinching out on the code goes back up to the diagram
  const pinchOutOfCode = (e: React.WheelEvent) => {
    if (mode !== 'zoom' || !e.ctrlKey || e.deltaY <= 0 || settling()) { pinch.current = 0; return; }
    pinch.current += e.deltaY;
    if (pinch.current > 120) { pinch.current = 0; zoomOut(); }
  };

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
          <div className="seg" role="group" aria-label="What scrolling does">
            <button className={mode === 'click' ? 'on' : ''} title="Scroll moves the map; click or double-click to change level" onClick={() => setMode('click')}>Click</button>
            <button className={mode === 'zoom' ? 'on' : ''} title="Scroll zooms, and keeps going into a box or back out of a level" onClick={() => setMode('zoom')}>Zoom</button>
          </div>
          {host.openInBrowser && <button className="btn sm" onClick={() => host.openInBrowser!()}>Open in browser</button>}
          {host.canExpand && <button className="btn sm" title="Bigger" onClick={() => host.expand()}>⤢</button>}
          <button className="btn sm" title="How to use the map" onClick={() => setHelp(true)}>?</button>
        </div>
      </header>

      {data.proposal && <ProposalBar summary={data.proposal.summary} ask={asker} />}

      <div className="body">
        <main className="stage" onWheel={comp ? pinchOutOfCode : undefined}>
          {comp ? (
            <CodeView host={host} model={model} comp={comp} open={code!} setOpen={setCode} />
          ) : (
            <Diagram view={view} mode={mode} sel={sel} setSel={setSel} open={open} up={view.level !== 'context' ? zoomOut : undefined} settling={settling} />
          )}
          {notice && (
            <div className="overlay"><div className="card">
              <h3>⚠ {notice.title}</h3><p>{notice.text}</p>
              <div className="row">
                <button className="btn dark" onClick={() => setNotice(null)}>Back to diagram</button>
                {asker && <button className="btn" onClick={() => { asker(contextLine(model, notice.id) + ' Where does our code talk to it, and why?'); setNotice(null); }}>Ask the agent</button>}
              </div>
            </div></div>
          )}
          {(view.level !== 'context' || comp) && <button className="btn zoomout" onClick={zoomOut}>← Zoom out</button>}
          <div className="tip muted">{comp ? (host.canAsk ? 'Code is read-only here: ask the agent to change it.' : 'Code is read-only here: ask Claude to change it.') : mode === 'zoom' ? 'Scroll to zoom · keep zooming into a box to open it, or out to go up · dashed = proposed or external · ? for help' : 'Click to select · double-click (or the pill) to go one level deeper · scroll to move, pinch to zoom · ? for help'}</div>
        </main>
        <div className="splitter" title="Drag to resize"
          onPointerDown={(e) => {
            const panel = (e.currentTarget.nextElementSibling as HTMLElement).getBoundingClientRect();
            const st = stacked();
            resize.current = { start: st ? e.clientY : e.clientX, size: st ? panel.height : panel.width, stacked: st };
            e.currentTarget.setPointerCapture(e.pointerId);
            document.body.classList.add('resizing');
          }}
          onPointerMove={(e) => {
            const r = resize.current;
            if (!r) return;
            const max = (r.stacked ? window.innerHeight : window.innerWidth) * 0.75;
            setPanelSize(Math.max(r.stacked ? 140 : 240, Math.min(max, r.size + r.start - (r.stacked ? e.clientY : e.clientX))));
          }}
          onPointerUp={() => { resize.current = null; document.body.classList.remove('resizing'); }}
          onDoubleClick={() => { setPanelSizeState(null); try { localStorage.removeItem('vb-panel'); } catch { /* private window */ } }} />
        <Panel size={panelSize} model={model} view={view} sel={sel} code={code} ask={asker} chat={host.chat ? { msgs: chat, busy: chatBusy, clear: () => setChat([]) } : null} openCode={(id) => setCode({ component: id, ref: 0 })} />
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- diagram

type Cam = { x: number; y: number; s: number };

function Diagram({ view, mode, sel, setSel, open, up, settling }: { view: ComputedView; mode: Mode; sel: Sel; setSel: (s: Sel) => void; open: (n: ViewNode) => void; up?: () => void; settling: () => boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  // Scrolling, pinching and dragging move the camera directly, like any canvas app: trackpads already
  // send smooth input, and easing on top of it makes the map lag and swing. Only a level change
  // animates, in JS (a CSS transition on the scale would blur the text while it runs).
  const [cam, setCamState] = useState<Cam | null>(null);
  const now = useRef<Cam | null>(null);
  const raf = useRef(0);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  // "keep going": at the edge of a level the map holds still and the box lights up as you keep scrolling
  const push = useRef<{ dir: 'in' | 'out'; amt: number; id?: string } | null>(null);
  const pushT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [gauge, setGauge] = useState<{ p: number; dir: 'in' | 'out'; label: string; id?: string } | null>(null);
  // where the next level comes from: it grows out of the point you went in at, or shrinks back when you go up
  const enter = useRef<{ x: number; y: number } | null>(null);
  const prevLevel = useRef(LEVEL[view.level]);
  const PAD = 40;

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);
  const fit = useCallback(() => {
    const b = view.bounds;
    const s = Math.min((size.w - PAD * 2) / b.w, (size.h - PAD * 2) / b.h, 0.9);
    const s2 = Math.max(s, size.w < 900 ? 0.55 : 0.35); // narrow panes keep text readable and pan instead
    return { s: s2, x: (size.w - b.w * s2) / 2 - b.x * s2, y: s2 === s ? (size.h - b.h * s2) / 2 - b.y * s2 : PAD };
  }, [view.bounds, size]);

  const jump = (t: Cam) => { cancelAnimationFrame(raf.current); raf.current = 0; now.current = t; setCamState(t); };
  /** One smooth move from `a` to `b`: scale changes evenly (geometrically) while the point at the
   *  middle of the map travels in a straight line, so nothing swings sideways on the way. */
  const animate = (a: Cam, b: Cam, ms = 300) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return jump(b);
    jump(a);
    const W = size.w / 2, H = size.h / 2;
    const ca = { x: (W - a.x) / a.s, y: (H - a.y) / a.s }, cb = { x: (W - b.x) / b.s, y: (H - b.y) / b.s };
    const t0 = performance.now();
    const frame = (t: number) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); // ease-out
      const sc = a.s * Math.pow(b.s / a.s, e), cx = ca.x + (cb.x - ca.x) * e, cy = ca.y + (cb.y - ca.y) * e;
      now.current = p < 1 ? { s: sc, x: W - cx * sc, y: H - cy * sc } : b;
      setCamState(now.current);
      raf.current = p < 1 ? requestAnimationFrame(frame) : 0;
    };
    raf.current = requestAnimationFrame(frame);
  };

  // a new level: start zoomed around where you came from, then glide to the fitted view
  useEffect(() => {
    const f = fit(), lv = LEVEL[view.level];
    if (lv !== prevLevel.current && now.current) {
      const at = enter.current ?? { x: size.w / 2, y: size.h / 2 };
      const s0 = f.s * (lv > prevLevel.current ? 0.55 : 1.7);
      animate({ s: s0, x: at.x - (at.x - f.x) * (s0 / f.s), y: at.y - (at.y - f.y) * (s0 / f.s) }, f);
    } else jump(f);
    prevLevel.current = lv;
    enter.current = null;
    push.current = null;
    setGauge(null);
  }, [view.id, fit]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = cam ?? fit();
  const g = now.current ?? c;

  const toScreen = (n: ViewNode) => ({ x: c.x + (n.x + n.w / 2) * c.s, y: c.y + (n.y + n.h / 2) * c.s });
  const openAt = (n: ViewNode, at?: { x: number; y: number }) => { enter.current = at ?? toScreen(n); open(n); };
  const zoomCam = (s: number, px: number, py: number) => jump({ s, x: px - (px - g.x) * (s / g.s), y: py - (py - g.y) * (s / g.s) });

  /** Build up the gauge; true once it is full. Stopping, or turning back, empties it. */
  const charge = (dir: 'in' | 'out', amount: number, label: string, id?: string) => {
    const p0 = push.current && push.current.dir === dir && push.current.id === id ? push.current.amt : 0;
    const amt = p0 + amount;
    clearTimeout(pushT.current);
    if (amt >= PUSH_NEEDED) { push.current = null; setGauge(null); return true; }
    push.current = { dir, amt, id };
    setGauge({ p: amt / PUSH_NEEDED, dir, label, id });
    pushT.current = setTimeout(() => { push.current = null; setGauge(null); }, 450);
    return false;
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    // Click mode: scrolling moves the map, pinching zooms it; neither ever changes the level.
    if (mode === 'click') {
      if (!e.ctrlKey) return jump({ ...g, x: g.x - e.deltaX, y: g.y - e.deltaY });
      const dy = Math.max(-60, Math.min(60, e.deltaY)) * 0.01;
      return zoomCam(Math.min(MAX_ZOOM, Math.max(0.15, g.s * Math.exp(-dy))), px, py);
    }
    // Zoom mode: two-finger scroll (or a mouse wheel, or a pinch) zooms where the pointer is. Only a
    // clearly sideways scroll pans: a trackpad's small sideways drift must not interleave pans with zooms.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 2 && !e.ctrlKey) return jump({ ...g, x: g.x - e.deltaX });
    if (settling()) return; // the rest of the gesture that just changed level
    // a pinch sends small deltas, a scroll larger ones (a mouse wheel ~100 a notch)
    const dy = Math.max(-60, Math.min(60, e.deltaY)) * (e.ctrlKey ? 0.01 : 0.004);
    let s = Math.min(MAX_ZOOM, Math.max(0.15, g.s * Math.exp(-dy)));
    // Zoom into a box until it nearly fills the map, then keep going: it opens. Same going up.
    if (dy < 0) {
      const wx = (px - g.x) / g.s, wy = (py - g.y) / g.s;
      const n = view.nodes.find((k) => !k.frame && canDrill(k) && wx >= k.x && wx <= k.x + k.w && wy >= k.y && wy <= k.y + k.h);
      // ...and only after zooming in a fair way, even where a box already fills a small pane
      if (n && s >= fit().s * MIN_ZOOM_IN && (n.w * s > size.w * DRILL_FILL || n.h * s > size.h * DRILL_FILL || s >= MAX_ZOOM)) {
        if (charge('in', -dy, n.zoomTo ? `Keep zooming to open ${n.name}` : `Keep zooming for ${n.name}'s code`, n.id)) return openAt(n, { x: px, y: py });
        s = Math.min(MAX_ZOOM, g.s * Math.exp(-dy * 0.12)); // rubber band: it gives a little, not a lot
      } else if (push.current) { push.current = null; setGauge(null); }
    } else if (up && s < fit().s * UP_FIT) {
      if (charge('out', dy, 'Keep zooming out to go up a level')) { enter.current = { x: px, y: py }; return up(); }
      s = Math.max(0.15, g.s * Math.exp(-dy * 0.12));
    } else if (push.current) { push.current = null; setGauge(null); }
    zoomCam(s, px, py);
  };
  const nodes = [...view.nodes].sort((a, b) => Number(b.frame) - Number(a.frame));
  const lines = useMemo(() => straightEdges(view), [view]);
  const selNode = sel?.type === 'node' ? view.nodes.find((n) => n.id === sel.id) : undefined;
  const related = (e: ViewEdge) => sel && (sel.type === 'edge' ? sel.id === e.id : e.from === sel.id || e.to === sel.id);

  return (
    <div className="canvas" ref={box} onWheel={onWheel}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.node,.elabel,.pill')) return; drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true; jump({ ...c, x: d.cx + e.clientX - d.x, y: d.cy + e.clientY - d.y }); }}
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
                <path d={lines.get(e.id)?.d ?? pathOf(e.points)} markerEnd={`url(#arrow-${m})`} />
                <path d={lines.get(e.id)?.d ?? pathOf(e.points)} className="hit" style={{ strokeWidth: Math.max(18, 14 / c.s) }} onClick={(ev) => { ev.stopPropagation(); setSel({ type: 'edge', id: e.id }); }} />
              </g>
            );
          })}
        </svg>
        {nodes.map((n) => (
          <div key={n.id}
            className={`node k-${n.kind} ${n.frame ? 'frame' : ''} ${n.stub ? 'stub' : ''} ${n.status ? `st-${n.status}` : ''} ${sel?.id === n.id ? 'sel' : ''} ${n.zoomTo || n.kind === 'component' ? 'drill' : ''} ${gauge?.id === n.id ? 'opening' : ''}`}
            style={{ left: n.x, top: n.y, width: n.w, height: n.h, ...(gauge?.id === n.id ? { '--p': gauge.p } as React.CSSProperties : {}) }}
            onClick={(e) => { e.stopPropagation(); setSel({ type: 'node', id: n.id }); }}
            onDoubleClick={(e) => { e.stopPropagation(); openAt(n); }}>
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
        {view.edges.map((e) => {
          const at = lines.get(e.id)?.mid ?? (e.labelBox && { x: e.labelBox.x + e.labelBox.w / 2, y: e.labelBox.y + e.labelBox.h / 2 });
          // zoomed far out, labels are unreadable clutter (and, scaled up, cover boxes): show only the
          // selected arrow's, at a readable size; the panel lists a selected box's arrows anyway
          if (!at || (c.s < LABELS_MIN_ZOOM && !(sel?.type === 'edge' && sel.id === e.id))) return null;
          return (
            <div key={e.id} className={`elabel ${e.status ?? ''} ${sel && !related(e) ? 'dim' : ''}`} onClick={() => setSel({ type: 'edge', id: e.id })}
              title={e.label} style={{ left: at.x, top: at.y, transform: `translate(-50%, -50%) scale(${Math.max(1, 0.85 / c.s)})` }}>
              <span>{short(e.label, 64)}</span>{e.technology && <small>[{short(e.technology, 40)}]</small>}
            </div>
          );
        })}
        {selNode && !selNode.frame && (selNode.zoomTo || selNode.kind !== 'person') && (
          <button className="pill" style={{ left: selNode.x + selNode.w / 2, top: selNode.y + selNode.h + 14 }} onClick={() => openAt(selNode)}>
            {selNode.zoomTo ? '↗ Zoom in' : selNode.kind === 'component' ? '‹/› Open code' : 'ⓘ Details'}
          </button>
        )}
      </div>
      {gauge && <div className="hint" style={{ opacity: 0.5 + gauge.p / 2 }}>{gauge.label}</div>}
    </div>
  );
}

type Mode = 'click' | 'zoom';
/** zooming into a box starts opening it once it covers this share of the map's width or height */
const DRILL_FILL = 0.85;
/** zooming out below this share of the fitted size starts going up a level */
const UP_FIT = 0.45;
/** how much more zooming (past those points) it takes to actually change level */
const PUSH_NEEDED = 0.55;
const MAX_ZOOM = 4;
/** zoom in at least this far past the fitted size before a box can start opening */
const MIN_ZOOM_IN = 1.6;
/** boxes a pinch can open: ones with a level below, and components with code (not proposed ones) */
const canDrill = (n: ViewNode) => !!n.zoomTo || (n.kind === 'component' && n.code > 0 && n.status !== 'proposed');

/** below this zoom, an arrow's label shows only when that arrow is selected */
const LABELS_MIN_ZOOM = 0.6;

const short = (t: string, max: number) => (t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t);

/** Straight arrows from box edge to box edge (the layout's curves wander), and where each label
 *  sits. Arrows between the same two boxes are spread apart so they don't overlap. */
function straightEdges(view: ComputedView): Map<string, { d: string; mid: { x: number; y: number } }> {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const pairs = new Map<string, ViewEdge[]>();
  for (const e of view.edges) pairs.set(pairKey(e.from, e.to), [...(pairs.get(pairKey(e.from, e.to)) ?? []), e]);
  const out = new Map<string, { d: string; mid: { x: number; y: number } }>();
  for (const e of view.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const nx = -(cb.y - ca.y) / len, ny = (cb.x - ca.x) / len; // unit normal
    const group = pairs.get(pairKey(e.from, e.to))!;
    // keep the normal pointing the same way for both directions, so A→B and B→A separate
    const flip = e.from < e.to ? 1 : -1;
    const off = (group.indexOf(e) - (group.length - 1) / 2) * 22 * flip;
    const pa = { x: ca.x + nx * off, y: ca.y + ny * off }, pb = { x: cb.x + nx * off, y: cb.y + ny * off };
    const s = exitPoint(a, pa, pb), t = exitPoint(b, pb, pa);
    out.set(e.id, { d: `M${s.x},${s.y} L${t.x},${t.y}`, mid: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 } });
  }
  return out;
}

/** Where the line from `from` toward `to` leaves box `n`. */
function exitPoint(n: ViewNode, from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const tx = dx ? Math.abs((dx > 0 ? n.x + n.w - from.x : from.x - n.x) / dx) : Infinity;
  const ty = dy ? Math.abs((dy > 0 ? n.y + n.h - from.y : from.y - n.y) / dy) : Infinity;
  const k = Math.min(tx, ty, 1);
  return { x: from.x + dx * k, y: from.y + dy * k };
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

interface ChatMsg { who: 'you' | 'claude'; text: string; error?: string; note?: string }

/** **bold** and `code` in Claude's answers; everything else stays plain text */
const inlineMd = (t: string) => t.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/).map((p, i) =>
  p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') && p.endsWith('`') && p.length > 2 ? <code key={i}>{p.slice(1, -1)}</code> : p);

function ChatLog({ msgs, busy, clear }: { msgs: ChatMsg[]; busy: boolean; clear: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  if (!msgs.length) return null;
  return (
    <div className="chatlog">
      <div className="chathead"><span>Chat · Claude can read and change this project</span>{!busy && <button className="link" onClick={clear}>Clear</button>}</div>
      {msgs.map((m, i) => (
        <div key={i} className={`msg ${m.who}`}>
          {m.text ? inlineMd(m.text) : busy && i === msgs.length - 1 ? <span className="muted">Reading the code…</span> : null}
          {m.note && <div className="note">{m.note}</div>}
          {m.error && <div className="err">{m.error}</div>}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Panel({ size, model, view, sel, code, ask, chat, openCode }: { size: number | null; model: Model; view: ComputedView; sel: Sel; code: CodeOpen | null; ask: ((t: string) => void) | null; chat: { msgs: ChatMsg[]; busy: boolean; clear: () => void } | null; openCode: (id: string) => void }) {
  const [q, setQ] = useState('');
  const node = sel?.type === 'node' ? view.nodes.find((n) => n.id === sel.id) : undefined;
  const edge = sel?.type === 'edge' ? view.edges.find((e) => e.id === sel.id) : undefined;
  const focusId = node?.id ?? code?.component ?? null;
  const subject = focusId ? contextLine(model, focusId) : edge ? `[VibeBlocks] The arrow ${nameOf(model, edge.from)} → ${nameOf(model, edge.to)} ("${edge.label}").` : `[VibeBlocks] About the ${view.title} diagram of ${model.system.name}.`;
  const send = (t: string) => { ask?.(`${subject} ${t}`); setQ(''); };

  return (
    <aside className="panel" style={size ? ({ '--panel-size': `${size}px` } as React.CSSProperties) : undefined}>
      {node ? <NodeDetails model={model} n={node} openCode={openCode} />
        : edge ? <EdgeDetails model={model} e={edge} />
        : code ? <NodeDetails model={model} n={{ id: code.component } as ViewNode} openCode={openCode} />
        : <Overview model={model} view={view} />}
      {chat && <ChatLog {...chat} />}
      {ask && <div className="ask">
        <div className="presets">
          {(node || code) && <button className="btn sm" onClick={() => send('Why is this here, and how does it affect the rest of the system?')}>Why is this here?</button>}
          {(node || code) && <button className="btn sm" onClick={() => send('Explain how it works, step by step.')}>Explain</button>}
          {edge && <button className="btn sm" onClick={() => send('What exactly travels over this, and where in the code?')}>What travels here?</button>}
          {!node && !edge && !code && <button className="btn sm" onClick={() => send('Explain this repo at this level.')}>Explain this repo</button>}
        </div>
        <textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder={node ? `Ask or tell the agent about ${node.name}…` : 'Ask the agent…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && q.trim()) { e.preventDefault(); send(q.trim()); } }} />
        <button className="btn dark" disabled={!q.trim() || chat?.busy} onClick={() => send(q.trim())}>{chat ? (chat.busy ? 'Claude is answering…' : 'Ask Claude') : 'Send to chat'}</button>
      </div>}
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

type CodeText = { text: string; start?: number; end?: number; error?: string };
const codeCache = new Map<string, CodeText>();
const codeKey = (file: string, symbol?: string) => `${file}#${symbol ?? ''}`;

function CodeView({ host, model, comp, open, setOpen }: { host: Host; model: Model; comp: { component: Component; container: string }; open: CodeOpen; setOpen: (c: CodeOpen) => void }) {
  const ref = comp.component.code[open.ref];
  const [src, setSrc] = useState<CodeText | null>(() => codeCache.get(codeKey(ref.file, ref.symbol)) ?? null);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // show what we have right away, then refresh it (the code may have changed since)
    const key = codeKey(ref.file, ref.symbol);
    setSrc(codeCache.get(key) ?? null);
    host.call('read_code', { file: ref.file, symbol: ref.symbol }).then(
      (x) => { codeCache.set(key, x); setSrc(x); },
      (e) => { if (!codeCache.has(key)) setSrc({ text: '', error: String(e.message ?? e) }); });
  }, [host, ref.file, ref.symbol]);
  // only when the code itself changes: a quiet refresh with the same text keeps your scroll position
  useEffect(() => { first.current?.scrollIntoView({ block: 'center' }); }, [src?.text, src?.start]);
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
        ))}{host.openFile && <button className="btn sm openfile" title="Open this file in the editor" onClick={() => host.openFile!(ref.file, ref.symbol)}>Open in editor ↗</button>}</div>
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

function ProposalBar({ summary, ask }: { summary: string; ask: ((t: string) => void) | null }) {
  const [modify, setModify] = useState(false);
  const [text, setText] = useState('');
  return (
    <div className="proposal">
      <div className="ptext"><b>Proposed plan:</b> {summary} <span className="muted">· dashed = proposed, nothing changed yet</span></div>
      {!ask ? (
        <div className="row muted">Approve, change or reject it in your Claude chat.</div>
      ) : modify ? (
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
          {host.canAsk ? <button className="btn dark" onClick={() => host.send('[VibeBlocks] The architecture model has errors. Call get_model and fix them with update_model.')}>Ask the agent to fix it</button>
            : <p>Run <code>/vibeblocks:map</code> in your Claude chat to fix it.</p>}</>
      ) : (
        <><h3>No map yet</h3><p>This project has no VibeBlocks model.</p>
          {host.canAsk ? <button className="btn dark" onClick={() => host.send('[VibeBlocks] Map this project: call get_guide, read the code, then build the C4 model with update_model and show_map.')}>Ask the agent to map it</button>
            : <p>Run <code>/vibeblocks:map</code> in your Claude chat to draw it.</p>}</>
      )}
    </div></div>
  );
}

function Help({ host, close }: { host: Host; close: () => void }) {
  // **bold** and `code` only: that's all the help text uses
  const rich = (t: string) => t.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p);
  return (
    <div className="help">
      <header className="top">
        <div className="titles"><h1>Using VibeBlocks</h1></div>
        <div className="right"><button className="btn dark sm" onClick={close}>Back to the map</button></div>
      </header>
      <div className="help-body">
        {helpFor(host.kind === 'browser' ? 'browser' : 'chat').map((s) => (
          <section key={s.title}><h3>{s.title}</h3><ul>{s.lines.map((l, i) => <li key={i}>{rich(l.text)}</li>)}</ul></section>
        ))}
      </div>
    </div>
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
