// What the UI draws. Produced by an engine (today engine/likec4.ts) from a Model; nothing outside
// the engine knows how views are computed or laid out, so the engine can be replaced.
import type { ContainerType, ElementKind, Model, Relationship, RelationshipKind } from '../model/schema';

export type Status = 'proposed' | 'changed' | 'removed';
export type Level = 'context' | 'containers' | 'components';

export interface ViewNode {
  /** our element id */
  id: string;
  kind: ElementKind;
  name: string;
  description: string;
  technology?: string;
  containerType?: ContainerType;
  x: number; y: number; w: number; h: number;
  /** enclosing node in this view (a container drawn around its components) */
  parent?: string;
  /** drawn as a frame around other nodes */
  frame: boolean;
  /** outside the focus of this view: a stand-in for something the focus talks to */
  stub: boolean;
  status?: Status;
  /** id of the view you get by zooming into this node, if any */
  zoomTo?: string;
  /** number of code references (components) */
  code: number;
}

export interface ViewEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  technology?: string;
  kind?: RelationshipKind;
  /** cubic bezier: [start, c1, c2, end, c1, c2, end, …] */
  points: [number, number][];
  labelBox?: { x: number; y: number; w: number; h: number };
  /** the stored relationships this arrow stands for (several when merged at a higher level) */
  relations: Relationship[];
  status?: Status;
}

export interface ComputedView {
  id: string;
  level: Level;
  /** element the view is about (the system for containers, a container for components) */
  scope: string | null;
  title: string;
  bounds: { x: number; y: number; w: number; h: number };
  nodes: ViewNode[];
  edges: ViewEdge[];
}

export interface Views {
  views: ComputedView[];
  /** the model the views were drawn from (proposal applied, removed items kept so they can be shown) */
  model: Model;
  proposal?: { summary: string };
}

export const viewIdFor = (level: Level, scope?: string) => (level === 'components' ? `components:${scope}` : level);
