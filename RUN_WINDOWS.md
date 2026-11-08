# VibeBlocks 0.4.0: Windows run guide

1. Install Node.js **22.22.3 or newer** from https://nodejs.org if necessary.
2. Unzip this archive in your Downloads folder. It should contain `tldn-main`.
3. Open **PowerShell** (not the Node REPL).

## First terminal: map and UI

```powershell
cd "$env:USERPROFILE\Downloads\tldn-main"
node --version
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev -- example-projects/runtime-demo
```

Open `http://localhost:5178` in your browser. The demo's map is already created,
so you do **not** need Claude or a database to try the UI. Click the system,
then the Node Demo App to zoom into the mapped components.

## Second terminal: trace actual running code

```powershell
cd "$env:USERPROFILE\Downloads\tldn-main"
npm.cmd run trace -- --root example-projects/runtime-demo -- node app.mjs
```

Back in the VibeBlocks browser window click **Trace**. The application will record
execution in `app.mjs` and `worker.mjs`, show green boxes for active components,
and show a red box and source line when the intentional bug occurs. The example
finishes after about 12 seconds. Rerun the trace command to replay it.

Use **History** to review diagram versions; the demo starts with one model, so
Undo/Redo are disabled until you change that model through an agent. Use the
**←** button at the top-left to return one level, **↻** to refresh, and **⊡**
to fit the whole diagram on screen.

## Run on your own project

Build and launch the preview on a project containing a VibeBlocks diagram:

```powershell
npm.cmd run dev -- "C:\path\to\your\project"
```

Open a second PowerShell window and trace that Node.js app:

```powershell
npm.cmd run trace -- --root "C:\path\to\your\project" -- node "src\server.js"
```

The script after `--` must actually exist. For an npm start script, replace the
last part with `-- npm run start` (Windows `.cmd` is supported).

## Install the new plugin for Claude Code

After a successful `npm.cmd ci`, run:

```powershell
npm.cmd run build:plugin
claude plugin marketplace add "$env:USERPROFILE\Downloads\tldn-main"
claude plugin install vibeblocks@vibeblocks
```

If you already installed an older VibeBlocks, update or reinstall it from the
same marketplace, then restart Claude. The version in this ZIP is **0.4.0**.

## Troubleshooting

- **npm is blocked in PowerShell:** use `npm.cmd` as shown rather than `npm`.
- **Node is too old:** `node --version` must show version 22.22.3+ (or a newer major).
- **Cannot find `vite`, `tsx`, or `likec4`:** `npm.cmd ci` did not finish; run it again on a working internet connection.
- **Blank/No map:** use `example-projects/runtime-demo` (already seeded), or make the model for your own project through `/vibeblocks:map` in Claude.
- **Trace panel has no activity:** trace the correct project folder, use a Node.js entry point, and click Trace while the app runs. Files must be linked to components to light up their boxes.
- **History only has one version:** it creates revisions when the map is updated by the agent. Restoring a diagram does **not** undo code edits. Use Git for code changes.
