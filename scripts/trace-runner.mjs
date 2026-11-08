// Usage: npm run trace -- --root ./my-project -- node src/server.js
// Spawns the user's command with opt-in Node V8 coverage and error instrumentation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const settings = sep < 0 ? argv : argv.slice(0, sep);
const command = sep < 0 ? [] : argv.slice(sep + 1);
const at = settings.indexOf('--root');
if (at < 0 || !settings[at + 1] || !command.length) {
  console.error('Usage: npm run trace -- --root PATH -- node YOUR_ENTRY.js');
  console.error('For npm apps: npm run trace -- --root PATH -- npm run start');
  process.exit(2);
}
const root = fs.realpathSync(path.resolve(settings[at + 1]));
if (!fs.statSync(root).isDirectory()) throw new Error('Trace root must be a directory.');
const dir = path.join(root, '.vibeblocks', 'traces');
fs.mkdirSync(dir, { recursive: true });
const id = randomUUID(), log = path.join(dir, `${id}.jsonl`);
const emit = (event) => fs.appendFileSync(log, JSON.stringify({ at: Date.now(), ...event }) + '\n');
fs.writeFileSync(log, '', { flag: 'wx', mode: 0o600 });
fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ id, started: Date.now(), command: command.map((x) => x.includes(' ') ? JSON.stringify(x) : x).join(' ').slice(0, 180) }), { mode: 0o600 });
emit({ type: 'start' });
const preload = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'trace-preload.mjs')).href;
const extra = `--import=${preload}`;
const env = { ...process.env,
  VIBEBLOCKS_TRACE_ROOT: root, VIBEBLOCKS_TRACE_LOG: log,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, extra].filter(Boolean).join(' ') };
console.log(`[VibeBlocks] Tracing ${command.join(' ')} (project: ${root})`);
console.log(`[VibeBlocks] Open the map and select Trace to see activity and errors.`);
const commandName = process.platform === 'win32' && /^(npm|npx)$/i.test(command[0]) ? `${command[0]}.cmd` : command[0];
const child = spawn(commandName, command.slice(1), { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(commandName) });
const heartbeat = setInterval(() => { if (!finished) emit({ type: 'heartbeat' }); }, 1500);
heartbeat.unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
let finished = false;
const stop = (code) => {
  if (finished) return;
  finished = true;
  clearInterval(heartbeat);
  emit({ type: 'end', exitCode: code ?? 1 });
  process.exitCode = code ?? 1;
};
child.on('error', (e) => { console.error(`[VibeBlocks] Cannot run: ${e.message}`); stop(1); });
child.on('close', (code) => stop(code));
