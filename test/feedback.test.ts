// What the agent hears back: strict ops with fix-it messages, the guide's own example, boxes with
// no arrows, source files left off the map, and the plain-text readback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { emptyModel } from '../src/model/schema';
import { applyOps } from '../src/model/ops';
import { repoReader } from '../src/model/validate';
import { coverage } from '../src/model/coverage';
import { readback } from '../src/model/readback';
import { GUIDE } from '../src/guide';
import { ACME_OPS } from './acme';

const root = path.resolve(import.meta.dirname, '..', 'example-projects', 'acme-shop');
const read = repoReader(root);
const run = (ops: unknown[]) => applyOps(emptyModel('acme-shop', 'acme-shop'), ops, read);
const acme = () => run(ACME_OPS).model!;

test('an unknown field is refused with the fields the op takes', () => {
  const msg = run([{ op: 'add_container', id: 'db', name: 'DB', type: 'database', code: [{ file: 'db/schema.sql' }] }]).errors[0].message;
  assert.match(msg, /unknown field "code"/);
  assert.match(msg, /Only components point at code/);
  assert.match(msg, /add_container takes: id, name, type/);
  assert.match(run([{ op: 'add_box', id: 'x' }]).errors[0].message, /unknown op "add_box". Ops: set_system/);
  assert.match(run([{ op: 'add_person', id: 'p' }]).errors[0].message, /"name" is required/);
});

test("the guide's example batch passes the rules", () => {
  const json = GUIDE.match(/```json\n([\s\S]*?)\n```/)![1];
  const r = applyOps(emptyModel('recipe-box', 'Recipe Box'), JSON.parse(json), null); // made-up app: structure only
  assert.deepEqual(r.errors, []);
});

test('a box with no arrows is a warning', () => {
  const r = run([...ACME_OPS, { op: 'add_component', container: 'api', id: 'db-conn', name: 'Database connection', description: 'Pool.', code: [{ file: 'api/db.ts', symbol: 'db' }] }]);
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings.map((w) => w.message).join('\n'), /"Database connection" has no arrows/);
});

test('coverage lists source files no component points at', () => {
  assert.deepEqual(coverage(root, acme()).unmapped, []);
  const m = acme();
  m.containers.find((c) => c.id === 'db')!.path = undefined;
  m.containers.find((c) => c.id === 'api')!.components.find((k) => k.id === 'payments')!.code = [];
  assert.deepEqual(coverage(root, m).unmapped, ['api/payments.ts', 'db/schema.sql']);
});

test('the readback rolls arrows up to containers', () => {
  const text = readback(acme());
  assert.match(text, /Web App \[web-app, React\]: Sign-in, Cart & checkout/);
  assert.match(text, /Web App → API Service: /);
  assert.doesNotMatch(text, /API Service → API Service/);
});

test('a folder ref ("dir/") points at every file in it', () => {
  const ops = ACME_OPS.map((o: any) => (o.id === 'payments' ? { ...o, code: [{ file: 'api/' }] } : o));
  const r = run(ops);
  assert.deepEqual(r.errors, []);
  assert.match(run([...ACME_OPS, { op: 'update', id: 'payments', set: { code: [{ file: 'api/nope/' }] } }]).errors[0].message, /folder "api\/nope\/" does not exist/);
  assert.match(run([...ACME_OPS, { op: 'update', id: 'payments', set: { code: [{ file: 'api/', symbol: 'x' }] } }]).errors[0].message, /is a folder; a symbol needs a file/);
  const m = acme();
  m.containers.find((c) => c.id === 'api')!.components.find((k) => k.id === 'payments')!.code = [{ file: 'api/' }];
  m.containers.find((c) => c.id === 'api')!.components.find((k) => k.id === 'orders')!.code = [];
  assert.deepEqual(coverage(root, m).unmapped, []);
});
