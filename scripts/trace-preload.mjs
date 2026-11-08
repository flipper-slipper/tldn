// Imported into traced Node processes through NODE_OPTIONS. Uses only Node built-ins.
// No source code, environment variables or function arguments are recorded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import inspector from 'node:inspector';

const root = process.env.VIBEBLOCKS_TRACE_ROOT;
const logfile = process.env.VIBEBLOCKS_TRACE_LOG;
if (root && logfile) {
  const base = path.resolve(root);
  const cmp = (s) => process.platform === 'win32' ? s.toLowerCase() : s;
  const within = (absolute) => cmp(absolute).startsWith(cmp(base + path.sep)) && !cmp(absolute).includes(cmp(`${path.sep}node_modules${path.sep}`))
    && !cmp(absolute).includes(cmp(`${path.sep}.vibeblocks${path.sep}`));
  const rel = (file) => {
    try {
      const full = file.startsWith('file:') ? fileURLToPath(file) : path.isAbsolute(file) ? file : null;
      if (!full || full === fileURLToPath(import.meta.url)) return null;
      return within(full) ? path.relative(base, full).replaceAll(path.sep, '/') : null;
    } catch { return null; }
  };
  const emit = (entry) => {
    try {
      if (fs.statSync(logfile).size > 10_000_000) return; // stop collecting large traces
      fs.appendFileSync(logfile, JSON.stringify({ at: Date.now(), ...entry }) + '\n');
    } catch { /* tracing must never crash the application being observed */ }
  };
  const loc = (error) => {
    const stack = String(error?.stack ?? '');
    for (const line of stack.split('\n')) {
      const match = line.match(/(file:\/\/\/[^():\s]+|(?:[A-Za-z]:)?[/\\][^():\s]+):(\d+):(\d+)/);
      if (!match) continue;
      const file = rel(match[1]);
      if (file) return { file, line: Number(match[2]) };
    }
    return {};
  };
  // Caught exceptions can opt into the same visualization without changing program behavior.
  globalThis.__vibeblocksTrace = {
    mark(message, file) { emit({ type: 'mark', message: String(message).slice(0, 400), ...(typeof file === 'string' && rel(file) ? { file: rel(file) } : {}) }); },
    error(error) { emit({ type: 'error', message: String(error?.message ?? error).slice(0, 400), ...loc(error) }); },
  };
  process.on('uncaughtExceptionMonitor', (error) => globalThis.__vibeblocksTrace.error(error));
  const session = new inspector.Session();
  try {
    session.connect();
    session.post('Profiler.enable', {}, (err) => {
      if (err) return;
      session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: true }, (error) => {
        if (error) return;
        const sample = () => session.post('Profiler.takePreciseCoverage', {}, (problem, result) => {
          if (problem || !result?.result) return;
          for (const script of result.result) {
            const file = rel(script.url);
            if (!file) continue;
            // Prefer the outer function range count, rather than summing nested source ranges.
            const count = script.functions.reduce((sum, fn) => sum + (fn.ranges[0]?.count ?? 0), 0);
            if (count > 0) emit({ type: 'activity', file, count });
          }
        });
        const timer = setInterval(sample, 700);
        timer.unref();
        process.once('beforeExit', sample);
      });
    });
  } catch { /* optional instrumentation must be safe in restricted runtimes */ }
}
