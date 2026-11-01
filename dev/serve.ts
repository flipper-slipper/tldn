// Dev page: the same map UI in a normal browser tab, backed by the same tool handlers as the
// MCP server. Messages the map would post into the chat show as a toast instead.
//   npm run dev -- example-projects/acme-shop   →   http://localhost:5178
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { applyProposal, discardProposal, getModel, getViews, proposeChange, readCode, resolveRoot, updateModel } from '../src/service';

const repo = resolveRoot(process.argv[2] ?? 'example-projects/acme-shop');
const port = Number(process.env.PORT ?? 5178);
const ui = path.resolve(import.meta.dirname, '..', 'dist', 'ui', 'index.html');

const tools: Record<string, (root: string, a: any) => unknown> = {
  get_views: (root) => getViews(root),
  read_code: (root, a) => readCode(root, a.file, a.symbol),
  get_model: (root) => getModel(root),
  update_model: (root, a) => updateModel(root, a.ops ?? []),
  propose_change: (root, a) => proposeChange(root, a.summary ?? '', a.ops ?? []),
  apply_proposal: (root) => applyProposal(root),
  discard_proposal: (root) => discardProposal(root),
};

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/tool') {
      let body = '';
      for await (const c of req) body += c;
      const { tool, args = {} } = JSON.parse(body || '{}');
      const fn = tools[tool];
      if (!fn) throw new Error(`unknown tool ${tool}`);
      const out = await fn(args.path ? resolveRoot(args.path) : repo, args);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
      return;
    }
    const html = fs.readFileSync(ui, 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(port, '127.0.0.1', () => console.log(`VibeBlocks dev page for ${repo}: http://localhost:${port}`));
