// Where the map runs: inside an MCP host (Claude, VS Code…) as an MCP App, or as a plain page
// served by dev/serve.ts. The rest of the UI only talks to this interface.
import { App } from '@modelcontextprotocol/ext-apps';

export interface Host {
  kind: 'mcp' | 'dev';
  /** project folder the map is about (null = let the server decide) */
  root: string | null;
  focus: string | null;
  call<T = any>(tool: string, args?: Record<string, unknown>): Promise<T>;
  /** post a message into the host's chat, as the user */
  send(text: string): Promise<void>;
  canExpand: boolean;
  expand(): Promise<void>;
}

export async function connectHost(onToast: (msg: string) => void): Promise<Host> {
  if (window.parent === window) return devHost(onToast);
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
    async send(text) {
      const r = await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
      if (r?.isError) onToast('The host did not accept the message.');
    },
    canExpand: false,
    async expand() {
      const mode = app.getHostContext()?.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
      await app.requestDisplayMode({ mode });
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

function devHost(onToast: (msg: string) => void): Host {
  const q = new URLSearchParams(location.search);
  return {
    kind: 'dev', root: q.get('path'), focus: q.get('focus'),
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
