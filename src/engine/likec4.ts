// The engine: Model -> ComputedView[] using LikeC4 for the parts we do not want to own
// (relationships implied at higher levels, which elements belong in each view, merging arrows,
// and a deterministic graphviz layout). This is the ONLY file that imports LikeC4. To replace it,
// reimplement computeViews() with the same output.
import { LikeC4 } from 'likec4';
import { DATA_STORE_TYPES, Model, Relationship, elements } from '../model/schema';
import { ModelDiff, diffModels, relKey } from '../model/ops';
import { ComputedView, Level, Status, ViewEdge, ViewNode, Views, viewIdFor } from './types';

/** Layout direction per level. */
const DIRECTION: Record<Level, 'TopBottom' | 'LeftRight'> = { context: 'TopBottom', containers: 'LeftRight', components: 'LeftRight' };

/**
 * Views of `base`, or of `base` with `proposed` applied: then new parts are marked "proposed",
 * edited ones "changed", and deleted ones are kept and marked "removed".
 */
export async function computeViews(base: Model, proposed?: { model: Model; summary: string }): Promise<Views> {
  const diff = proposed ? diffModels(base, proposed.model) : null;
  const model = proposed ? union(base, proposed.model, diff!) : base;
  const els = elements(model);

  // LikeC4 names must be identifiers; map ours to e0, e1… and back.
  const short = new Map<string, string>(), ours = new Map<string, string>();
  let n = 0;
  for (const id of els.keys()) { const s = `e${n++}`; short.set(id, s); ours.set(s, id); }
  const fqn = (id: string): string => { const e = els.get(id)!; return e.parent ? `${fqn(e.parent)}.${short.get(id)}` : short.get(id)!; };
  const ourId = (f: string) => ours.get(f.split('.').pop()!)!;

  const q = (s: string | undefined) => `'${(s ?? '').replace(/\s+/g, ' ').replace(/'/g, '’').replace(/\\/g, '/')}'`;
  const body = (description?: string, technology?: string) => {
    const parts = [description ? `description ${q(description)}` : '', technology ? `technology ${q(technology)}` : ''].filter(Boolean);
    return parts.join('\n');
  };
  const lines: string[] = [];
  lines.push('specification {', '  element person', '  element softwareSystem', '  element container', '  element component', '}', 'model {');
  for (const p of model.people) lines.push(`  ${short.get(p.id)} = person ${q(p.name)} { ${body(p.description)} }`);
  for (const x of model.externals) lines.push(`  ${short.get(x.id)} = softwareSystem ${q(x.name)} { ${body(x.description, x.technology)} }`);
  lines.push(`  ${short.get(model.system.id)} = softwareSystem ${q(model.system.name)} {`, `    ${body(model.system.description)}`);
  for (const c of model.containers) {
    lines.push(`    ${short.get(c.id)} = container ${q(c.name)} {`, `      ${body(c.description, c.technology)}`);
    for (const k of c.components) lines.push(`      ${short.get(k.id)} = component ${q(k.name)} { ${body(k.description, k.technology)} }`);
    lines.push('    }');
  }
  lines.push('  }');
  const relByIndex = model.relationships;
  relByIndex.forEach((r, i) => {
    lines.push(`  ${fqn(r.from)} -> ${fqn(r.to)} ${q(r.description)} {`, r.technology ? `    technology ${q(r.technology)}` : '', `    metadata { rid 'r${i}' }`, '  }');
  });
  lines.push('}', 'views {');
  const sys = fqn(model.system.id);
  lines.push(`  view context { include * \n autoLayout ${DIRECTION.context} }`);
  lines.push(`  view containers of ${sys} { include * \n autoLayout ${DIRECTION.containers} }`);
  const codeContainers = model.containers.filter((c) => !DATA_STORE_TYPES.has(c.type) && c.components.length);
  codeContainers.forEach((c, i) => lines.push(`  view c${i} of ${fqn(c.id)} { include * \n autoLayout ${DIRECTION.components} }`));
  lines.push('}');

  const lc = await LikeC4.fromSource(lines.join('\n'), { logger: false } as any);
  try {
    if ((lc as any).hasErrors?.()) throw new Error('LikeC4 rejected the generated model: ' + JSON.stringify((lc as any).getErrors()).slice(0, 500));
    const lm: any = await lc.layoutedModel();
    const relOf = (likeId: string): Relationship | null => {
      const meta = lm.relationship(likeId)?.getMetadata?.('rid') ?? lm.relationship(likeId)?.$relationship?.metadata?.rid;
      const i = typeof meta === 'string' ? Number(meta.slice(1)) : NaN;
      return Number.isFinite(i) ? relByIndex[i] : null;
    };
    const zoomTarget = (id: string): string | undefined => {
      const e = els.get(id)!;
      if (e.kind === 'system') return viewIdFor('containers');
      if (e.kind === 'container' && codeContainers.some((c) => c.id === id)) return viewIdFor('components', id);
      return undefined;
    };
    const statusOf = (id: string): Status | undefined => elementStatus(id, diff, els);

    const build = (likeView: string, id: string, level: Level, scope: string | null, title: string): ComputedView => {
      const v = lm.view(likeView);
      const nodes: ViewNode[] = [];
      for (const ln of v.nodes()) {
        const nd = ln.$node;
        const id = ourId(nd.modelRef ?? nd.id);
        const e = els.get(id)!;
        const el: any = e.el;
        const inScope = !scope || id === scope || e.parent === scope || (e.parent && els.get(e.parent)?.parent === scope);
        nodes.push({
          id, kind: e.kind, name: e.name, description: el.description ?? '', technology: el.technology,
          containerType: e.kind === 'container' ? el.type : undefined,
          x: nd.x, y: nd.y, w: nd.width, h: nd.height,
          parent: nd.parent ? ourId(nd.parent) : undefined,
          frame: (nd.children?.length ?? 0) > 0,
          stub: level === 'components' && !inScope,
          status: statusOf(id),
          zoomTo: (nd.children?.length ?? 0) > 0 ? undefined : zoomTarget(id),
          code: e.kind === 'component' ? (el.code?.length ?? 0) : 0,
        });
      }
      const edges: ViewEdge[] = [];
      for (const le of v.edges()) {
        const ed = le.$edge;
        const rels = (ed.relations as string[]).map(relOf).filter((r): r is Relationship => !!r);
        const kinds = new Set(rels.map((r) => r.kind));
        const st = rels.map((r) => relStatus(r, diff));
        edges.push({
          id: ed.id, from: ourId(ed.source), to: ourId(ed.target),
          label: mergedLabel(rels, ed.label),
          technology: ed.technology ?? rels.find((r) => r.technology)?.technology,
          kind: kinds.size === 1 ? [...kinds][0] : undefined,
          points: ed.points as [number, number][],
          labelBox: ed.labelBBox ? { x: ed.labelBBox.x, y: ed.labelBBox.y, w: ed.labelBBox.width, h: ed.labelBBox.height } : undefined,
          relations: rels,
          status: st.length && st.every((s) => s === 'proposed') ? 'proposed' : st.length && st.every((s) => s === 'removed') ? 'removed' : undefined,
        });
      }
      const b = v.$view.bounds;
      return { id, level, scope, title, bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, nodes, edges };
    };

    const views: ComputedView[] = [
      build('context', viewIdFor('context'), 'context', null, `${model.system.name} · System context`),
      build('containers', viewIdFor('containers'), 'containers', model.system.id, `${model.system.name} · Containers`),
      ...codeContainers.map((c, i) => build(`c${i}`, viewIdFor('components', c.id), 'components', c.id, `${c.name} · Components`)),
    ];
    return { views, model, proposal: proposed ? { summary: proposed.summary } : undefined };
  } finally {
    await (lc as any).dispose?.();
  }
}

/** "logs in, places order" for two merged relationships, "signs in, checks out +1" for more. */
function mergedLabel(rels: Relationship[], fallback?: string | null): string {
  const names = [...new Set(rels.map((r) => r.description))];
  if (!names.length) return fallback ?? '';
  return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function elementStatus(id: string, diff: ModelDiff | null, els: ReturnType<typeof elements>): Status | undefined {
  if (!diff) return undefined;
  if (diff.added.has(id)) return 'proposed';
  if (diff.removed.has(id)) return 'removed';
  if (diff.changed.has(id)) return 'changed';
  // a container whose components are added or removed changes too
  for (const [cid, e] of els) if (e.parent === id && (diff.added.has(cid) || diff.removed.has(cid) || diff.changed.has(cid))) return 'changed';
  if (els.get(id)?.kind === 'system' && (diff.added.size || diff.removed.size || diff.changed.size)) return 'changed';
  return undefined;
}

function relStatus(r: Relationship, diff: ModelDiff | null): Status | undefined {
  if (!diff) return undefined;
  const k = relKey(r);
  return diff.addedRels.has(k) ? 'proposed' : diff.removedRels.has(k) ? 'removed' : undefined;
}

/** The proposed model plus everything it removed, so removals can be drawn. */
function union(base: Model, next: Model, diff: ModelDiff): Model {
  const m: Model = structuredClone(next);
  for (const p of base.people) if (diff.removed.has(p.id)) m.people.push(p);
  for (const x of base.externals) if (diff.removed.has(x.id)) m.externals.push(x);
  for (const c of base.containers) {
    if (diff.removed.has(c.id)) { m.containers.push(c); continue; }
    const into = m.containers.find((x) => x.id === c.id);
    for (const k of c.components) if (diff.removed.has(k.id) && into) into.components.push(k);
  }
  const ids = elements(m);
  for (const r of base.relationships) if (diff.removedRels.has(relKey(r)) && ids.has(r.from) && ids.has(r.to)) m.relationships.push(r);
  return m;
}
