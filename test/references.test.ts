// The reference models in example-projects/references are the answer keys for mapping tests.
// They must stay valid, with every source file on the map, as the rules change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { repoReader, validate } from '../src/model/validate';
import { coverage } from '../src/model/coverage';

const base = path.resolve(import.meta.dirname, '..', 'example-projects');
for (const file of fs.readdirSync(path.join(base, 'references')).filter((f) => f.endsWith('.yaml'))) {
  const name = file.replace(/\.yaml$/, '');
  test(`reference ${name} is valid and covers every source file`, () => {
    const root = path.join(base, name);
    const v = validate(YAML.parse(fs.readFileSync(path.join(base, 'references', file), 'utf8')), repoReader(root));
    assert.deepEqual(v.errors, []);
    assert.deepEqual(v.warnings, []);
    assert.deepEqual(coverage(root, v.model!).unmapped, []);
  });
}
