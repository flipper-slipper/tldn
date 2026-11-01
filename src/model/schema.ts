// The VibeBlocks model: a C4 description of one software system, stored in
// <repo>/.vibeblocks/model.yaml and committed with the code.
//
// The shape itself enforces most of C4: components can only be written inside a container,
// containers only inside the system. Rules the shape cannot express live in validate.ts.
// Relationships are stored at the most specific level known (usually component to component);
// the arrows shown at higher levels are computed from them, never stored.
import { z } from 'zod';

export const CONTAINER_TYPES = ['web-app', 'mobile-app', 'desktop-app', 'cli', 'api', 'worker', 'function', 'library', 'firmware', 'database', 'cache', 'queue', 'storage', 'search'] as const;
export const DATA_STORE_TYPES = new Set<ContainerType>(['database', 'cache', 'queue', 'storage', 'search']);
export const RELATIONSHIP_KINDS = ['uses', 'request', 'command', 'event', 'data', 'external', 'internal'] as const;

const Id = z.string().regex(/^[a-z][a-z0-9-]*$/, 'ids are lowercase letters, digits and dashes, starting with a letter (e.g. "api", "order-service")');
const Text = z.string().trim();

/** A pointer into the code. `symbol` is a class/function/const name that must appear in the file. */
export const CodeRef = z.object({ file: Text.min(1), symbol: Text.min(1).optional() }).strict();

export const Person = z.object({ id: Id, name: Text.min(1), description: Text.default('') }).strict();
export const External = z.object({ id: Id, name: Text.min(1), description: Text.default(''), technology: Text.optional() }).strict();
export const Component = z.object({
  id: Id,
  name: Text.min(1),
  description: Text.default(''),
  technology: Text.optional(),
  code: z.array(CodeRef).default([]),
}).strict();
export const Container = z.object({
  id: Id,
  name: Text.min(1),
  type: z.enum(CONTAINER_TYPES),
  description: Text.default(''),
  technology: Text.optional(),
  /** folder the container is built from, relative to the repo root */
  path: Text.optional(),
  components: z.array(Component).default([]),
}).strict();
export const Relationship = z.object({
  from: Id,
  to: Id,
  kind: z.enum(RELATIONSHIP_KINDS),
  description: Text.min(1),
  technology: Text.optional(),
  evidence: z.array(CodeRef).optional(),
}).strict();
export const Model = z.object({
  version: z.literal(1).default(1),
  system: z.object({ id: Id, name: Text.min(1), description: Text.default('') }).strict(),
  people: z.array(Person).default([]),
  externals: z.array(External).default([]),
  containers: z.array(Container).default([]),
  relationships: z.array(Relationship).default([]),
}).strict();

export type ContainerType = (typeof CONTAINER_TYPES)[number];
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];
export type CodeRef = z.infer<typeof CodeRef>;
export type Person = z.infer<typeof Person>;
export type External = z.infer<typeof External>;
export type Component = z.infer<typeof Component>;
export type Container = z.infer<typeof Container>;
export type Relationship = z.infer<typeof Relationship>;
export type Model = z.infer<typeof Model>;

export type ElementKind = 'system' | 'person' | 'external' | 'container' | 'component';
export interface ElementRef {
  id: string;
  kind: ElementKind;
  name: string;
  /** id of the enclosing element (system for containers, container for components) */
  parent?: string;
  el: Model['system'] | Person | External | Container | Component;
}

/** Every element in the model by id, with its kind and parent. Later duplicates are ignored here; validate() reports them. */
export function elements(m: Model): Map<string, ElementRef> {
  const out = new Map<string, ElementRef>();
  const add = (r: ElementRef) => { if (!out.has(r.id)) out.set(r.id, r); };
  add({ id: m.system.id, kind: 'system', name: m.system.name, el: m.system });
  for (const p of m.people) add({ id: p.id, kind: 'person', name: p.name, el: p });
  for (const e of m.externals) add({ id: e.id, kind: 'external', name: e.name, el: e });
  for (const c of m.containers) {
    add({ id: c.id, kind: 'container', name: c.name, parent: m.system.id, el: c });
    for (const k of c.components) add({ id: k.id, kind: 'component', name: k.name, parent: c.id, el: k });
  }
  return out;
}

/** Ids of an element and all its ancestors, nearest first. */
export function ancestry(id: string, els: Map<string, ElementRef>): string[] {
  const out: string[] = [];
  for (let cur = els.get(id); cur; cur = cur.parent ? els.get(cur.parent) : undefined) out.push(cur.id);
  return out;
}

export function emptyModel(id = 'system', name = 'System'): Model {
  return Model.parse({ system: { id, name } });
}
