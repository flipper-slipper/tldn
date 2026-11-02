// Where the map runs: inside an MCP host (Claude, VS Code…) as an MCP App, in a browser tab served by
// the MCP server (src/browser.ts, view-only), or as the dev page served by dev/serve.ts. The rest of
// the UI only talks to this interface.
import { App } from '@modelcontextprotocol/ext-apps';

export interface Host {
  kind: 'mcp' | 'browser' | 'dev';
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
}

export async function connectHost(onToast: (msg: string) => void): Promise<Host> {
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

function browserHost(token: string): Host {
  return {
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
