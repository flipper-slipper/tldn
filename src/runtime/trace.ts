// Read the bounded opt-in runtime telemetry produced by scripts/trace-runner.mjs.
// Paths are always project-relative; raw source and full process environments are never returned.
import * as fs from 'node:fs';
import * as path from 'node:path';

export type RuntimeEvent = {
  type: 'start' | 'activity' | 'error' | 'mark' | 'end';
  at: number;
  file?: string;
  count?: number;
  message?: string;
  line?: number;
  exitCode?: number;
};
export type RuntimeTrace = {
  available: boolean;
  run?: string;
  started?: number;
  running?: boolean;
  command?: string;
  events: RuntimeEvent[];
  files: { file: string; count: number; errors: number }[];
  errorCount: number;
  note: string;
};
const empty = (): RuntimeTrace => ({ available: false, events: [], files: [], errorCount: 0,
  note: 'No trace yet. Run npm run trace -- --root PATH -- node YOUR_ENTRY.js from the VibeBlocks folder.' });

export function getRuntimeTrace(root: string): RuntimeTrace {
  const traces = path.join(root, '.vibeblocks', 'traces');
  // A project-controlled symlink must not redirect diagnostics outside the project.
  let actualDir: string;
  try {
    const base = fs.realpathSync(root);
    actualDir = fs.realpathSync(traces);
    if (!actualDir.startsWith(base + path.sep)) return empty();
    if (path.dirname(fs.realpathSync(path.join(traces, 'latest.json'))) !== actualDir) return empty();
  } catch { return empty(); }
  let meta: { id?: string; started?: number; command?: string };
  try { meta = JSON.parse(fs.readFileSync(path.join(traces, 'latest.json'), 'utf8')); }
  catch { return empty(); }
  if (!meta || typeof meta.id !== 'string' || !/^[a-f\d-]{36}$/i.test(meta.id)) return empty();
  const file = path.join(traces, `${meta.id}.jsonl`);
  let stat: fs.Stats;
  try {
    const real = fs.realpathSync(file);
    if (path.dirname(real) !== actualDir) return empty();
    stat = fs.statSync(real);
    if (!stat.isFile()) return empty();
  } catch { return empty(); }
  // Read at most the last 2 MiB even when a long-running app has generated a huge trace.
  const max = 2 * 1024 * 1024;
  const fd = fs.openSync(file, 'r');
  let chunk = '';
  try {
    const len = Math.min(stat.size, max), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, stat.size - len);
    chunk = buf.toString('utf8');
  } finally { fs.closeSync(fd); }
  if (stat.size > max) chunk = chunk.slice(chunk.indexOf('\n') + 1);
  const events: RuntimeEvent[] = [];
  const errors: RuntimeEvent[] = [];
  const files = new Map<string, { file: string; count: number; errors: number }>();
  let errorCount = 0, ended = false;
  for (const line of chunk.split('\n')) {
    if (!line || line.length > 8192) continue;
    let raw: any;
    try { raw = JSON.parse(line); } catch { continue; }
    if (!raw || !['start', 'activity', 'error', 'mark', 'end'].includes(raw.type) || typeof raw.at !== 'number') continue;
    const ev: RuntimeEvent = { type: raw.type, at: raw.at };
    // The collector emits project-relative names. Never expose absolute/outside paths if a log is edited.
    if (typeof raw.file === 'string' && raw.file.length < 500 && !path.isAbsolute(raw.file) && !raw.file.split(/[\\/]/).includes('..')) ev.file = raw.file.replace(/\\/g, '/');
    if (raw.type === 'activity') ev.count = Number.isFinite(raw.count) ? Math.max(0, Math.min(raw.count, 1e8)) : 0;
    if (raw.type === 'error' || raw.type === 'mark') ev.message = String(raw.message ?? '').slice(0, 400);
    if (Number.isInteger(raw.line) && raw.line > 0) ev.line = raw.line;
    if (raw.type === 'end') { ended = true; if (Number.isInteger(raw.exitCode)) ev.exitCode = raw.exitCode; }
    if (raw.type === 'error') { errorCount++; errors.push(ev); }
    if (ev.file) {
      const item = files.get(ev.file) ?? { file: ev.file, count: 0, errors: 0 };
      if (ev.type === 'activity') item.count += ev.count ?? 0;
      if (ev.type === 'error') item.errors++;
      files.set(ev.file, item);
    }
    events.push(ev);
  }
  return {
    available: true, run: meta.id,
    started: typeof meta.started === 'number' ? meta.started : undefined,
    command: typeof meta.command === 'string' ? meta.command.slice(0, 180) : undefined,
    running: !ended && Date.now() - stat.mtimeMs < 4_000,
    // Keep recent errors visible even when thousands of activity samples follow them.
    events: [...new Map([...events.slice(-100), ...errors.slice(-30)].map((event) => [`${event.at}:${event.type}:${event.file ?? ''}`, event])).values()]
      .sort((a, b) => b.at - a.at).slice(0, 100),
    files: [...files.values()].sort((a, b) => b.errors - a.errors || b.count - a.count).slice(0, 150),
    errorCount,
    note: 'Node.js function execution counts sampled by V8 (not a step-by-step call stack). Uncaught errors and explicit trace marks are also shown.'
  };
}
