import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import YAML from 'yaml';
import { applyOps } from '../src/model/ops';
import { emptyModel, type Model } from '../src/model/schema';
import { repoReader, validate } from '../src/model/validate';
import { coverage } from '../src/model/coverage';
import { loadModel, loadProposal, saveModel } from '../src/model/store';
import { applyProposal, approveProposal, discardProposal, getViews, mapSnapshot, proposeChange, readCode, updateModel } from '../src/service';
import { openInBrowser } from '../src/browser';

const repo = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeblocks-security-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'one.ts'), 'export function one() { return 1; }\n');
  return root;
};
const clean = (root: string) => fs.rmSync(root, { recursive: true, force: true });

// These are contract tests of the real service, not the precompiled VSIX bundle.
test('an inherited Object method can never be an operation', () => {
  const r = applyOps(emptyModel(), [{ op: 'toString' }], null);
  assert.equal(r.model, undefined);
  assert.match(r.errors[0].message, /unknown op/);
});

test('the source reader refuses symlinks that leave the project root', (t) => {
  const root = repo(), outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeblocks-secret-'));
  t.after(() => { clean(root); clean(outside); });
  fs.writeFileSync(path.join(outside, 'secret.ts'), 'export const SECRET = "private";');
  try { fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(root, 'src', 'escape.ts')); }
  catch (e) { if (['EPERM', 'EACCES'].includes((e as NodeJS.ErrnoException).code ?? '')) { t.skip('Symlinks not available on this platform'); return; } throw e; }
  assert.equal(repoReader(root)('src/escape.ts'), null);
  assert.equal(repoReader(root)('../secret.ts'), null);
  assert.match(readCode(root, 'src/escape.ts').error ?? '', /cannot be read/);
});

test('oversized and binary source files cannot be read', (t) => {
  const root = repo(); t.after(() => clean(root));
  fs.writeFileSync(path.join(root, 'src', 'binary.ts'), Buffer.from([0, 1, 2]));
  fs.writeFileSync(path.join(root, 'src', 'huge.ts'), 'x'.repeat(2_000_001));
  assert.equal(repoReader(root)('src/binary.ts'), null);
  assert.equal(repoReader(root)('src/huge.ts'), null);
});

test('a symbol mentioned only in a comment does not validate', (t) => {
  const root = repo(); t.after(() => clean(root));
  fs.writeFileSync(path.join(root, 'src', 'one.ts'), '// class Pretend {}\nexport function one() {}\n');
  const r = validate({ system: { id: 'demo', name: 'Demo' }, containers: [{ id: 'app', name: 'App', type: 'api', components: [{ id: 'part', name: 'Part', code: [{ file: 'src/one.ts', symbol: 'Pretend' }] }] }] }, repoReader(root));
  assert.match(r.errors.map((e) => e.message).join(' '), /Pretend/);
  assert.equal(readCode(root, 'src/one.ts', 'one').start, 2);
});

test('approval is required and a pending proposal blocks out-of-band model operations', (t) => {
  const root = repo(); t.after(() => clean(root));
  saveModel(root, emptyModel('demo', 'Demo'));
  const proposed = proposeChange(root, 'Add a user', [{ op: 'add_person', id: 'visitor', name: 'Visitor' }]);
  assert.equal(proposed.saved, true);
  const before = fs.readFileSync(path.join(root, '.vibeblocks/model.yaml'), 'utf8');
  assert.equal(applyProposal(root).saved, false);
  assert.equal(updateModel(root, [{ op: 'add_external', id: 'outside', name: 'Outside' }]).saved, false);
  assert.equal(fs.readFileSync(path.join(root, '.vibeblocks/model.yaml'), 'utf8'), before);
  assert.equal(approveProposal(root, 'not-the-id').saved, false);
  assert.ok('id' in proposed);
  assert.equal(approveProposal(root, proposed.id).saved, true);
  assert.equal(applyProposal(root).saved, true);
  assert.equal(loadProposal(root), null);
  assert.ok(loadModel(root)?.model?.people.some((p) => p.id === 'visitor'));
});

test('an external model change makes a proposal unapprovable', (t) => {
  const root = repo(); t.after(() => clean(root));
  saveModel(root, emptyModel('demo', 'Demo'));
  const proposal = proposeChange(root, 'Add a person', [{ op: 'add_person', id: 'visitor', name: 'Visitor' }]);
  const model = emptyModel('demo', 'Changed');
  saveModel(root, model);
  assert.ok('id' in proposal);
  assert.equal(approveProposal(root, proposal.id).saved, false);
  assert.equal(applyProposal(root).saved, false);
});

test('malformed proposal is quarantined and never executed', (t) => {
  const root = repo(); t.after(() => clean(root));
  saveModel(root, emptyModel('demo', 'Demo'));
  fs.writeFileSync(path.join(root, '.vibeblocks', 'proposal.yaml'), 'summary: bad\nops: this-is-not-a-list\n');
  assert.equal(loadProposal(root), null);
  assert.equal(applyProposal(root).saved, false);
  assert.ok(fs.readdirSync(path.join(root, '.vibeblocks')).some((name) => name.startsWith('proposal.yaml.invalid-')));
});

test('root-wide mappings do not count and detached components get warnings', (t) => {
  const root = repo(); t.after(() => clean(root));
  const model: Model = {
    version: 1, system: { id: 'demo', name: 'Demo', description: '' },
    people: [{ id: 'human', name: 'Human', description: '' }], externals: [],
    containers: [{ id: 'app', name: 'App', type: 'api', description: 'App', components: [{ id: 'unused', name: 'Unused', description: 'Unused', code: [{ file: 'src/one.ts' }] }] }],
    relationships: [{ from: 'human', to: 'app', kind: 'uses', description: 'visits' }],
  };
  assert.match(validate(model, repoReader(root)).warnings.map((w) => w.message).join(' '), /component "Unused" has no arrows/);
  model.containers[0].components[0].code = [{ file: './' }];
  assert.equal(coverage(root, model).mapped, 0);
  assert.ok(validate(model, repoReader(root)).errors.length > 0);
});

test('new source files invalidate cached folder views, and metadata exports omit source', async (t) => {
  const root = repo(); t.after(() => clean(root));
  const model = emptyModel('demo', 'Demo');
  model.containers.push({ id: 'app', name: 'App', type: 'api', description: '', components: [{ id: 'one-part', name: 'One', description: '', code: [{ file: 'src/' }] }] });
  saveModel(root, model);
  const first = await getViews(root);
  assert.ok('model' in first);
  assert.deepEqual((first as any).model.containers[0].components[0].code.map((c: any) => c.file), ['src/one.ts']);
  fs.writeFileSync(path.join(root, 'src', 'two.ts'), 'export const two = 2;');
  const second = await getViews(root);
  assert.ok('model' in second);
  assert.deepEqual((second as any).model.containers[0].components[0].code.map((c: any) => c.file), ['src/one.ts', 'src/two.ts']);
  const snap = await mapSnapshot(root, 0, false);
  assert.deepEqual(snap.read_code, {});
  assert.equal(snap.snapshot_info.complete, false);
});

test('browser blocks unauthorized requests and oversized requests', async (t) => {
  const root = repo(); t.after(() => clean(root));
  saveModel(root, emptyModel('demo', 'Demo'));
  const link = await openInBrowser(root, () => '<!doctype html><html></html>', false);
  const base = new URL(link).origin;
  const rejected = await fetch(`${base}/api/tool`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'get_views' }) });
  assert.equal(rejected.status, 403);
  const token = new URL(link).searchParams.get('token')!;
  const oversized = await fetch(`${base}/api/tool`, { method: 'POST', headers: { 'x-vibeblocks-token': token, 'content-type': 'application/json' }, body: 'x'.repeat(100_000) });
  assert.equal(oversized.status, 413);
});
