// Bundle the MCP server to dist/mcp.mjs. npm packages stay external (LikeC4 loads graphviz wasm
// from its own folder), so run it from this checkout: node dist/mcp.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'dist/mcp.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});
