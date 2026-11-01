// Which source files the model points at. Code refs make every box point at real code; coverage
// checks the other direction, so a whole folder of the repo cannot be quietly left off the map.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DATA_STORE_TYPES, Model } from './schema';

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|kt|swift|rb|php|cs|c|cc|cpp|h|hpp|m|scala|ex|exs|dart|sql|prisma|graphql|proto)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage', '__pycache__', 'venv', '.venv', 'test', 'tests', '__tests__', 'spec', 'e2e', 'examples', 'docs']);
const SKIP_FILES = /(\.(test|spec|stories|d)\.[a-z]+$)|(^|\/)(vite|vitest|jest|webpack|rollup|eslint|prettier|tailwind|postcss|babel|next|nuxt|svelte|astro|playwright)\.config\.[a-z]+$/i;
const MAX_FILES = 5000;

export interface Coverage { total: number; mapped: number; unmapped: string[] }

/** Source files in the repo, relative and with forward slashes. Skips hidden folders, deps, builds and tests. */
export function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_FILES || e.name.startsWith('.')) continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(rel); }
      else if (SOURCE.test(e.name) && !SKIP_FILES.test(rel)) out.push(rel);
    }
  };
  walk('');
  return out;
}

/** A file is on the map if a component (or relationship evidence) points at it, or it sits in a data store's folder. */
export function coverage(root: string, m: Model): Coverage {
  const files = sourceFiles(root);
  const refs = new Set<string>();
  for (const c of m.containers) for (const k of c.components) for (const r of k.code) refs.add(norm(r.file));
  for (const r of m.relationships) for (const e of r.evidence ?? []) refs.add(norm(e.file));
  const storeDirs = m.containers.filter((c) => DATA_STORE_TYPES.has(c.type) && c.path).map((c) => norm(c.path!).replace(/\/?$/, '/'));
  const unmapped = files.filter((f) => !refs.has(f) && !storeDirs.some((d) => d === './' || f.startsWith(d)));
  return { total: files.length, mapped: files.length - unmapped.length, unmapped };
}

const norm = (f: string) => f.replace(/\\/g, '/').replace(/^\.\//, '');

/** The warning the agent sees, or null when every source file is on the map. */
export function coverageWarning(c: Coverage): { path: string; message: string } | null {
  if (!c.unmapped.length) return null;
  const list = c.unmapped.slice(0, 20).join(', ') + (c.unmapped.length > 20 ? ` and ${c.unmapped.length - 20} more` : '');
  return {
    path: 'coverage',
    message: `${c.unmapped.length} of ${c.total} source files are not on the map: ${list}. Add each to the code of the component it belongs to (or a new component); a data store's files count if you set its container "path".`,
  };
}
