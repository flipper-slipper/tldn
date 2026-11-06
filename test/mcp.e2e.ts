// End-to-end: spawn dist/mcp.mjs over stdio and drive it like a host would.
//   npm run build && node --import tsx test/mcp.e2e.ts
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ACME_OPS } from './acme';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-e2e-'));
fs.cpSync(path.resolve(import.meta.dirname, '../example-projects/acme-shop'), repo, { recursive: true });
fs.rmSync(path.join(repo, '.vibeblocks'), { recursive: true, force: true });

const client = new Client({ name: 'e2e', version: '0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [path.resolve(import.meta.dirname, '../dist/mcp.mjs')], env: { ...process.env, VIBEBLOCKS_ROOT: repo, VIBEBLOCKS_NO_BROWSER: '1' } as any }));
const ok = (c: boolean, m: string) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };
const text = (r: any) => r.content?.[0]?.text ?? '';

const tools = (await client.listTools()).tools;
ok(['show_map', 'get_guide', 'get_model', 'update_model', 'propose_change', 'apply_proposal', 'discard_proposal'].every((n) => tools.some((t) => t.name === n)), `tools: ${tools.map((t) => t.name).join(', ')}`);
const show = tools.find((t) => t.name === 'show_map') as any;
ok(!!show?._meta?.ui?.resourceUri, `show_map links ${show?._meta?.ui?.resourceUri}`);

const bad = await client.callTool({ name: 'update_model', arguments: { ops: [{ op: 'add_relationship', from: 'nope', to: 'nada', kind: 'request', description: 'x' }] } });
ok(/nope|not found|unknown/i.test(text(bad)), 'bad batch refused: ' + text(bad).slice(0, 100));

const up = await client.callTool({ name: 'update_model', arguments: { ops: ACME_OPS } });
ok(fs.existsSync(path.join(repo, '.vibeblocks/model.yaml')), 'model saved: ' + text(up).slice(0, 100));

const map = await client.callTool({ name: 'show_map', arguments: {} });
ok(text(map).length > 0, 'show_map: ' + text(map).slice(0, 120).replace(/\n/g, ' | '));
// this client can't draw MCP Apps (like Claude Code in a terminal): the map goes to a browser tab
ok(/opened in the browser: http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(text(map)), 'no MCP Apps: show_map opens the browser');
const again = await client.callTool({ name: 'show_map', arguments: {} });
ok(/is open in the browser/.test(text(again)), 'second show_map reuses the open tab');

// a host that draws MCP Apps gets the map in the chat, and no browser
const uiClient = new Client({ name: 'e2e-ui', version: '0' }, { capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } } as any });
await uiClient.connect(new StdioClientTransport({ command: 'node', args: [path.resolve(import.meta.dirname, '../dist/mcp.mjs')], env: { ...process.env, VIBEBLOCKS_ROOT: repo, VIBEBLOCKS_NO_BROWSER: '1' } as any }));
const uiMap = await uiClient.callTool({ name: 'show_map', arguments: {} });
ok(!/browser/.test(text(uiMap)), 'MCP Apps host: show_map stays in the chat');
await uiClient.close();

// the browser tab's chat endpoint: refuses a wrong token, streams NDJSON with the right one
const link = text(map).match(/http:\/\/\S+/)![0];
const u = new URL(link);
const noTok = await fetch(new URL('/api/chat', u), { method: 'POST', body: JSON.stringify({ message: 'hi' }) });
ok(noTok.status === 403, 'chat without token refused');
if (process.env.VB_E2E_CHAT === '1') {
  const r = await fetch(new URL('/api/chat', u), { method: 'POST', headers: { 'x-vibeblocks-token': u.searchParams.get('token')! }, body: JSON.stringify({ message: 'In one sentence: what file holds the server entry point?' }) });
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  ok(lines.some((l) => l.text) && lines.some((l) => l.done && l.session), 'chat answered: ' + lines.map((l) => l.text ?? '').join('').slice(0, 120) + (lines.find((l) => l.error)?.error ?? ''));
}

const views = await client.callTool({ name: 'get_views', arguments: {} });
const v = (views as any).structuredContent ?? JSON.parse(text(views));
ok(v.views?.length >= 3, `get_views: ${v.views?.map((x: any) => x.id).join(', ')}`);

const res = await client.readResource({ uri: show._meta.ui.resourceUri });
const c = res.contents[0] as any;
ok(c.mimeType?.includes('mcp-app') && (c.text?.length ?? 0) > 100_000, `resource ${c.mimeType}, ${c.text?.length} chars`);

await client.close();
fs.rmSync(repo, { recursive: true, force: true });
