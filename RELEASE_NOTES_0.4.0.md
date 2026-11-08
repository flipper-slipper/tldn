# VibeBlocks 0.4.0: revised navigation, undo/history, scalable maps and runtime tracing

This update builds upon the previously repaired VibeBlocks 0.3.1 source. It
preserves the existing canvas drawing, visual theme, chat integration, C4
model format and approval logic.

## Changes

- **Browser-style navigation:** Back arrow **←** moved from the bottom of the
  diagram to the top-left, next to Reload **↻**. Added Fit-to-screen **⊡**.
- **Viewport scaling:** Diagram fit now uses actual bounds without forcing an
  oversized minimum scale that clips large maps. Existing scroll/drag/pinch
  mechanics remain available. This is *viewport scaling*, not unlimited
  repository size: scan/layout performance still matters for very large maps.
- **Undo/Redo/Restore:** New History panel with a bounded 50-version model
  timeline, revision labels and timestamps. Immutable model snapshots, a
  separate cursor for Undo/Redo, redo-branch handling after a new edit,
  migration of pre-existing model backup YAMLs, protection against undo while
  a proposal is pending, and preservation of an external manual model edit
  on the next successful update. This changes **only the diagram model**, not
  source files, build artifacts, or agent edits.
- **Actual runtime instrumentation:** `npm run trace` starts a Node.js command
  with V8 precise coverage sampling and an uncaught-error observer. The Trace
  panel aggregates executed source files, shows counts and errors, highlights
  matching diagram components, and highlights recorded error lines in the code
  view. For caught exceptions use `globalThis.__vibeblocksTrace?.error(err)`;
  checkpoints use `.mark(text, import.meta.url)`.
- **Host integration:** New history and trace operations are routed through
  the development server, browser token-scoped API, MCP server and VS Code
  extension adapter.
- **Working demo:** `example-projects/runtime-demo` includes a ready-to-open
  C4 map and small Node.js app with a deliberate, reproducible failure.
- **Safety:** Trace data is opt-in, local-only, capped at 10 MB per run;
  responses read at most 2 MB and reject diagnostic directory escapes.
  Generated traces and local model checkpoints are gitignored.
- **Documentation:** Updated README/help and supplied `RUN_WINDOWS.md`.
- **Testing:** Added unit tests for undo/redo, revision branching, rejection
  during pending proposals, and a bounded runtime event parser.

## Verification performed here

- Node.js `--check` passed for both new tracing scripts.
- TypeScript parser found no syntax diagnostics in nine changed TypeScript
  source/test files. JSON manifests parsed successfully.
- Ran the actual demo under the tracer using
  `VIBEBLOCKS_DEMO_MS=35 npm run trace -- --root example-projects/runtime-demo -- node app.mjs`.
  It recorded activity for `app.mjs` and `worker.mjs` and the intentional
  exception at `worker.mjs:4`, then exited with code 1 **as intended**.
- The telemetry reader was transpiled and run independently, and reported
  that error and both project files.

## Not yet verified in this environment

The full VibeBlocks build, React browser UI interactions, VS Code extension,
and test suite **were not executed end-to-end**. This container has Node
22.16.0, below the project's 22.22.3 minimum, and the required npm packages
could not be installed offline (`ENOTCACHED` for `zod-to-json-schema`).
Before deployment run `npm ci`, `npm run typecheck`, `npm test`, and
`npm run build:plugin` with a suitable Node version and an internet connection.

## Run

See `RUN_WINDOWS.md` for copy/paste PowerShell commands. The simplest preview
is `npm run build` then `npm run dev -- example-projects/runtime-demo`.
In a separate terminal, execute the trace command documented above without
`VIBEBLOCKS_DEMO_MS` to watch the runtime activity in the map.
