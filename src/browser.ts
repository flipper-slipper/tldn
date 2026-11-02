// The map in a normal browser tab, served by the MCP server process itself (so it lives as long as
// the host runs the server). View-only: the page can read the views and the code, nothing else.
// Each opened project gets a random token in the link; requests without it, or for another host
// name (DNS rebinding), are refused.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as http from 'node:http';
import { getViews, readCode } from './service';

const TOOLS: Record<string, (root: string, a: any) => unknown> = {
  get_views: (root) => getViews(root),
  read_code: (root, a) => readCode(root, String(a.file ?? ''), a.symbol ? String(a.symbol) : undefined),
};

let server: Promise<number> | null = null;
const roots = new Map<string, string>(); // token → project root

function start(html: () => string): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer(async (req, res) => {
      const port = (s.address() as { port: number }).port;
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return void res.writeHead(403).end();
      try {
        if (req.method === 'POST' && url.pathname === '/api/tool') {
          const root = roots.get(String(req.headers['x-vibeblocks-token'] ?? ''));
          if (!root) return void res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'This link has expired. Run /vibeblocks:open again.' }));
          let body = '';
          for await (const c of req) body += c;
          const { tool, args = {} } = JSON.parse(body || '{}');
          const fn = TOOLS[tool];
          if (!fn) throw new Error(`The browser map can't call ${tool}.`);
          return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await fn(root, args)));
        }
        if (req.method === 'GET' && url.pathname === '/') return void res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html());
        res.writeHead(404).end();
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => resolve((s.address() as { port: number }).port));
  });
}

/** Serve the map of `root` and open it in the default browser. Returns the link. */
export async function openInBrowser(root: string, html: () => string, launch = true): Promise<string> {
  server ??= start(html);
  const port = await server;
  let token = [...roots].find(([, r]) => r === root)?.[0];
  if (!token) { token = randomBytes(16).toString('hex'); roots.set(token, root); }
  const link = `http://127.0.0.1:${port}/?token=${token}`;
  if (launch) {
    const [cmd, args] = process.platform === 'darwin' ? ['open', [link]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : ['xdg-open', [link]];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => { /* no browser: the link is returned anyway */ }).unref();
  }
  return link;
}
