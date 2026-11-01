// Print the computed views of a repo: npx tsx scripts/print-views.ts example-projects/acme-shop
import { getViews } from '../src/service';

const v: any = await getViews(process.argv[2] ?? 'example-projects/acme-shop');
for (const x of v.views ?? []) {
  console.log('==', x.id, '|', x.title, JSON.stringify(x.bounds));
  for (const n of x.nodes) console.log('  N', n.id, n.kind, n.frame ? 'frame' : '', n.stub ? 'stub' : '', n.status ?? '', n.zoomTo ?? '', n.x, n.y, n.w, n.h);
  for (const e of x.edges) console.log('  E', e.from, '->', e.to, '|', e.label, '|', e.kind ?? 'mixed', e.status ?? '', 'rels', e.relations.length, 'pts', e.points.length);
}
console.log('proposal', v.proposal, v.errors ?? '');
