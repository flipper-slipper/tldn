// Immutable model snapshots with a movable undo/redo cursor. This deliberately
// tracks the diagram, not arbitrary source edits (those belong in Git).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';
import type { Model } from './schema';
import { modelHash, saveModel } from './store';
import { repoReader, validate } from './validate';

const Entry = z.strictObject({
  id: z.string().uuid(),
  at: z.string(),
  label: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
const Index = z.strictObject({ version: z.literal(1), cursor: z.number().int().min(0), entries: z.array(Entry).min(1).max(100) });
type Index = z.infer<typeof Index>;
export type HistoryEntry = z.infer<typeof Entry>;
const directory = (root: string) => path.join(root, '.vibeblocks', 'history');
const indexPath = (root: string) => path.join(directory(root), 'index.json');
const snapshotPath = (root: string, id: string) => path.join(directory(root), `revision-${id}.yaml`);
const MAX_VERSIONS = 50;

function atomicWrite(dest: string, contents: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = `${dest}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, contents, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, dest);
  } finally { fs.rmSync(temp, { force: true }); }
}
function loadIndex(root: string): Index | null {
  try {
    const i = Index.parse(JSON.parse(fs.readFileSync(indexPath(root), 'utf8')));
    if (i.cursor >= i.entries.length) throw new Error('History cursor is out of range.');
    return i;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Model history could not be read: ${(e as Error).message}. No history was overwritten.`);
  }
}
function newEntry(root: string, model: Model, label: string): HistoryEntry {
  const entry = { id: randomUUID(), at: new Date().toISOString(), label, hash: modelHash(model) };
  atomicWrite(snapshotPath(root, entry.id), YAML.stringify(model, { lineWidth: 0 }));
  return entry;
}
function initialize(root: string, current: Model | null): Index | null {
  let index = loadIndex(root);
  if (index) return index;
  const entries: HistoryEntry[] = [];
  // Migrate safe, existing pre-history backups rather than discarding them.
  let old: string[] = [];
  try { old = fs.readdirSync(directory(root)).filter((n) => /^model-\d+-[\w-]+\.yaml$/.test(n)).sort(); }
  catch { /* a new repository */ }
  for (const name of old.slice(-MAX_VERSIONS + 1)) {
    try {
      const raw = YAML.parse(fs.readFileSync(path.join(directory(root), name), 'utf8'));
      const r = validate(raw, null);
      if (r.model && !r.errors.length && modelHash(r.model) !== entries.at(-1)?.hash)
        entries.push(newEntry(root, r.model, 'Imported earlier backup'));
    } catch { /* ignore a broken historical snapshot, never use it to overwrite the current model */ }
  }
  if (current && modelHash(current) !== entries.at(-1)?.hash) entries.push(newEntry(root, current, 'Initial model'));
  if (!entries.length) return null;
  index = { version: 1, cursor: entries.length - 1, entries };
  atomicWrite(indexPath(root), JSON.stringify(index, null, 2));
  return index;
}
function checkedCurrent(index: Index, current: Model | null) {
  if (!current || modelHash(current) !== index.entries[index.cursor].hash)
    throw new Error('The model was modified outside VibeBlocks history. Save a new model update before using undo/redo.');
}
export function recordModelRevision(root: string, before: Model | null, after: Model, label: string): void {
  let index = initialize(root, before);
  // If the user edited model.yaml manually, preserve that valid state as a
  // separate revision before recording the next agent-driven change.
  if (index && before && modelHash(before) !== index.entries[index.cursor].hash) {
    const oldRedo = index.entries.slice(index.cursor + 1);
    const entries = [...index.entries.slice(0, index.cursor + 1), newEntry(root, before, 'External model edit')];
    const old = entries.splice(0, Math.max(0, entries.length - MAX_VERSIONS));
    index = { version: 1, cursor: entries.length - 1, entries };
    atomicWrite(indexPath(root), JSON.stringify(index, null, 2));
    for (const e of [...old, ...oldRedo]) fs.rmSync(snapshotPath(root, e.id), { force: true });
  }
  if (!index) {
    const first = newEntry(root, after, label);
    atomicWrite(indexPath(root), JSON.stringify({ version: 1, cursor: 0, entries: [first] }, null, 2));
    return;
  }
  if (modelHash(after) === index.entries[index.cursor].hash) return;
  // A new edit after undo creates a new branch; discard only the inaccessible redo branch.
  const dropped = index.entries.slice(index.cursor + 1);
  const entries = [...index.entries.slice(0, index.cursor + 1), newEntry(root, after, label)];
  const old = entries.splice(0, Math.max(0, entries.length - MAX_VERSIONS));
  const next = { version: 1 as const, cursor: entries.length - 1, entries };
  atomicWrite(indexPath(root), JSON.stringify(next, null, 2));
  for (const x of [...old, ...dropped]) fs.rmSync(snapshotPath(root, x.id), { force: true });
}
export function getModelHistory(root: string, current: Model | null) {
  const index = loadIndex(root);
  if (!index) {
    return { entries: current ? [{ id: 'current', at: '', label: 'Current model', hash: modelHash(current) }] : [],
      cursor: current ? 0 : -1, canUndo: false, canRedo: false, externalChanges: false, note: 'History begins after the next saved model change. Source code is not included.' };
  }
  return { entries: index.entries, cursor: index.cursor, canUndo: index.cursor > 0,
    canRedo: index.cursor < index.entries.length - 1, externalChanges: !current || modelHash(current) !== index.entries[index.cursor].hash,
    note: 'Undo and restore affect the architecture model only, not source files.' };
}
export function navigateModelHistory(root: string, current: Model | null, target: 'undo' | 'redo' | string) {
  const index = initialize(root, current);
  if (!index) throw new Error('No model versions have been saved yet.');
  checkedCurrent(index, current);
  const n = target === 'undo' ? index.cursor - 1 : target === 'redo' ? index.cursor + 1 : index.entries.findIndex((e) => e.id === target);
  if (n < 0 || n >= index.entries.length) throw new Error(target === 'undo' ? 'Nothing to undo.' : target === 'redo' ? 'Nothing to redo.' : 'That model revision is not available.');
  const entry = index.entries[n];
  const raw = YAML.parse(fs.readFileSync(snapshotPath(root, entry.id), 'utf8'));
  const r = validate(raw, repoReader(root));
  if (!r.model || r.errors.length || modelHash(r.model) !== entry.hash)
    throw new Error('This version is incompatible with the current source files or its history file is damaged. Nothing was restored.');
  saveModel(root, r.model);
  atomicWrite(indexPath(root), JSON.stringify({ ...index, cursor: n }, null, 2));
  return { saved: true, version: entry, cursor: n, canUndo: n > 0, canRedo: n < index.entries.length - 1 };
}
