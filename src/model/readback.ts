// The diagram in a few plain lines, sent back to the agent after it saves or shows the model, so it
// can check the picture against the code it read (and so hosts without the visual map still get it).
import { Model, elements } from './schema';

export function readback(m: Model): string {
  const els = elements(m);
  const name = (id: string) => els.get(id)?.name ?? id;
  // the box an element shows up as at the containers level
  const top = (id: string) => (els.get(id)?.kind === 'component' ? els.get(id)!.parent! : id);
  const lines: string[] = [`${m.system.name}: ${m.system.description}`];
  if (m.people.length) lines.push(`People: ${m.people.map((p) => p.name).join(', ')}`);
  if (m.externals.length) lines.push(`External systems: ${m.externals.map((x) => x.name).join(', ')}`);
  lines.push('Containers:');
  for (const c of m.containers) {
    const tech = [c.type, c.technology].filter(Boolean).join(', ');
    lines.push(`  ${c.name} [${tech}]${c.components.length ? `: ${c.components.map((k) => k.name).join(', ')}` : ''}`);
  }
  const arrows = new Map<string, Set<string>>();
  for (const r of m.relationships) {
    const a = top(r.from), b = top(r.to);
    if (a === b) continue;
    const k = `${name(a)} → ${name(b)}`;
    if (!arrows.has(k)) arrows.set(k, new Set());
    arrows.get(k)!.add(r.description);
  }
  if (arrows.size) {
    lines.push('Arrows between containers:');
    for (const [k, d] of arrows) lines.push(`  ${k}: ${[...d].join(', ')}`);
  }
  return lines.join('\n');
}
