# Runtime trace example

This tiny Node.js project runs without npm dependencies, and it already contains
its VibeBlocks C4 model. To inspect the map, run `npm run build` from the main
VibeBlocks folder, then `npm run dev -- example-projects/runtime-demo` and open
http://localhost:5178. Click into the Node Demo App to see its components.

In **another terminal**, in the main VibeBlocks folder, run:

```bash
npm run trace -- --root ./example-projects/runtime-demo -- node app.mjs
```

Open the map's **Trace** tab. The coordinator and worker light up when they run.
The demo logs a checkpoint after five items and fails (intentionally) on item 15,
recording the failing line in `worker.mjs`. This is a test failure, not a VibeBlocks
crash. Set `VIBEBLOCKS_DEMO_MS=30` to run the demonstration faster for testing.
