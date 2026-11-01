import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { emptyModel, Model } from '../src/model/schema';
import { applyOps } from '../src/model/ops';
import { repoReader, validate } from '../src/model/validate';
import { ACME_OPS, VOICE_SEARCH } from './acme';

const root = path.resolve(import.meta.dirname, '..', 'example-projects', 'acme-shop');
const read = repoReader(root);
const acme = (): Model => {
  const r = applyOps(emptyModel('acme-shop', 'acme-shop'), ACME_OPS, read);
  assert.deepEqual(r.errors, []);
  return r.model!;
};
const errorsOf = (ops: unknown[], base = acme()) => applyOps(base, ops, read).errors.map((e) => e.message).join('\n');

test('acme-shop builds with no errors or warnings', () => {
  const r = applyOps(emptyModel('acme-shop', 'acme-shop'), ACME_OPS, read);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.applied, ACME_OPS.length);
});

test('components cannot exist outside a container (the schema has nowhere to put them)', () => {
  const raw = { system: { id: 's', name: 'S' }, components: [{ id: 'c', name: 'C' }] };
  assert.match(validate(raw, null).errors.map((e) => e.message).join(), /Unrecognized key/);
});

test('data stores have no components', () => {
  assert.match(errorsOf([{ op: 'add_component', container: 'db', id: 'x', name: 'Stored procs', code: [] }]), /data stores hold data, not code/);
});

test('no relationship between parent and child', () => {
  assert.match(errorsOf([{ op: 'add_relationship', from: 'api', to: 'orders', kind: 'internal', description: 'owns' }]), /parent and child/);
});

test('names are unique among siblings and ids across the model', () => {
  assert.match(errorsOf([{ op: 'add_component', container: 'api', id: 'orders-2', name: 'Orders', code: [] }]), /both named "Orders"/);
  assert.match(errorsOf([{ op: 'add_component', container: 'web', id: 'orders', name: 'Order list', code: [] }]), /already used/);
});

test('relationship kinds must fit their ends', () => {
  assert.match(errorsOf([{ op: 'add_relationship', from: 'orders', to: 'db', kind: 'request', description: 'x' }]), /data store/);
  assert.match(errorsOf([{ op: 'add_relationship', from: 'orders', to: 'stripe', kind: 'request', description: 'x' }]), /external system/);
  assert.match(errorsOf([{ op: 'add_relationship', from: 'orders', to: 'shopper', kind: 'event', description: 'x' }]), /is a person/);
  assert.match(errorsOf([{ op: 'add_relationship', from: 'sign-in', to: 'orders', kind: 'internal', description: 'x' }]), /inside the same container/);
  assert.match(errorsOf([{ op: 'add_relationship', from: 'orders', to: 'payments', kind: 'uses', description: 'x' }]), /only people "use"/);
});

test('code references must exist', () => {
  assert.match(errorsOf([{ op: 'update', id: 'orders', set: { code: [{ file: 'api/nope.ts' }] } }]), /does not exist/);
  assert.match(errorsOf([{ op: 'update', id: 'orders', set: { code: [{ file: 'api/orders.ts', symbol: 'OrderServiceX' }] } }]), /does not appear/);
});

test('a batch with one bad op changes nothing', () => {
  const base = acme();
  const before = JSON.stringify(base);
  const r = applyOps(base, [{ op: 'add_component', container: 'api', id: 'ok', name: 'Fine one', code: [] }, { op: 'remove', id: 'ghost' }], read);
  assert.equal(r.model, undefined);
  assert.equal(r.applied, 0);
  assert.equal(JSON.stringify(base), before);
});

test('style problems are warnings, not errors', () => {
  const r = applyOps(acme(), [{ op: 'add_component', container: 'api', id: 'helpers', name: 'orderHelpers.ts', code: [] }], read);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /looks like a file or code name/);
});

test('a proposal is checked for structure but may point at code that does not exist yet', () => {
  assert.deepEqual(applyOps(acme(), VOICE_SEARCH.ops, null).errors, []);
  assert.match(applyOps(acme(), VOICE_SEARCH.ops, read).errors.map((e) => e.message).join(), /web\/VoiceSearch\.tsx" does not exist/);
});
