// The map in a normal browser tab, served by the MCP server process itself (so it lives as long as
// the host runs the server). The page can read the views and the code, and has its own chat: each
// message runs `claude -p` in the project, on the user's own Claude Code login and settings
// (/api/chat). That chat can change the code: file edits are accepted, and other commands follow the
// user's Claude Code permission rules (anything not already allowed is refused, since nobody can be
// asked).
// Each opened project gets a random token in the link; requests without it, or for another host
// name (DNS rebinding), are refused.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
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
        if (req.method === 'POST' && url.pathname === '/api/chat') {
          const root = roots.get(String(req.headers['x-vibeblocks-token'] ?? ''));
          if (!root) return void res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'This link has expired. Run /vibeblocks:open again.' }));
          let body = '';
          for await (const c of req) body += c;
          const { message, session } = JSON.parse(body || '{}');
          if (typeof message !== 'string' || !message.trim()) return void res.writeHead(400).end();
          return chat(root, message, typeof session === 'string' && /^[0-9a-f-]{36}$/.test(session) ? session : null, req, res);
        }
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

const CHAT_PROMPT = `You are the chat inside the VibeBlocks map: an interactive C4 diagram of this project, open in the user's browser. Messages often start with what the user selected on the map. Keep answers short and plain, for someone who may not be a programmer, and name the files you mean.
You can change the project. For a new feature or a change to the structure (new parts, new connections), first call the VibeBlocks propose_change tool and stop: the user approves, modifies or rejects it on the map, and that comes back to you as a message. Once approved, implement it, then call apply_proposal. Small fixes inside one part you can just make. After any code change, keep the map current with update_model if the structure changed. You cannot ask the user for permission here: if a command is refused, say what you wanted to run so they can run it.`;

/** sessions this server started (their first message used --session-id, later ones --resume) */
const sessions = new Set<string>();

/** Answer one chat message with `claude -p` in the project, read-only, streamed as NDJSON lines:
 *  {text} pieces of the answer, then {done, session} or {error}. */
function chat(root: string, message: string, session: string | null, req: http.IncomingMessage, res: http.ServerResponse) {
  const id = session && sessions.has(session) ? session : randomUUID();
  const resume = sessions.has(id);
  const env = { ...process.env };
  delete env.CLAUDECODE; // this server may itself run inside Claude Code
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'acceptEdits',
    // the VibeBlocks tools, under either name (installed as a plugin, or as a project MCP server)
    '--allowedTools', 'mcp__plugin_vibeblocks_vibeblocks', 'mcp__vibeblocks',
    '--append-system-prompt', CHAT_PROMPT, ...(resume ? ['--resume', id] : ['--session-id', id])];
  const child = spawn(process.env.VIBEBLOCKS_CLAUDE ?? 'claude', args, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' });
  const out = (x: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(x) + '\n'); };
  let streamed = false, buf = '', err = '';
  child.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let ev: any; try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') { streamed = true; out({ text: ev.event.delta.text }); }
      else if (ev.type === 'stream_event' && ev.event?.type === 'message_start' && streamed) out({ text: '\n\n' });
      else if (ev.type === 'assistant' && !streamed) for (const b of ev.message?.content ?? []) if (b.type === 'text') out({ text: b.text });
      else if (ev.type === 'result' && ev.is_error) out({ error: String(ev.result ?? 'Claude could not answer.') });
      else if (ev.type === 'result' && ev.permission_denials?.length) {
        const what = [...new Set(ev.permission_denials.map((d: any) => d.tool_name === 'Bash' ? `\`${d.tool_input?.command ?? 'a command'}\`` : d.tool_name))];
        out({ note: `Not allowed from the map: ${what.join(', ')}. Run it yourself, or allow it in your Claude Code settings.` });
      }
    }
  });
  child.stderr.on('data', (d: Buffer) => { err += d.toString(); });
  child.on('error', () => { out({ error: 'Could not start Claude Code (the claude command). Install it, or ask in your Claude chat instead.' }); res.end(); });
  child.on('close', (code) => {
    if (code === 0) { sessions.add(id); out({ done: true, session: id }); }
    else out({ error: err.trim().split('\n').pop() || `Claude stopped (exit code ${code}).` });
    res.end();
  });
  res.on('close', () => { if (child.exitCode === null) child.kill(); });
  child.stdin.end(message);
}
