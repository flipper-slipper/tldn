// The quick "how to use VibeBlocks" text: the map's ? panel shows it, and the get_help tool (behind
// /vibeblocks:help) returns it as Markdown. Change it here and both follow. Lines marked with a
// surface only show there; the chat version shows every line.

export type Surface = 'chat' | 'browser';
export interface HelpLine { text: string; only?: Surface }
export interface HelpSection { title: string; lines: HelpLine[] }

export const HELP: HelpSection[] = [
  {
    title: 'Getting around',
    lines: [
      { text: 'The map has four levels: **Context** (the people who use the system and the outside services it talks to), **Containers** (the apps, servers and databases), **Components** (the parts of one container) and **Code**.' },
      { text: 'Click a box to select it. The panel shows what it is, the code behind it, and its arrows in and out.' },
      { text: 'Double-click a box, or click the pill under it, to go one level deeper. **← Zoom out** or the breadcrumbs at the top take you back up.' },
      { text: '**Pinch with two fingers** on a trackpad to zoom. Keep pinching into a box and it opens; pinch out past the whole level to go back up. One pinch moves one level.' },
      { text: 'Scroll with two fingers, or drag the background, to move around.' },
    ],
  },
  {
    title: 'Reading the diagram',
    lines: [
      { text: 'Arrows show what talks to what, labelled with what travels over them. Select an arrow to see every connection behind it.' },
      { text: 'On a busy level the map zooms out and hides arrow labels. Click an arrow (or zoom in) to see its label; select a box and the panel lists all its arrows.' },
      { text: '**Dashed** boxes are outside services (like Stripe), or parts of a proposed change that is not built yet.' },
      { text: 'Code is read-only on the map. To change it, ask Claude in the chat.' },
    ],
  },
  {
    title: 'Asking Claude',
    lines: [
      { text: 'With something selected, use **Why is this here?** or **Explain**, or type your own question and press **Send to chat**. It goes to Claude already pointing at what you selected.', only: 'chat' },
      { text: 'This tab only shows the map. Ask Claude about it in your Claude chat.', only: 'browser' },
    ],
  },
  {
    title: 'Changing the code',
    lines: [
      { text: 'Ask Claude for a feature in the chat. Before writing code it draws the plan on the map as dashed boxes.' },
      { text: '**Approve** to have Claude build it, **Modify** to change the plan, or **Reject** to drop it. Nothing changes until you approve.', only: 'chat' },
      { text: 'Approve, change or reject a plan in your Claude chat; this tab updates on its own.', only: 'browser' },
    ],
  },
  {
    title: 'Where to open the map',
    lines: [
      { text: '**In the chat:** `/vibeblocks:map`. Use ⤢ to make it bigger, if your app offers it.' },
      { text: '**In a browser tab:** `/vibeblocks:open`, or **Open in browser** at the top of the map. The tab is view-only and updates by itself while Claude is running; it stops when you quit Claude.' },
    ],
  },
  {
    title: 'Commands',
    lines: [
      { text: '`/vibeblocks:map`: draw this project\'s map (or show it, if it exists) in the chat.' },
      { text: '`/vibeblocks:open`: open the map in a browser tab.' },
      { text: '`/vibeblocks:help`: this guide.' },
      { text: 'To start a map over, delete the `.vibeblocks` folder in the project and run `/vibeblocks:map`.' },
    ],
  },
];

export function helpFor(surface: Surface): HelpSection[] {
  return HELP.map((s) => ({ ...s, lines: s.lines.filter((l) => !l.only || l.only === surface) })).filter((s) => s.lines.length);
}

export function helpMarkdown(): string {
  return ['# Using VibeBlocks', ...helpFor('chat').map((s) => `## ${s.title}\n\n${s.lines.map((l) => `- ${l.text}`).join('\n')}`)].join('\n\n');
}
