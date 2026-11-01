import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { emptyModel } from '../src/model/schema';
import { applyOps } from '../src/model/ops';
import { repoReader } from '../src/model/validate';
import { computeViews } from '../src/engine/likec4';
import { ACME_OPS, VOICE_SEARCH } from './acme';

const root = path.resolve(import.meta.dirname, '..', 'example-projects', 'acme-shop');
const acme = applyOps(emptyModel('acme-shop', 'acme-shop'), ACME_OPS, repoReader(root)).model!;
const edge = (v: any, from: string, to: string) => v.edges.find((e: any) => e.from === from && e.to === to);

test('higher-level arrows are computed from component-level ones', async () => {
  const { views } = await computeViews(acme);
  const ctx = views.find((v) => v.id === 'context')!;
  assert.ok(edge(ctx, 'acme-shop', 'stripe'), 'acme-shop -> Stripe at context level');
  assert.ok(edge(ctx, 'shopper', 'acme-shop'));
  const cont = views.find((v) => v.id === 'containers')!;
  const webApi = edge(cont, 'web', 'api');
  assert.ok(webApi, 'Web App -> API Service at container level');
  assert.equal(webApi.relations.length, 2, 'merged from logs in + places order');
  assert.equal(webApi.kind, 'request');
});

test('component views show stand-ins for what the container talks to', async () => {
  const { views } = await computeViews(acme);
  const api = views.find((v) => v.id === 'components:api')!;
  assert.ok(api.nodes.find((n) => n.id === 'api')?.frame);
  assert.ok(api.nodes.find((n) => n.id === 'stripe')?.stub);
  assert.ok(api.nodes.find((n) => n.id === 'web')?.stub);
  assert.equal(api.nodes.find((n) => n.id === 'web')?.zoomTo, 'components:web');
  assert.ok(!views.some((v) => v.id === 'components:db'), 'data stores have no component view');
});

test('layout is identical on every run', async () => {
  const a = await computeViews(acme), b = await computeViews(acme);
  const pos = (x: typeof a) => JSON.stringify(x.views.map((v) => v.nodes.map((n) => [n.id, n.x, n.y, n.w, n.h])));
  assert.equal(pos(a), pos(b));
});

test('a proposal is drawn with statuses', async () => {
  const next = applyOps(acme, VOICE_SEARCH.ops, null).model!;
  const { views } = await computeViews(acme, { model: next, summary: VOICE_SEARCH.summary });
  const web = views.find((v) => v.id === 'components:web')!;
  assert.equal(web.nodes.find((n) => n.id === 'voice-search')?.status, 'proposed');
  assert.equal(edge(web, 'shopper', 'voice-search')?.status, 'proposed');
  const cont = views.find((v) => v.id === 'containers')!;
  assert.equal(cont.nodes.find((n) => n.id === 'web')?.status, 'changed');
  assert.equal(cont.nodes.find((n) => n.id === 'speech')?.status, 'proposed');
});
