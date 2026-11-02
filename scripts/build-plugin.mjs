// Build the Claude Code plugin in plugin/: the MCP server bundled with all its npm packages (so it
// runs with plain node, no npm install) and the map UI next to it. Run `npm run build:plugin`, which
// builds the UI first. plugin/server/ is committed: it is what testers install.
import { build } from 'esbuild';
import * as fs from 'node:fs';

await build({
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'plugin/server/mcp.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.wasm': 'binary' },
  // Some bundled packages still call require(); give them one.
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});

fs.mkdirSync('plugin/server/ui', { recursive: true });
fs.copyFileSync('dist/ui/index.html', 'plugin/server/ui/index.html');
console.log('plugin/server/ui/index.html copied');
