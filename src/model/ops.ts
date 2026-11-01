// Changes to the model are small operations, applied as one batch: either every operation
// applies and the result passes validate(), or nothing changes. The agent never writes the
// file directly, so ids and names people have learned stay put between changes.
import { z } from 'zod';
import { CONTAINER_TYPES, CodeRef, Model, RELATIONSHIP_KINDS, elements } from './schema';
import { FileReader, Issue, Validation, validate } from './validate';

const Id = z.string().describe('lowercase-with-dashes, unique across the model');
const opt = z.string().optional();
const Code = z.array(CodeRef).optional().describe('[{file, symbol?}] file relative to the repo root (or a folder ending in "/"), symbol = exact name in the file');

// Each op is strict: an unknown field is an error, not silently dropped, so the agent learns the
// real shape from the first refusal. The same table generates OPS_REFERENCE for the agent.
const OPS = {
  set_system: z.strictObject({ op: z.literal('set_system'), id: Id.optional(), name: opt, description: opt }),
  add_person: z.strictObject({ op: z.literal('add_person'), id: Id, name: z.string(), description: opt }),
  add_external: z.strictObject({ op: z.literal('add_external'), id: Id, name: z.string(), description: opt, technology: opt }),
  add_container: z.strictObject({ op: z.literal('add_container'), id: Id, name: z.string(), type: z.enum(CONTAINER_TYPES), description: opt, technology: opt, path: opt.describe('folder relative to the repo root') }),
  add_component: z.strictObject({ op: z.literal('add_component'), id: Id, container: Id, name: z.string(), description: opt, technology: opt, code: Code }),
  update: z.strictObject({
    op: z.literal('update'), id: Id,
    set: z.strictObject({ name: opt, description: opt, technology: opt, type: z.enum(CONTAINER_TYPES).optional(), path: opt, code: Code }),
  }),
  move_component: z.strictObject({ op: z.literal('move_component'), id: Id, to_container: Id }),
  remove: z.strictObject({ op: z.literal('remove'), id: Id }),
  add_relationship: z.strictObject({ op: z.literal('add_relationship'), from: Id, to: Id, kind: z.enum(RELATIONSHIP_KINDS), description: z.string(), technology: opt, evidence: Code }),
  remove_relationship: z.strictObject({ op: z.literal('remove_relationship'), from: Id, to: Id, description: opt }),
};
type OpName = keyof typeof OPS;
export const Op = z.discriminatedUnion('op', Object.values(OPS) as unknown as [typeof OPS.set_system, ...(typeof OPS)[OpName][]]);

const fieldsOf = (name: OpName) => {
  const shape = OPS[name].shape as Record<string, z.ZodType>;
  return Object.keys(shape).filter((k) => k !== 'op').map((k) => {
    const f = shape[k];
    const optional = f.safeParse(undefined).success;
    const opts = (f as any).options ?? (f as any).unwrap?.()?.options;
    const sub = k === 'set' ? `{${Object.keys((f as any).shape).join('?, ')}?}` : '';
    const refs = k === 'code' || k === 'evidence' ? ' [{file, symbol?}]' : '';
    return `${k}${optional ? '?' : ''}${sub}${refs}${Array.isArray(opts) ? ` (${opts.join('|')})` : ''}`;
  });
};

/** One line per op with its fields ("?" = optional), for tool descriptions and the guide. */
export const OPS_REFERENCE = (Object.keys(OPS) as OpName[]).map((n) => `- ${n}: ${fieldsOf(n).join(', ')}`).join('\n');

/** Parse one op with a message that says how to fix it. */
function parseOp(raw: unknown): { op: Op } | { error: string } {
  const name = (raw as any)?.op;
  if (!(name in OPS)) return { error: `unknown op ${JSON.stringify(name)}. Ops: ${Object.keys(OPS).join(', ')}.` };
  const p = OPS[name as OpName].safeParse(raw);
  if (p.success) return { op: p.data as Op };
  const takes = `${name} takes: ${fieldsOf(name).join(', ')}.`;
  const msgs = p.error.issues.map((x) => {
    const at = x.path.join('.');
    if (x.code === 'unrecognized_keys') {
      const hint = x.keys.includes('code') && name !== 'add_component' ? ' Only components point at code; add a component for it (data stores have none).' : '';
      return `unknown field${x.keys.length > 1 ? 's' : ''} ${x.keys.map((k) => `"${k}"`).join(', ')}${at ? ` in ${at}` : ''}.${hint}`;
    }
    if (x.code === 'invalid_type' && x.message.endsWith('received undefined')) return `"${at}" is required.`;
    return `${at || '(op)'}: ${x.message}.`;
  });
  return { error: `${msgs.join(' ')} ${takes}` };
}
export type Op = z.infer<typeof Op>;

export interface OpResult extends Validation { applied: number }

export function applyOps(base: Model, ops: unknown[], read: FileReader | null): OpResult {
  const m: any = structuredClone(base);
  const errors: Issue[] = [];
  let applied = 0;
  ops.forEach((raw, i) => {
    const p = parseOp(raw);
    if ('error' in p) { errors.push({ path: `ops[${i}]`, message: p.error }); return; }
    const msg = applyOne(m, p.op);
    if (msg) errors.push({ path: `ops[${i}] (${p.op.op})`, message: msg });
    else applied++;
  });
  if (errors.length) return { errors, warnings: [], applied: 0 };
  const v = validate(m, read);
  return { ...v, applied: v.errors.length ? 0 : applied };
}

function applyOne(m: any, o: Op): string | null {
  const els = elements(m);
  const clean = <T extends object>(x: T) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T;
  switch (o.op) {
    case 'set_system':
      if (o.id !== undefined) m.system.id = o.id;
      if (o.name !== undefined) m.system.name = o.name;
      if (o.description !== undefined) m.system.description = o.description;
      return null;
    case 'add_person':
      m.people.push(clean({ id: o.id, name: o.name, description: o.description ?? '' }));
      return null;
    case 'add_external':
      m.externals.push(clean({ id: o.id, name: o.name, description: o.description ?? '', technology: o.technology }));
      return null;
    case 'add_container':
      m.containers.push(clean({ id: o.id, name: o.name, type: o.type, description: o.description ?? '', technology: o.technology, path: o.path, components: [] }));
      return null;
    case 'add_component': {
      const c = m.containers.find((x: any) => x.id === o.container);
      if (!c) return `no container "${o.container}". Containers: ${m.containers.map((x: any) => x.id).join(', ') || '(none)'}.`;
      c.components.push(clean({ id: o.id, name: o.name, description: o.description ?? '', technology: o.technology, code: o.code ?? [] }));
      return null;
    }
    case 'update': {
      const e = els.get(o.id);
      if (!e) return `no element "${o.id}".`;
      const target: any = e.el;
      for (const [k, v] of Object.entries(o.set)) {
        if (v === undefined) continue;
        if ((k === 'type' || k === 'path') && e.kind !== 'container') return `"${k}" only applies to containers.`;
        if (k === 'code' && e.kind !== 'component') return `"code" only applies to components.`;
        target[k] = v;
      }
      return null;
    }
    case 'move_component': {
      const e = els.get(o.id);
      if (!e || e.kind !== 'component') return `no component "${o.id}".`;
      const to = m.containers.find((x: any) => x.id === o.to_container);
      if (!to) return `no container "${o.to_container}".`;
      const from = m.containers.find((x: any) => x.id === e.parent);
      from.components = from.components.filter((k: any) => k.id !== o.id);
      to.components.push(e.el);
      return null;
    }
    case 'remove': {
      const e = els.get(o.id);
      if (!e) return `no element "${o.id}".`;
      if (e.kind === 'system') return 'the system itself cannot be removed.';
      const gone = new Set([o.id]);
      if (e.kind === 'container') for (const k of (e.el as any).components) gone.add(k.id);
      m.people = m.people.filter((x: any) => x.id !== o.id);
      m.externals = m.externals.filter((x: any) => x.id !== o.id);
      m.containers = m.containers.filter((x: any) => x.id !== o.id);
      for (const c of m.containers) c.components = c.components.filter((k: any) => k.id !== o.id);
      m.relationships = m.relationships.filter((r: any) => !gone.has(r.from) && !gone.has(r.to));
      return null;
    }
    case 'add_relationship':
      m.relationships.push(clean({ from: o.from, to: o.to, kind: o.kind, description: o.description, technology: o.technology, evidence: o.evidence }));
      return null;
    case 'remove_relationship': {
      const before = m.relationships.length;
      m.relationships = m.relationships.filter((r: any) => !(r.from === o.from && r.to === o.to && (o.description === undefined || r.description === o.description)));
      return m.relationships.length === before ? `no relationship ${o.from} -> ${o.to}${o.description ? ` "${o.description}"` : ''}.` : null;
    }
  }
}

/** Element ids and relationship keys that differ between two models: what a proposal adds, changes or removes. */
export interface ModelDiff {
  added: Set<string>;
  changed: Set<string>;
  removed: Set<string>;
  addedRels: Set<string>;
  removedRels: Set<string>;
}

export const relKey = (r: { from: string; to: string; description: string }) => `${r.from}|${r.to}|${r.description}`;

export function diffModels(a: Model, b: Model): ModelDiff {
  const ea = elements(a), eb = elements(b);
  const d: ModelDiff = { added: new Set(), changed: new Set(), removed: new Set(), addedRels: new Set(), removedRels: new Set() };
  const strip = (x: any) => JSON.stringify({ ...x, components: undefined });
  for (const [id, e] of eb) {
    const old = ea.get(id);
    if (!old) d.added.add(id);
    else if (strip(old.el) !== strip(e.el) || old.parent !== e.parent) d.changed.add(id);
  }
  for (const id of ea.keys()) if (!eb.has(id)) d.removed.add(id);
  const ra = new Set(a.relationships.map(relKey)), rb = new Set(b.relationships.map(relKey));
  for (const k of rb) if (!ra.has(k)) d.addedRels.add(k);
  for (const k of ra) if (!rb.has(k)) d.removedRels.add(k);
  return d;
}
