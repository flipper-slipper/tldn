# VibeBlocks

An interactive C4 diagram of your code that you read instead of the code. It appears inside your
agent's chat (Claude Desktop, Claude Code, VS Code, Codex). You click from Context → Containers →
Components → Code, and anything you ask from the diagram goes to your own agent in the host's chat.
Before the agent builds a feature it proposes the change on the diagram (drawn dashed), and you
approve, modify or reject it there.

This repo is the private dev repo: the MCP server, the diagram UI, and example projects to test them on.

## How it works in one minute

```
 your agent (Claude, Codex…)                    the host (Claude Desktop, VS Code…)
   │  reads the code                               │  renders the MCP App in the chat
   │  calls update_model / propose_change          │  forwards clicks back as tool calls / chat messages
   ▼                                               ▼
 MCP server  ──►  ops ──► validate (C4 rules) ──► .vibeblocks/model.yaml   (source of truth, committed)
 (src/mcp)                                          .vibeblocks/proposal.yaml (dashed, until approved)
                         │
                         ▼
                 engine (LikeC4) ──► computed views: boxes, arrows, layout ──► map UI (src/ui)
```

- **The model file is the source of truth.** `<project>/.vibeblocks/model.yaml` lives in the user's
  repo and is committed with it. Nobody edits it by hand: the agent changes it only through
  **operations** (`add_container`, `add_relationship`, …), which are applied all-or-nothing.
- **The rules are ours.** `validate.ts` enforces C4 (no arrows between parent and child, data stores
  have no components, every code reference exists…). A batch with an error is refused and the
  message tells the agent how to fix it. Style problems come back as warnings.
- **The agent does the reading.** There is no code indexer yet. The agent reads the repo and writes
  the operations; the rules, the warnings (boxes with no arrows, source files not on the map) and a
  plain-text readback of the diagram keep it honest.
- **LikeC4 is a swappable engine.** It computes which boxes and arrows each level shows (including
  arrows rolled up from components to containers) and lays them out with graphviz. Only
  `src/engine/likec4.ts` imports it. To replace it, reimplement `computeViews()`.
- **The UI is an MCP App.** `show_map` points at a `ui://` resource: a single self-contained HTML
  file the host renders in the conversation. The UI calls back into the server through tools that
  only the app can see (`get_views`, `read_code`).

## Getting started

You need Node.js 20.11 or later.

```bash
npm install
```

```bash
npm run build
```

```bash
npm test
```

Then open the diagram of the example project in a browser:

```bash
npm run dev -- example-projects/acme-shop
```

Go to http://localhost:5178. This dev page is the same UI, backed by the same tool handlers, without
a host: messages the diagram would post into the chat show as a toast instead.

## Project structure

```
src/
  model/             the model and everything that changes or checks it (no LikeC4, no UI)
    schema.ts          Zod schema of model.yaml: system, people, externals, containers → components, relationships
    ops.ts             operations, applied all-or-nothing; strict per-op schemas; OPS_REFERENCE for the agent; diffModels for proposals
    validate.ts        C4 rules (errors) and style checks (warnings); every message says how to fix it
    coverage.ts        which source files no component points at (the "not on the map" warning)
    readback.ts        the diagram as a few plain lines, returned to the agent after it saves or shows
    store.ts           reads and writes .vibeblocks/model.yaml and proposal.yaml
  engine/
    types.ts           what the UI draws: ComputedView, ViewNode, ViewEdge (engine-independent)
    likec4.ts          THE ONLY LikeC4 import: model → LikeC4 DSL → layouted views → our types
  service.ts         tool handlers shared by the MCP server and the dev page (one function per tool)
  guide.ts           what get_guide returns: levels, rules, op reference, example, workflow
  mcp/server.ts      the MCP server (stdio): tools, the ui:// resource, app-only tools
  ui/                React app bundled into one HTML file
    App.tsx            header, proposal bar, diagram (pan/zoom, boxes, arrows), side panel, code view
    host.ts            talks to the host (MCP App bridge) or, outside a host, to the dev server
    styles.css         the look (based on the Figma "Task Flows" file), light and dark
dev/serve.ts         dev page server: the built UI + POST /api/tool
scripts/
  build-server.mjs   bundles the server into dist/mcp.mjs
  call.ts            call the built server from the shell (for agents or people without it connected)
  seed-acme.ts       rewrites acme-shop's model from test/acme.ts (optionally with the voice-search proposal)
  print-views.ts     prints the computed views of a project, for debugging the engine
test/
  model.test.ts      the C4 rules and all-or-nothing batches
  engine.test.ts     rolled-up arrows, scoped views, deterministic layout
  feedback.test.ts   what the agent hears back: strict ops, warnings, coverage, readback, the guide's example
  mcp.e2e.ts         starts dist/mcp.mjs over stdio and drives it like a host
  acme.ts            the hand-written acme-shop operations used by the tests
example-projects/    small real projects to test mapping on (see below)
dist/                build output (git-ignored): mcp.mjs and ui/index.html
```

### Where to make a change

| You want to… | Change |
|---|---|
| Add or change a C4 rule | `src/model/validate.ts`, plus a test in `test/model.test.ts` |
| Add an operation or a field | `OPS` in `src/model/ops.ts` and `applyOne()`; the op reference in the guide and tool description updates itself |
| Change what the agent is told | `src/guide.ts` (and the tool descriptions in `src/mcp/server.ts`) |
| Change what the agent hears back | `src/service.ts`, `src/model/readback.ts`, `src/model/coverage.ts` |
| Change layout or what a level shows | `src/engine/likec4.ts` (`DIRECTION`, the generated views) |
| Change the look or interactions | `src/ui/App.tsx`, `src/ui/styles.css` |
| Add a tool | a handler in `src/service.ts`, register it in `src/mcp/server.ts`, and add it to `dev/serve.ts` if the UI uses it |

## Development loop

| Changed | Do |
|---|---|
| UI (`src/ui`) | `npx vite build`, then reload the dev page |
| Model, engine, service | restart `npm run dev` (it doesn't hot-reload server code) |
| Anything | `npm test` and `npm run typecheck` |
| Before pushing | `npm run test:e2e` (builds, then checks the server over stdio) |

## Trying it in a real host

Build first (`npm run build`); hosts run `dist/mcp.mjs` from this checkout, next to `node_modules`.

**Claude Desktop**: add this to `~/Library/Application Support/Claude/claude_desktop_config.json`
under `"mcpServers"`, then quit Claude Desktop with ⌘Q and reopen it:

```json
"vibeblocks": {
  "command": "/absolute/path/to/node",
  "args": ["/absolute/path/to/vibeblocks/dist/mcp.mjs"]
}
```

Use the full path from `which node`: Claude Desktop doesn't load your shell, so a `node` installed
with nvm isn't found by name. Then, in a chat: *"Show me the architecture of
/absolute/path/to/vibeblocks/example-projects/acme-shop"*.

**Claude Code**: put the same entry in a `.mcp.json` in the project you work on (`"command": "node"`
is fine there). The server uses the project folder automatically.

Hosts keep the server process running. **After a rebuild, restart the host** (or reconnect the
server) to load the new code; the UI HTML is read fresh on each request, but the server code isn't.

To see what's going wrong: `~/Library/Logs/Claude/mcp-server-vibeblocks.log`.

## Tools

| Tool | Seen by | What it does |
|---|---|---|
| `show_map {path?, focus?}` | agent | Opens the diagram, and returns a plain-text summary of it (for hosts without MCP Apps) |
| `get_guide` | agent | The rules, the operation reference and the workflow |
| `get_model {path?}` | agent | The model, its errors and warnings, and any open proposal |
| `update_model {path?, ops}` | agent | Applies operations all-or-nothing; returns errors, or warnings plus the readback |
| `propose_change {path?, summary, ops}` | agent | Saves a proposal; the diagram draws it dashed |
| `apply_proposal` / `discard_proposal` | agent | After the change is built / when the user rejects it |
| `get_views`, `read_code` | map only | Hidden from the agent (`_meta.ui.visibility: ["app"]`) |

The project folder is the tool's `path`, else `VIBEBLOCKS_ROOT`, else the server's working directory.

## Example projects

`example-projects/` holds small real projects to test mapping on. Each one is a normal repo with its
own `.vibeblocks/model.yaml` committed next to the code.

- **acme-shop**: React web app, Express API, Postgres, Stripe and SendGrid. Its model was drawn by an
  agent from the code. `node --import tsx scripts/seed-acme.ts [--propose]` replaces it with the
  hand-written one from `test/acme.ts` (and, with `--propose`, adds the dashed voice-search proposal).

To add one: put the project in `example-projects/<name>/` without a `.vibeblocks/` folder, map it
with an agent (below), check the result in the dev page, and commit the code and the model together.

### Testing how well an agent maps a project

The quality of the diagram depends on the agent and on what we tell it, so test with an agent that
has never seen the project. Copy the project somewhere outside the repo without its `.vibeblocks/`
folder, then give a fresh agent only this:

> Map the architecture of /path/to/copy and show it to me. Use the VibeBlocks tools through
> `node --import tsx scripts/call.ts list` and `node --import tsx scripts/call.ts <tool> '<json>'`
> (run from this repo). Read only files in that folder. Report every update_model call with its
> exact errors and warnings, and anything you had to guess.

Errors and guesses show where the guide, tool descriptions or messages need work.
`scripts/call.ts` runs the freshly built `dist/mcp.mjs`, so it also works when the server your agent
has connected is out of date.

## Not built yet

Automatic code analysis (indexers, drift detection), undo/history, generating a new project from a
diagram, the VS Code extension shell, Structurizr export, plugin/skill packaging.
