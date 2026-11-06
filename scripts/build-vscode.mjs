// Build the VS Code extension in vscode/ and package it as vscode/vibeblocks-<version>.vsix.
// Run `npm run build:vscode`, which builds the map UI first. Nothing is copied by hand: the extension
// is bundled from vscode/src/extension.ts, the map data from the same src/service.ts the MCP server
// uses, and the page is the same dist/ui/index.html the plugin ships.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

const out = 'vscode/dist';
fs.rmSync(out, { recursive: true, force: true });

// the extension's entry point: CommonJS, as VS Code loads it
await build({
  entryPoints: ['vscode/src/extension.ts'],
  outfile: `${out}/extension.js`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  logLevel: 'info',
});

// the map data: the plugin server's service code with LikeC4, bundled exactly like build-plugin.mjs
await build({
  entryPoints: ['src/service.ts'],
  outfile: `${out}/service.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.wasm': 'binary' },
  banner: { js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});

fs.mkdirSync(`${out}/ui`, { recursive: true });
fs.copyFileSync('dist/ui/index.html', `${out}/ui/index.html`);

const { version } = JSON.parse(fs.readFileSync('vscode/package.json', 'utf8'));
const vsix = `vibeblocks-${version}.vsix`;
execFileSync('npx', ['--yes', '@vscode/vsce@3.2.2', 'package', '--no-dependencies', '--skip-license', '--allow-missing-repository', '-o', vsix], { cwd: 'vscode', stdio: 'inherit' });
console.log(`vscode/${vsix} built`);
