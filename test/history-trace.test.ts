import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { emptyModel } from '../src/model/schema';
import { saveModel, loadModel } from '../src/model/store';
import { getHistory, updateModel, undoModel, redoModel, restoreModel, proposeChange, discardProposal } from '../src/service';
import { getRuntimeTrace } from '../src/runtime/trace';

const setup = (t: TestContext) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeblocks-history-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'export function app() { return true; }\n');
  saveModel(root, emptyModel('demo', 'Demo'));
  return root;
};

test('history records every model update and undo/redo move the cursor without editing code', (t) => {
  const root = setup(t);
  const originalCode = fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8');
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'first', name: 'First user' }]).saved, true);
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'second', name: 'Second user' }]).saved, true);
  const versions = getHistory(root);
  assert.equal(versions.entries.length, 3);
  assert.equal(versions.canUndo, true);
  assert.equal(undoModel(root).saved, true);
  assert.deepEqual(loadModel(root)?.model?.people.map((p) => p.id), ['first']);
  assert.equal(redoModel(root).saved, true);
  assert.deepEqual(loadModel(root)?.model?.people.map((p) => p.id), ['first', 'second']);
  assert.equal(fs.readFileSync(path.join(root, 'src', 'app.ts'), 'utf8'), originalCode);
  const selected = versions.entries[0].id;
  assert.equal(restoreModel(root, selected).saved, true);
  assert.equal(loadModel(root)?.model?.people.length, 0);
  assert.equal(getHistory(root).canRedo, true);
});

test('new changes after undo create a branch and block restoring old redo revisions', (t) => {
  const root = setup(t);
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'first', name: 'First user' }]).saved, true);
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'second', name: 'Second user' }]).saved, true);
  const removedId = getHistory(root).entries.at(-1)!.id;
  assert.equal(undoModel(root).saved, true);
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'third', name: 'Third user' }]).saved, true);
  assert.equal(getHistory(root).canRedo, false);
  assert.equal(restoreModel(root, removedId).saved, false);
  assert.deepEqual(loadModel(root)?.model?.people.map((p) => p.id), ['first', 'third']);
});

test('pending proposals stop history restore', (t) => {
  const root = setup(t);
  assert.equal(updateModel(root, [{ op: 'add_person', id: 'first', name: 'First user' }]).saved, true);
  assert.equal(proposeChange(root, 'Change model', [{ op: 'add_person', id: 'second', name: 'Second user' }]).saved, true);
  assert.equal(undoModel(root).saved, false);
  discardProposal(root);
  assert.equal(undoModel(root).saved, true);
});

test('runtime trace reader rejects parent paths and retains mapped project events', (t) => {
  const root = setup(t);
  const dir = path.join(root, '.vibeblocks', 'traces');
  fs.mkdirSync(dir, { recursive: true });
  const id = '11111111-1111-4111-8111-111111111111';
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify({ id, started: 100 }));
  fs.writeFileSync(path.join(dir, `${id}.jsonl`), [
    { type: 'start', at: 100 },
    { type: 'activity', at: 101, file: 'src/app.ts', count: 9 },
    { type: 'activity', at: 101, file: '../outside.ts', count: 999 },
    { type: 'error', at: 102, file: 'src/app.ts', line: 1, message: 'oops' },
    { type: 'end', at: 103, exitCode: 1 },
  ].map((e) => JSON.stringify(e)).join('\n'));
  const result = getRuntimeTrace(root);
  assert.equal(result.available, true);
  assert.deepEqual(result.files, [{ file: 'src/app.ts', count: 9, errors: 1 }]);
  assert.equal(result.errorCount, 1);
  assert.equal(result.running, false);
});
