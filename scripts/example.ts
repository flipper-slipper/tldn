// Work with the example projects and their reference models (example-projects/references/<name>.yaml).
//   npm run example -- list               the examples and whether each has a map drawn right now
//   npm run example -- reset <name>       delete the example's .vibeblocks/ so an agent can map it fresh
//   npm run example -- compare <name>     the agent's map next to the reference, as plain lines
//   npm run example -- reference <name>   open the reference in the dev page (a temporary copy; the example is untouched)
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import YAML from 'yaml';
import { Model } from '../src/model/schema';
import { readback } from '../src/model/readback';
import { coverage } from '../src/model/coverage';

const base = path.resolve(import.meta.dirname, '..', 'example-projects');
const refFile = (name: string) => path.join(base, 'references', `${name}.yaml`);
const mapFile = (name: string) => path.join(base, name, '.vibeblocks', 'model.yaml');
const names = () => fs.readdirSync(base).filter((n) => n !== 'references' && fs.statSync(path.join(base, n)).isDirectory());
const load = (file: string) => Model.parse(YAML.parse(fs.readFileSync(file, 'utf8')));

const [cmd, name] = process.argv.slice(2);
const need = () => {
  if (!name || !names().includes(name)) { console.error(`Which example? ${names().join(', ')}`); process.exit(1); }
  return name;
};

if (!cmd || cmd === 'list') {
  for (const n of names()) console.log(`${n.padEnd(18)} reference: ${fs.existsSync(refFile(n)) ? 'yes' : 'no '}   map drawn: ${fs.existsSync(mapFile(n)) ? 'yes' : 'no'}`);
} else if (cmd === 'reset') {
  const n = need();
  fs.rmSync(path.join(base, n, '.vibeblocks'), { recursive: true, force: true });
  console.log(`${n} has no map now. Ask your agent to map example-projects/${n}.`);
} else if (cmd === 'compare') {
  const n = need();
  const show = (title: string, file: string) => {
    if (!fs.existsSync(file)) { console.log(`== ${title}: none (${path.relative(process.cwd(), file)})\n`); return; }
    const m = load(file);
    const cov = coverage(path.join(base, n), m);
    const comps = m.containers.reduce((s, c) => s + c.components.length, 0);
    console.log(`== ${title}: ${m.containers.length} containers, ${comps} components, ${m.relationships.length} arrows, ${cov.mapped}/${cov.total} source files on the map`);
    console.log(readback(m));
    for (const c of m.containers) for (const k of c.components)
      console.log(`  · ${c.name} / ${k.name}: ${k.code.map((r) => r.file + (r.symbol ? `#${r.symbol}` : '')).join(', ') || '(no code)'}`);
    console.log();
  };
  show('Agent map', mapFile(n));
  show('Reference', refFile(n));
} else if (cmd === 'reference') {
  const n = need();
  if (!fs.existsSync(refFile(n))) { console.error(`No reference for ${n} yet.`); process.exit(1); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `vb-ref-${n}-`));
  fs.cpSync(path.join(base, n), tmp, { recursive: true, filter: (src) => !src.includes(`${path.sep}.vibeblocks`) });
  fs.mkdirSync(path.join(tmp, '.vibeblocks'));
  fs.copyFileSync(refFile(n), path.join(tmp, '.vibeblocks', 'model.yaml'));
  console.log(`Reference for ${n} (temporary copy at ${tmp}).`);
  spawn(process.execPath, ['--import', 'tsx', path.resolve(import.meta.dirname, '..', 'dev', 'serve.ts'), tmp], { stdio: 'inherit', env: process.env });
} else {
  console.error('Commands: list, reset <name>, compare <name>, reference <name>');
  process.exit(1);
}
