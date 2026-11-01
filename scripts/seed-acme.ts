// Draw the acme-shop sample through the same validated path an agent uses.
//   npx tsx scripts/seed-acme.ts [--propose]
import * as path from 'node:path';
import { ACME_OPS, VOICE_SEARCH } from '../test/acme';
import { discardProposal, proposeChange, updateModel } from '../src/service';
import { saveModel } from '../src/model/store';
import { emptyModel } from '../src/model/schema';

const root = path.resolve(import.meta.dirname, '..', 'example-projects', 'acme-shop');
saveModel(root, emptyModel('acme-shop', 'acme-shop'));
console.log(JSON.stringify(updateModel(root, ACME_OPS), null, 1));
discardProposal(root);
if (process.argv.includes('--propose')) console.log(JSON.stringify(proposeChange(root, VOICE_SEARCH.summary, VOICE_SEARCH.ops), null, 1));
