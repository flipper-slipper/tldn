// Tool handlers shared by the MCP server and the dev page. Each takes the repo root.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Model, emptyModel } from './model/schema';
import { applyOps } from './model/ops';
import { repoReader } from './model/validate';
import { coverage, coverageWarning } from './model/coverage';
import { readback } from './model/readback';
import { loadModel, loadProposal, saveModel, saveProposal } from './model/store';
import { computeViews } from './engine/likec4';
import type { Views } from './engine/types';

export function resolveRoot(p?: string): string {
  const root = path.resolve(p || process.env.VIBEBLOCKS_ROOT || process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`"${root}" is not a folder. Pass the project folder as "path".`);
  return root;
}

export function getModel(root: string) {
  const l = loadModel(root);
  if (!l) return { exists: false, root, note: 'No model yet. Read the code, then call update_model with the full set of ops (see get_guide).' };
  const warnings = l.model ? withCoverage(root, l.model, l.warnings) : l.warnings;
  return { exists: true, root, model: l.model ?? l.raw, errors: l.errors, warnings, proposal: loadProposal(root) };
}

export function updateModel(root: string, ops: unknown[]) {
  const l = loadModel(root);
  if (l && !l.model) return { saved: false, errors: l.errors, note: 'model.yaml is invalid; fix it by hand or delete it, then try again.' };
  const base = l?.model ?? emptyModel(slug(path.basename(root)), path.basename(root));
  const r = applyOps(base, ops, repoReader(root));
  if (r.errors.length || !r.model) return { saved: false, errors: r.errors, note: 'Nothing was saved. Fix every error and send the whole batch again.' };
  saveModel(root, r.model);
  invalidate(root);
  return { saved: true, applied: r.applied, warnings: withCoverage(root, r.model, r.warnings), map: readback(r.model) };
}

export function proposeChange(root: string, summary: string, ops: unknown[]) {
  const l = loadModel(root);
  if (!l?.model) return { saved: false, errors: [{ path: 'model', message: 'There is no valid model to propose a change to. Draw it first with update_model.' }] };
  // code for the proposal does not exist yet, so only structure is checked here
  const r = applyOps(l.model, ops, null);
  if (r.errors.length) return { saved: false, errors: r.errors };
  saveProposal(root, { summary, ops, created: new Date().toISOString() });
  invalidate(root);
  return { saved: true, warnings: r.warnings, note: 'Shown dashed on the diagram. Wait for the user to approve before editing code.' };
}

export function applyProposal(root: string) {
  const p = loadProposal(root);
  if (!p) return { saved: false, errors: [{ path: 'proposal', message: 'There is no open proposal.' }] };
  const r = updateModel(root, p.ops);
  if (r.saved) { saveProposal(root, null); invalidate(root); }
  return r;
}

export function discardProposal(root: string) {
  saveProposal(root, null);
  invalidate(root);
  return { discarded: true };
}

function withCoverage<T>(root: string, m: Model, warnings: T[]): (T | { path: string; message: string })[] {
  const w = coverageWarning(coverage(root, m));
  return w ? [...warnings, w] : warnings;
}

/** What show_map tells the agent: a line about where, then the readback. */
export function mapSummary(root: string): string | null {
  const l = loadModel(root);
  if (!l?.model) return null;
  const p = loadProposal(root);
  return [
    `Showing the C4 map of ${l.model.system.name} (${root}).`,
    readback(l.model),
    p ? `Open proposal (drawn dashed): ${p.summary}` : '',
    l.errors.length ? `The model has ${l.errors.length} errors; call get_model.` : '',
  ].filter(Boolean).join('\n');
}

// ---- views, cached until the model or proposal changes
const cache = new Map<string, { stamp: string; views: Promise<Views> }>();
const invalidate = (root: string) => cache.delete(root);

export async function getViews(root: string): Promise<Views & { errors?: unknown[] } | { empty: true; root: string; errors?: unknown[] }> {
  const l = loadModel(root);
  if (!l) return { empty: true, root };
  if (!l.model) return { empty: true, root, errors: l.errors };
  const p = loadProposal(root);
  const stamp = JSON.stringify([l.model, p]);
  let hit = cache.get(root);
  if (!hit || hit.stamp !== stamp) {
    let proposed: { model: any; summary: string } | undefined;
    if (p) {
      const r = applyOps(l.model, p.ops, null);
      if (r.model) proposed = { model: r.model, summary: p.summary };
    }
    hit = { stamp, views: computeViews(l.model, proposed) };
    cache.set(root, hit);
  }
  return hit.views;
}

/** A file's text plus the line range of a symbol in it, for the Code level. */
export function readCode(root: string, file: string, symbol?: string) {
  const text = repoReader(root)(file);
  if (text === null) return { error: `No file ${file} in this repo.` };
  const lines = text.split('\n');
  let start = -1, end = -1;
  if (symbol) {
    const decl = new RegExp(`\\b(class|function|const|let|var|def|interface|type|enum)\\s+${symbol.replace(/[^\w$]/g, '')}\\b`);
    start = lines.findIndex((l) => decl.test(l));
    if (start < 0) start = lines.findIndex((l) => new RegExp(`\\b${symbol.replace(/[^\w$]/g, '')}\\b`).test(l));
    if (start >= 0) end = blockEnd(lines, start);
  }
  return { file, text, start: start + 1 || undefined, end: end >= 0 ? end + 1 : undefined };
}

function blockEnd(lines: string[], start: number): number {
  let depth = 0, opened = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i].replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')) {
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    if (opened && depth <= 0) return i;
    if (!opened && i > start && /\S/.test(lines[i]) && !/^\s/.test(lines[i])) return i - 1; // python-style: next unindented line
  }
  return lines.length - 1;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 's$1') || 'system';
