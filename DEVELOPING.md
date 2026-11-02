# VibeBlocks
Through developing VibeBlocks, we’ve been trying to answer a big question: How might we use interactive code abstractions to help vibe coders more easily modify AI-generated code while developing a deeper understanding of how it works? 

VibeBlocks is a vibe coding tool that explores how programming with AI can be made more understandable and involved, allowing the user to be more proactive in creating and modifying their code. Rather than requiring users to navigate large amounts of raw code, VibeBlocks explores whether visual representations of a coding project in the forms of either a system or block diagram can give users a clearer sense of what the AI is changing and creating. It is intended for people who already use AI as part of their programming process but still want to understand and have more agency over what they build.

In VibeBlocks, there is an interactive C4 diagram of your code that you can read instead of the code. It appears inside your
agent's chat (Claude Desktop, Claude Code, VS Code, Codex). You click from Context → Containers →
Components → Code, and anything you ask from the diagram goes to your own agent in the host's chat.
Before the agent builds a feature, it proposes the change on the diagram (drawn dashed), and you can
approve, modify or reject it there.

This repo is the private dev repo: the MCP server, the diagram UI, the Claude Code plugin testers
install, and example projects to test them on. Testers start from [README.md](README.md).

## The plugin

`plugin/` is a Claude Code plugin, and `.claude-plugin/marketplace.json` makes this repo its
marketplace. `plugin/server/` holds the server bundled with every npm package (it runs with plain
`node`, no install) and the map UI. It is committed, so rebuild it before pushing a change testers
should get:

```bash
npm run build:plugin
```

`claude plugin validate .` checks the marketplace and plugin files.

## How it works in a nutshell

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
To install it, open a Terminal window and enter:

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
npm run example -- reference eshoponweb
```

Go to http://localhost:5178 to click through the reference model of eShopOnWeb.
`npm run dev -- <project folder>` opens the map of any project that has a `.vibeblocks/model.yaml`. This dev page is the same UI, backed by the same tool handlers, without
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
  example.ts         example projects: list, reset, compare a map with its reference, open a reference
  seed-acme.ts       draws acme-shop from test/acme.ts (optionally with the voice-search proposal)
  print-views.ts     prints the computed views of a project, for debugging the engine
test/
  model.test.ts      the C4 rules and all-or-nothing batches
  engine.test.ts     rolled-up arrows, scoped views, deterministic layout
  feedback.test.ts   what the agent hears back: strict ops, warnings, coverage, folder refs, readback, the guide's example
  references.test.ts every reference model stays valid and covers every source file
  mcp.e2e.ts         starts dist/mcp.mjs over stdio and drives it like a host
  acme.ts            the hand-written acme-shop operations used by the tests
example-projects/    real projects to test mapping on, and references/ with their reference models (see below)
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
under `"mcpServers"`, then quit Claude Desktop (with Alt+F4 for Windows or with ⌘Q for Mac) and reopen it:

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

## Example projects and reference models

`example-projects/` holds real projects to test mapping on. Each one is code only, with no
`.vibeblocks/` folder, so an agent has to map it from scratch. Next to them,
`example-projects/references/<name>.yaml` is the **reference model** for each one: the answer key a
fresh agent's map is compared against.

| Example | What it is | Source |
|---|---|---|
| `acme-shop` | Tiny shop: React web app, Express API, Postgres, Stripe, SendGrid | written for VibeBlocks |
| `spring-petclinic` | Vet clinic site: one Spring Boot app (server-rendered) and a database | spring-projects/spring-petclinic, Apache-2.0 |
| `conduit` | Medium-style blog: React/Redux frontend, Express/Prisma API, Postgres | two RealWorld repos, MIT |
| `eshoponweb` | .NET shop: MVC site, Blazor admin app, public API, two SQL Server databases | dotnet-architecture/eShopOnWeb, MIT |

Each copied project has a `SOURCE.md` with its origin, commit and licence.

### Testing how well an agent maps a project

1. In your host (e.g. Claude Desktop), ask: *"Map the architecture of
   /absolute/path/to/vibeblocks/example-projects/conduit"*. The agent reads the code and draws the map.
2. Compare it with the reference:
   ```bash
   npm run example -- compare conduit
   ```
   This prints both maps as plain lines (containers, components and their files, arrows between
   containers). To click through the reference itself, run `npm run example -- reference conduit`.
   It opens the dev page on a temporary copy, so the agent's map is left alone.
3. Judge the differences by eye. Ones that matter (a missed container, odd grouping, a missing arrow)
   become a rule in `src/guide.ts` or a check in `src/model/validate.ts`.
4. Start the next run fresh:
   ```bash
   npm run example -- reset conduit
   ```

`npm run example -- list` shows which examples have a map drawn right now. The guide shown to agents
uses a made-up app as its example, so it never gives away a reference.

Without a host, a fresh agent can use the tools from the shell with `scripts/call.ts`, which runs
the freshly built `dist/mcp.mjs`:

> Map the architecture of /path/to/example and show it to me. Use the VibeBlocks tools through
> `node --import tsx scripts/call.ts list` and `node --import tsx scripts/call.ts <tool> '<json>'`
> (run from this repo). Read only files in that folder. Report every update_model call with its
> exact errors and warnings, and anything you had to guess.

### Adding an example

1. Copy the project into `example-projects/<name>/` without its git history, and add a `SOURCE.md`
   (where it came from, commit, licence). Only use projects whose licence allows it.
2. Draft the reference: read the code and build the model through the tools (`update_model` with
   `"path"` set to the example), until it saves with no warnings and every source file is on the map.
3. Move `<name>/.vibeblocks/model.yaml` to `references/<name>.yaml`, delete `<name>/.vibeblocks/`,
   and have a person review it with `npm run example -- reference <name>`. The review is what makes
   it a reference.
4. `npm test` checks that every reference stays valid and covers every source file.

### Decisions the references make

These are the judgment calls in the reference models; when an agent's map differs, these are the
usual reasons. They aren't in the guide yet.

- **Containers are things that run or store data.** Shared libraries (e.g. eShopOnWeb's
  ApplicationCore and Infrastructure) are not containers; their code goes into the components that
  use them, so a file can belong to components in more than one container.
- **A routes or startup file belongs to a "shell" component** (server, routing, layout), not to one
  feature.
- **A single place every call goes through is a component** (Conduit's API client), even if small.
- **Helpers fold into the component that uses them** (connection pools, base classes, utilities).
- **A folder ref (`"dir/"`) is used when the whole folder belongs to one component.**

## Not built yet

Automatic code analysis (indexers, drift detection), undo/history, generating a new project from a
diagram, the VS Code extension shell, Structurizr export, packaging for hosts other than Claude Code.
