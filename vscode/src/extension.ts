// The VibeBlocks VS Code extension: the same map page as the Claude Code plugin, in a VS Code panel.
//
//   map page (src/ui, built to dist/ui/index.html) ── shared, not copied: the page picks its "host"
//        │  postMessage                                 adapter at startup (src/ui/host.ts → vscodeHost)
//   this extension ── get_views / read_code ──► src/service.ts (the same code the MCP server runs,
//        │                                       bundled next to this file as service.mjs)
//        └── "ask the agent" ──► the user's coding agent: Claude Code's chat, Copilot Chat, or the clipboard
//
// The agent changes the map the usual way (the VibeBlocks MCP tools write .vibeblocks/*.yaml) and the
// panel picks that up on its next poll, so any agent with the VibeBlocks MCP server closes the loop.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

type Service = typeof import('../../src/service');
let service: Promise<Service> | undefined;
// The service (and LikeC4 under it) is an ES module; this file has to be CommonJS for VS Code.
const svc = () => (service ??= import(pathToFileURL(path.join(__dirname, 'service.mjs')).href) as Promise<Service>);

let panel: vscode.WebviewPanel | undefined;
let panelRoot: string | undefined;

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vibeblocks.showMap', () => show(ctx)),
    // vscode://vibeblocks.vibeblocks/show?path=<project>&focus=<element>: show_map uses this when the
    // agent runs inside VS Code, so the map opens here instead of in a browser tab
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path !== '/show') return;
        const q = new URLSearchParams(uri.query);
        show(ctx, q.get('path') ?? undefined, q.get('focus') ?? undefined);
      },
    }),
  );
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(type-hierarchy) VibeBlocks';
  item.tooltip = 'Show the VibeBlocks map of this project';
  item.command = 'vibeblocks.showMap';
  item.show();
  ctx.subscriptions.push(item);
}

export function deactivate() {}

/** The project to map: the one asked for, else the open folder that has a map, else the first one. */
function pickRoot(asked?: string): string | undefined {
  if (asked) return asked;
  const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  return folders.find((f) => fs.existsSync(path.join(f, '.vibeblocks', 'model.yaml'))) ?? folders[0];
}

function show(ctx: vscode.ExtensionContext, asked?: string, focus?: string) {
  const root = pickRoot(asked);
  if (!root) return void vscode.window.showInformationMessage('VibeBlocks: open a project folder first.');
  if (panel && panelRoot === root) return panel.reveal();
  panel?.dispose();
  panelRoot = root;
  panel = vscode.window.createWebviewPanel('vibeblocks.map', `Map · ${path.basename(root)}`, vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [],
  });
  panel.webview.html = pageHtml(ctx);
  panel.onDidDispose(() => { panel = undefined; panelRoot = undefined; });
  const web = panel.webview;
  web.onDidReceiveMessage(async (m) => {
    if (m?.type === 'ready') return void web.postMessage({ type: 'boot', root, focus: focus ?? null });
    if (m?.type === 'call') {
      try {
        const s = await svc();
        const result = m.tool === 'get_views' ? await s.getViews(root)
          : m.tool === 'read_code' ? s.readCode(root, String(m.args?.file ?? ''), m.args?.symbol ? String(m.args.symbol) : undefined)
          : (() => { throw new Error(`The map can't call ${m.tool} here.`); })();
        web.postMessage({ type: 'reply', id: m.id, result });
      } catch (e) {
        web.postMessage({ type: 'reply', id: m.id, error: (e as Error).message });
      }
      return;
    }
    if (m?.type === 'send') return void sendToAgent(String(m.text), (t) => web.postMessage({ type: 'toast', text: t }));
    if (m?.type === 'openFile') return void openFile(root, String(m.file), m.symbol ? String(m.symbol) : undefined);
  });
}

/** The shared map page, with a content security policy that lets only its own inline code run. */
function pageHtml(ctx: vscode.ExtensionContext): string {
  const html = fs.readFileSync(path.join(ctx.extensionPath, 'dist', 'ui', 'index.html'), 'utf8');
  const nonce = randomBytes(16).toString('base64');
  const csp = `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return html
    .replace(/<script\b/g, `<script nonce="${nonce}"`)
    .replace(/<head>/i, `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`);
}

// ---------------------------------------------------------------- the user's coding agent

type Agent = 'claude-code' | 'copilot' | 'clipboard';
const has = (id: string) => !!vscode.extensions.getExtension(id);

function pickAgent(): Agent {
  const pref = vscode.workspace.getConfiguration('vibeblocks').get<string>('agent', 'auto');
  if (pref === 'claude-code' || pref === 'copilot' || pref === 'clipboard') return pref;
  return has('anthropic.claude-code') ? 'claude-code' : has('github.copilot-chat') ? 'copilot' : 'clipboard';
}

/** Hand a message from the map to the agent's chat, as the user's next prompt. */
async function sendToAgent(text: string, toast: (t: string) => void) {
  const agent = pickAgent();
  try {
    // Claude Code: opens its chat with the prompt in it (session: none = the current one)
    if (agent === 'claude-code') return void await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, text);
    if (agent === 'copilot') return void await vscode.commands.executeCommand('workbench.action.chat.open', { query: text });
  } catch { /* the agent's extension is gone or changed: fall back to the clipboard */ }
  await vscode.env.clipboard.writeText(text);
  toast('Copied. Paste it into your coding agent’s chat.');
}

async function openFile(root: string, file: string, symbol?: string) {
  const abs = path.resolve(root, file);
  if (!abs.startsWith(path.resolve(root) + path.sep)) return;
  let line = 0;
  if (symbol) { try { line = Math.max(0, ((await svc()).readCode(root, file, symbol).start ?? 1) - 1); } catch { /* no symbol: top of file */ } }
  const doc = await vscode.workspace.openTextDocument(abs);
  const at = new vscode.Position(line, 0);
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, selection: new vscode.Range(at, at) });
}
