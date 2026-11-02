// VibeBlocks MCP server (stdio). The diagram is an MCP App: hosts that support MCP Apps (Claude,
// VS Code, ChatGPT…) render it in the conversation; others get a text summary.
//
// The project folder comes from the tool's `path`, else VIBEBLOCKS_ROOT, else the current folder
// (Claude Code starts servers in the project folder).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { GUIDE } from '../guide';
import { applyProposal, discardProposal, getModel, getViews, mapSnapshot, mapSummary, proposeChange, readCode, resolveRoot, updateModel } from '../service';
import { OPS_REFERENCE } from '../model/ops';

const UI_URI = 'ui://vibeblocks/map.html';
const here = path.dirname(new URL(import.meta.url).pathname);

function uiHtml(): string {
  for (const p of [path.join(here, 'ui', 'index.html'), path.join(here, '..', '..', 'dist', 'ui', 'index.html')]) {
    try { return fs.readFileSync(p, 'utf8'); } catch { /* try next */ }
  }
  return '<p style="font-family:sans-serif">VibeBlocks UI is not built. Run <code>npm run build</code>.</p>';
}

const json = (x: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(x, null, 1) }], structuredContent: x as Record<string, unknown>, isError });
const pathArg = { path: z.string().optional().describe('Project folder (absolute). Defaults to the folder the agent runs in.') };
const OpsArg = z.array(z.record(z.string(), z.any())).describe(`Operations, each an object with an "op" field and these fields ("?" = optional):\n${OPS_REFERENCE}`);

const server = new McpServer(
  { name: 'vibeblocks', version: '0.1.0' },
  { instructions: 'VibeBlocks shows the project as an interactive C4 diagram in the conversation. Call show_map when the user asks about the project structure or architecture, or after you change the model. Before implementing a feature, call propose_change so the user can approve it on the diagram. Call get_guide before drawing or changing the model for the first time.' },
);

registerAppResource(server, 'VibeBlocks map', UI_URI, { description: 'Interactive C4 diagram of the project' }, async () => ({
  contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: uiHtml() }],
}));

registerAppTool(server, 'show_map', {
  title: 'Show architecture map',
  description: 'Show the project as an interactive C4 diagram (context → containers → components → code) in the conversation. Use when the user asks how the project is structured, where something happens, or to show a change you made or proposed.',
  inputSchema: { ...pathArg, focus: z.string().optional().describe('Element id to open the map on (e.g. a container id), optional.') },
  _meta: { ui: { resourceUri: UI_URI } },
}, async (args) => {
  const root = resolveRoot(args.path);
  const text = mapSummary(root) ?? 'This project has no VibeBlocks model yet. Call get_guide, read the code, then update_model.';
  // the summary also goes in structuredContent: some hosts show the model only that. The map's data
  // goes in _meta, for hosts that render the map but don't let it call get_views / read_code.
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: { root, focus: args.focus ?? null, summary: text },
    _meta: { vibeblocks: await mapSnapshot(root) },
  };
});

server.registerTool('get_guide', { description: 'How to draw and change the VibeBlocks C4 model: levels, rules, relationship kinds, workflow. Read before the first update_model.', inputSchema: {} },
  async () => ({ content: [{ type: 'text' as const, text: GUIDE }] }));

server.registerTool('get_model', { description: 'The current C4 model of the project, with validation errors/warnings and any open proposal.', inputSchema: pathArg },
  async (args) => json(getModel(resolveRoot(args.path))));

server.registerTool('update_model', {
  description: 'Change the C4 model with a batch of operations. All or nothing: if any operation or C4 rule fails, nothing is saved and the errors say how to fix them. Code references are checked against the files. On success it returns warnings (style, boxes with no arrows, source files not on the map) and "map": the diagram in plain lines; check it against the code and fix what is off.',
  inputSchema: { ...pathArg, ops: OpsArg },
}, async (args) => { const r = updateModel(resolveRoot(args.path), args.ops); return json(r, !r.saved); });

server.registerTool('propose_change', {
  description: 'Propose a change to the architecture before writing code. It is drawn dashed on the map for the user to approve, modify or reject. Only structure is checked now; code references are checked when you apply it.',
  inputSchema: { ...pathArg, summary: z.string().describe('One line: what the change does for the user.'), ops: OpsArg },
}, async (args) => { const r = proposeChange(resolveRoot(args.path), args.summary, args.ops); return json(r, !r.saved); });

server.registerTool('apply_proposal', { description: 'After implementing an approved proposal, apply it to the model (code references are checked now).', inputSchema: pathArg },
  async (args) => { const r = applyProposal(resolveRoot(args.path)); return json(r, !r.saved); });

server.registerTool('discard_proposal', { description: 'Drop the open proposal (the user rejected it).', inputSchema: pathArg },
  async (args) => json(discardProposal(resolveRoot(args.path))));

// ---- used by the map itself
server.registerTool('get_views', {
  description: 'Computed, laid-out views of the model for the map.',
  inputSchema: pathArg,
  _meta: { ui: { visibility: ['app'] } },
}, async (args) => json(await getViews(resolveRoot(args.path))));

server.registerTool('read_code', {
  description: 'Text of a file in the project, with the line range of a symbol.',
  inputSchema: { ...pathArg, file: z.string(), symbol: z.string().optional() },
  _meta: { ui: { visibility: ['app'] } },
}, async (args) => json(readCode(resolveRoot(args.path), args.file, args.symbol)));

await server.connect(new StdioServerTransport());
