// C4 rules the schema cannot express, plus checks that the model points at real code.
//
// errors   = the model is wrong; a change that produces any error is refused as a whole
// warnings = style (naming, size); saved anyway and reported back so the agent can improve them
//
// Messages say what to do, because they go straight back to the agent.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DATA_STORE_TYPES, ElementRef, Model, ancestry, elements } from './schema';

export interface Issue { path: string; message: string }
export interface Validation { model?: Model; errors: Issue[]; warnings: Issue[] }

/** Reads files relative to the repo root; null if missing. Injected so tests and proposals can fake it. */
export type FileReader = (file: string) => string | null;

export function repoReader(root: string): FileReader {
  const base = path.resolve(root);
  return (file) => {
    const abs = path.resolve(base, file);
    if (abs !== base && !abs.startsWith(base + path.sep)) return null;
    try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
  };
}

export function validate(raw: unknown, read: FileReader | null): Validation {
  const parsed = Model.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })), warnings: [] };
  }
  const m = parsed.data;
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (p: string, message: string) => errors.push({ path: p, message });
  const warn = (p: string, message: string) => warnings.push({ path: p, message });

  // ---- ids are unique across the whole model
  const seen = new Map<string, string>();
  const claim = (id: string, where: string) => {
    if (seen.has(id)) err(where, `id "${id}" is already used by ${seen.get(id)}. Ids must be unique across the model.`);
    else seen.set(id, where);
  };
  claim(m.system.id, 'system');
  m.people.forEach((p, i) => claim(p.id, `people[${i}]`));
  m.externals.forEach((e, i) => claim(e.id, `externals[${i}]`));
  m.containers.forEach((c, i) => {
    claim(c.id, `containers[${i}]`);
    c.components.forEach((k, j) => claim(k.id, `containers[${i}].components[${j}]`));
  });

  // ---- names are unique among siblings
  const uniqueNames = (items: { name: string }[], where: string, what: string) => {
    const names = new Map<string, number>();
    items.forEach((it, i) => {
      const key = it.name.toLowerCase();
      if (names.has(key)) err(`${where}[${i}]`, `two ${what} are both named "${it.name}". Names must be unique within their parent.`);
      else names.set(key, i);
    });
  };
  uniqueNames([m.system, ...m.people, ...m.externals], '(top level)', 'top-level elements');
  uniqueNames(m.containers, 'containers', 'containers');
  m.containers.forEach((c, i) => uniqueNames(c.components, `containers[${i}].components`, `components of "${c.name}"`));

  // ---- containers and components
  m.containers.forEach((c, i) => {
    const where = `containers[${i}]`;
    if (DATA_STORE_TYPES.has(c.type) && c.components.length)
      err(`${where}.components`, `"${c.name}" is a ${c.type}: data stores hold data, not code, so they have no components. Remove its components or change its type.`);
    if (c.path && read && !dirExists(read, c.path))
      warn(`${where}.path`, `folder "${c.path}" was not found in the repo.`);
    if (!c.description) warn(where, `"${c.name}" has no description. Say in one sentence what it does.`);
    if (c.components.length > 9) warn(where, `"${c.name}" has ${c.components.length} components. Aim for 3-7: merge related ones.`);
    c.components.forEach((k, j) => {
      const kw = `${where}.components[${j}]`;
      if (!k.description) warn(kw, `"${k.name}" has no description. Say in one sentence what it does for the user or the data.`);
      if (looksLikeCode(k.name)) warn(kw, `"${k.name}" looks like a file or code name. Name components by responsibility in 2-4 plain words ("Orders", "Login & sessions").`);
      else if (k.name.split(/\s+/).length > 5) warn(kw, `"${k.name}" is long. Use 2-4 plain words.`);
      if (!k.code.length) warn(kw, `"${k.name}" points at no code yet (shown as not built).`);
      k.code.forEach((r, n) => checkRef(r, `${kw}.code[${n}]`));
    });
  });

  // ---- relationships
  const els = elements(m);
  const relKeys = new Set<string>();
  m.relationships.forEach((r, i) => {
    const where = `relationships[${i}]`;
    const a = els.get(r.from), b = els.get(r.to);
    if (!a) err(`${where}.from`, `no element with id "${r.from}".`);
    if (!b) err(`${where}.to`, `no element with id "${r.to}".`);
    if (!a || !b) return;
    if (a.id === b.id) { err(where, `"${a.name}" cannot have a relationship with itself.`); return; }
    if (ancestry(a.id, els).includes(b.id) || ancestry(b.id, els).includes(a.id)) {
      err(where, `"${a.name}" and "${b.name}" are parent and child; C4 does not allow relationships between them. Point the arrow at a sibling or at something outside.`);
      return;
    }
    kindRules(r.kind, a, b, (msg) => err(`${where}.kind`, msg));
    const key = `${r.from}|${r.to}|${r.description.toLowerCase()}`;
    if (relKeys.has(key)) warn(where, `duplicate relationship ${r.from} -> ${r.to} "${r.description}".`);
    relKeys.add(key);
    r.evidence?.forEach((ref, n) => checkRef(ref, `${where}.evidence[${n}]`));
  });

  // ---- every box takes part in at least one arrow (a container counts if one of its components does)
  const touched = new Set(m.relationships.flatMap((r) => [r.from, r.to]));
  const lonely = (id: string, where: string, name: string, what: string) => {
    if (!touched.has(id)) warn(where, `${what} "${name}" has no arrows. Connect it to what uses it or what it calls, or merge it into the component that uses it.`);
  };
  m.people.forEach((p, i) => lonely(p.id, `people[${i}]`, p.name, 'person'));
  m.externals.forEach((x, i) => lonely(x.id, `externals[${i}]`, x.name, 'external system'));
  m.containers.forEach((c, i) => {
    if (c.components.some((k) => touched.has(k.id))) c.components.forEach((k, j) => lonely(k.id, `containers[${i}].components[${j}]`, k.name, 'component'));
    else lonely(c.id, `containers[${i}]`, c.name, 'container');
  });

  return { model: m, errors, warnings };

  function checkRef(r: { file: string; symbol?: string }, where: string) {
    if (!read) return;
    const text = read(r.file);
    if (text === null) { err(where, `file "${r.file}" does not exist (paths are relative to the repo root).`); return; }
    if (r.symbol && !new RegExp(`\\b${escapeRe(r.symbol)}\\b`).test(text))
      err(where, `"${r.symbol}" does not appear in ${r.file}. Use the exact class, function or constant name.`);
  }
}

function kindRules(kind: string, a: ElementRef, b: ElementRef, fail: (m: string) => void) {
  const isStore = (e: ElementRef) => e.kind === 'container' && DATA_STORE_TYPES.has((e.el as { type: any }).type);
  const containerOf = (e: ElementRef) => (e.kind === 'component' ? e.parent : e.kind === 'container' ? e.id : undefined);
  if (a.kind === 'person' && kind !== 'uses') fail(`relationships from a person ("${a.name}") must have kind "uses".`);
  if (kind === 'uses' && a.kind !== 'person') fail(`only people "use" things; "${a.name}" is a ${a.kind}. Use request, command, event, data or internal.`);
  if (b.kind === 'person') fail(`"${b.name}" is a person; arrows go from people to what they use, not to people. Reverse it.`);
  if (kind === 'data' && !isStore(b)) fail(`kind "data" is for reading/writing a data store, but "${b.name}" is not a database, cache, queue, storage or search container.`);
  if (isStore(b) && kind !== 'data') fail(`"${b.name}" is a data store; arrows into it have kind "data".`);
  if (kind === 'external' && b.kind !== 'external') fail(`kind "external" is for calls to a third-party system, but "${b.name}" is a ${b.kind}.`);
  if (b.kind === 'external' && kind !== 'external' && a.kind !== 'person') fail(`"${b.name}" is an external system; arrows to it have kind "external".`);
  if (kind === 'internal') {
    const ca = containerOf(a), cb = containerOf(b);
    if (a.kind !== 'component' || b.kind !== 'component' || ca !== cb)
      fail(`kind "internal" is for one component calling another inside the same container. "${a.name}" and "${b.name}" are not.`);
  }
}

function dirExists(read: FileReader, dir: string): boolean {
  // the reader only reads files; treat a folder as present if any common manifest or index sits in it
  return ['package.json', 'pyproject.toml', 'index.ts', 'index.js', 'main.py', 'go.mod', 'Cargo.toml', 'schema.sql'].some((f) => read(path.posix.join(dir, f)) !== null);
}

function looksLikeCode(name: string): boolean {
  return /\.[a-z]{1,4}$/i.test(name) || name.includes('/') || /^[a-z]+[A-Z]\w*$/.test(name) || /^[A-Z][a-z]+[A-Z]\w*$/.test(name) || /_/.test(name);
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
