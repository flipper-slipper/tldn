// Builds the map UI into one self-contained HTML file (dist/ui/index.html): MCP hosts load it
// from a ui:// resource, so it cannot fetch other assets.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src/ui',
  plugins: [react(), viteSingleFile()],
  build: { outDir: '../../dist/ui', emptyOutDir: true },
});
