// Export a project's map as one standalone HTML file anyone can open: no Claude, no server.
// The map's data (views + the code each component points at) is baked into the page.
//   npm run build && node --import tsx scripts/export-snapshot.ts <project folder> [out.html]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { mapSnapshot } from '../src/service';

const [project, out = 'dist/snapshot/index.html'] = process.argv.slice(2);
if (!project) {
  console.error('usage: export-snapshot.ts <project folder> [out.html]');
  process.exit(1);
}
const root = path.resolve(project);
const ui = 'dist/ui/index.html';
if (!fs.existsSync(ui)) {
  console.error(`${ui} is missing: run npm run build first.`);
  process.exit(1);
}

const snap = await mapSnapshot(root, Number.POSITIVE_INFINITY);
const views: any = snap.get_views;
if (!views?.model) {
  console.error(`No map for ${root}: run /vibeblocks:map in that project first.`);
  process.exit(1);
}
// The absolute project path is not needed by the page; don't publish it.
let json = JSON.stringify(snap).split(root).join('.');
json = json.replace(/</g, '\\u003c'); // safe inside <script>

const name = views.model.system?.name ?? path.basename(root);
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const html = fs.readFileSync(ui, 'utf8')
  .replace(/<title>.*?<\/title>/, `<title>${escape(name)} Architecture</title>`)
  .replace('<head>', () => `<head>\n<script>window.__VIBEBLOCKS_SNAPSHOT__ = ${json};</script>`);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} written (${Math.round(html.length / 1024)} KB, ${Object.keys(snap.read_code).length} code refs)`);
