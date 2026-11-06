// Where the map runs: inside an MCP host (Claude, VS Code…) as an MCP App, in a browser tab served by
// the MCP server (src/browser.ts), in the VibeBlocks VS Code extension's panel (vscode/), or as the
// dev page served by dev/serve.ts. It is the same page everywhere; the rest of the UI only talks to
// this interface.
import { App } from '@modelcontextprotocol/ext-apps';

export interface Host {
  kind: 'mcp' | 'browser' | 'dev' | 'vscode';
  /** project folder the map is about (null = let the server decide) */
  root: string | null;
  focus: string | null;
  call<T = any>(tool: string, args?: Record<string, unknown>): Promise<T>;
  /** false where the map can't reach the chat (the browser tab): no ask, approve or reject */
  canAsk: boolean;
  /** post a message into the host's chat, as the user */
  send(text: string): Promise<void>;
  canExpand: boolean;
  expand(): Promise<void>;
  /** null where the map is already in a browser */
  openInBrowser: (() => Promise<void>) | null;
  /** The map's own chat, where it can't reach the host's (the browser tab): answers stream into
   *  onText, side notes (like a refused command) into onNote. It can change the code. */
  chat: ((text: string, onText: (t: string) => void, onNote?: (t: string) => void) => Promise<void>) | null;
  /** open a project file in the user's editor, where there is one (VS Code) */
  openFile?: (file: string, symbol?: string) => void;
}

/** VS Code gives its webviews this, once */
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

/** Set by scripts/export-snapshot.ts in a standalone HTML file: the map's data, baked in. */
declare global {
  interface Window { __VIBEBLOCKS_SNAPSHOT__?: { get_views: unknown; read_code: Record<string, unknown> } }
}

export async function connectHost(onToast: (msg: string) => void): Promise<Host> {
  // Checked first: a shared snapshot may itself be shown in an iframe (an Artifact, an embed).
  if (window.__VIBEBLOCKS_SNAPSHOT__) return snapshotHost(window.__VIBEBLOCKS_SNAPSHOT__);
  if (typeof acquireVsCodeApi === 'function') return vscodeHost(onToast);
  if (window.parent === window) {
    const token = new URLSearchParams(location.search).get('token');
    return token ? browserHost(token) : devHost(onToast);
  }
  const app = new App({ name: 'VibeBlocks', version: '0.1.0' }, {});
  // show_map's result carries the map's data, for hosts that refuse calls from the map (the Claude
  // desktop app's Code tab: "IPC not available"). Once a call fails, use only that snapshot.
  let snapshot: { get_views?: unknown; read_code?: Record<string, unknown> } | null = null;
  let live = true;
  const fromSnapshot = (tool: string, args: Record<string, unknown>) =>
    tool === 'get_views' ? snapshot?.get_views
      : tool === 'read_code' ? snapshot?.read_code?.[`${args.file}#${args.symbol ?? ''}`] ?? { text: '', error: 'This code was not sent with the map. Ask the agent to show it.' }
      : undefined;
  const host: Host = {
    kind: 'mcp', root: null, focus: null,
    async call(tool, args = {}) {
      if (!live && snapshot) return fromSnapshot(tool, args) as any;
      try {
        const r: any = await app.callServerTool({ name: tool, arguments: { ...(host.root ? { path: host.root } : {}), ...args } });
        if (r.isError) throw new Error(r.content?.[0]?.text ?? 'tool failed');
        return r.structuredContent ?? JSON.parse(r.content?.[0]?.text ?? 'null');
      } catch (e) {
        const saved = snapshot && fromSnapshot(tool, args);
        if (saved === undefined || saved === null) throw e;
        live = false;
        return saved as any;
      }
    },
    canAsk: true,
    async send(text) {
      const r = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      if (r?.isError) onToast('The host did not accept the message.');
    },
    canExpand: false,
    chat: null,
    async expand() {
      const mode = app.getHostContext()?.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
      await app.requestDisplayMode({ mode });
    },
    async openInBrowser() {
      // Ask the server directly; where the host blocks that, ask the agent to do it.
      try {
        const r: any = await app.callServerTool({ name: 'open_in_browser', arguments: host.root ? { path: host.root } : {} });
        if (r.isError) throw new Error();
        const out = r.structuredContent ?? JSON.parse(r.content?.[0]?.text ?? '{}');
        onToast(out.opened ? 'Opened the map in your browser.' : out.note);
      } catch {
        await host.send('[VibeBlocks] Open this map in my browser: call open_in_browser.');
      }
    },
  };
  const gotResult = new Promise<void>((resolve) => {
    app.ontoolresult = (p: any) => {
      const sc = p?.structuredContent;
      if (sc?.root) host.root = sc.root;
      if (sc?.focus) host.focus = sc.focus;
      if (p?._meta?.vibeblocks) snapshot = p._meta.vibeblocks;
      resolve();
    };
    setTimeout(resolve, 2500);
  });
  app.ontoolinput = (p: any) => { if (p?.arguments?.path) host.root = p.arguments.path; };
  await app.connect();
  host.canExpand = !!app.getHostContext()?.availableDisplayModes?.includes('fullscreen');
  await gotResult;
  return host;
}

/** A standalone, shareable copy of the map: no server and no chat, everything read from the file. */
function snapshotHost(snap: { get_views: unknown; read_code: Record<string, unknown> }): Host {
  return {
    kind: 'browser', root: null, focus: null,
    async call(tool, args = {}) {
      if (tool === 'get_views') return snap.get_views as any;
      if (tool === 'read_code') return (snap.read_code[`${args.file}#${args.symbol ?? ''}`] ?? { text: '', error: 'This code is not included in this shared map.' }) as any;
      throw new Error(`A shared map can't call ${tool}.`);
    },
    chat: null,
    canAsk: false,
    async send() {},
    canExpand: false,
    async expand() {},
    openInBrowser: null,
  };
}

/** The VibeBlocks VS Code extension's panel (vscode/src/extension.ts). Requests go to the extension
 *  over the webview's message channel; it answers from the same service code as the MCP server, and
 *  hands "ask the agent" messages to whichever agent the user picked (Claude Code by default). */
function vscodeHost(onToast: (msg: string) => void): Promise<Host> {
  const vscode = acquireVsCodeApi();
  const waiting = new Map<number, { ok: (v: any) => void; fail: (e: Error) => void }>();
  let next = 1;
  let boot: { root: string | null; focus: string | null } = { root: null, focus: null };
  const booted = new Promise<void>((resolve) => {
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m?.type === 'boot') { boot = m; resolve(); }
      else if (m?.type === 'toast') onToast(m.text);
      else if (m?.type === 'reply') {
        const w = waiting.get(m.id);
        waiting.delete(m.id);
        if (m.error) w?.fail(new Error(m.error)); else w?.ok(m.result);
      }
    });
  });
  const host: Host = {
    kind: 'vscode', root: null, focus: null,
    call(tool, args = {}) {
      const id = next++;
      return new Promise((ok, fail) => { waiting.set(id, { ok, fail }); vscode.postMessage({ type: 'call', id, tool, args }); });
    },
    canAsk: true,
    async send(text) { vscode.postMessage({ type: 'send', text }); },
    canExpand: false,
    async expand() {},
    openInBrowser: null,
    chat: null,
    openFile(file, symbol) { vscode.postMessage({ type: 'openFile', file, symbol }); },
  };
  vscode.postMessage({ type: 'ready' });
  return booted.then(() => { host.root = boot.root; host.focus = boot.focus; return host; });
}

function browserHost(token: string): Host {
  let session: string | null = null; // follow-up questions continue the same Claude conversation
  return {
    async chat(text, onText, onNote) {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vibeblocks-token': token }, body: JSON.stringify({ message: text, session }) })
        .catch(() => { throw new Error('VibeBlocks stopped (Claude was closed or restarted). Run /vibeblocks:open again.'); });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? 'The chat is not available.');
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const ev = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
          if (ev.text) onText(ev.text);
          if (ev.note) onNote?.(ev.note);
          if (ev.session) session = ev.session;
          if (ev.error) throw new Error(ev.error);
        }
      }
    },
    kind: 'browser', root: null, focus: null,
    async call(tool, args = {}) {
      const r = await fetch('/api/tool', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vibeblocks-token': token }, body: JSON.stringify({ tool, args }) })
        .catch(() => { throw new Error('VibeBlocks stopped (Claude was closed or restarted). Run /vibeblocks:open again.'); });
      const body = await r.json().catch(() => ({ error: 'VibeBlocks stopped. Run /vibeblocks:open again.' }));
      if (!r.ok) throw new Error(body.error ?? 'tool failed');
      return body;
    },
    canAsk: false,
    async send() {},
    canExpand: false,
    async expand() {},
    openInBrowser: null,
  };
}

function devHost(onToast: (msg: string) => void): Host {
  const q = new URLSearchParams(location.search);
  return {
    kind: 'dev', root: q.get('path'), focus: q.get('focus'),
    canAsk: true,
    chat: null,
    openInBrowser: null,
    async call(tool, args = {}) {
      const r = await fetch('/api/tool', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool, args: { ...(q.get('path') ? { path: q.get('path') } : {}), ...args } }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'tool failed');
      return body;
    },
    async send(text) { console.log('[to chat]', text); onToast(`Sent to chat: “${text.length > 140 ? text.slice(0, 140) + '…' : text}”`); },
    canExpand: false,
    async expand() {},
  };
}
