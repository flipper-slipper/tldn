# VibeBlocks repair notes (audit of 8 November 2026)

This release patches the source tree from `tldn-main.zip` in response to the 46-item audit.
**The diagram layout, appearance, CSS, controls, and the Acme Shop JSX layout were not redesigned.**
The repaired source **has not passed a full build or test run** in this environment: registry
access was unavailable, installed Node 22.16.0 is below LikeC4's minimum of 22.22.3, and
required npm packages could not be restored. The TypeScript parser accepted all 83 `.ts`/`.tsx`
files, and a standalone source-file reader smoke test passed. This is not a substitute for a
working integration build. Run the commands below before any evaluation or deployment.

## Build from source (required)

```bash
node --version                       # must be >=22.22.3
npm ci
npm run typecheck
npm test
npm run build:plugin                 # replaces the intentional unbuilt MCP entrypoint
npm run build:vscode                 # produces a new VSIX; needs VSCE download
npm run test:e2e                    # after normal npm run build
```

Install the Claude plugin *after* `build:plugin`, not before. `plugin/server/mcp.mjs` is an
intentional "build required" stub, NOT an old security-vulnerable compiled server.
`plugin/server/ui/index.html` and the former `vscode/vibeblocks-0.1.0.vsix` are excluded:
build fresh versions from the patched source.

## Fix-by-finding index

| Audit | Patch / assessment |
|---|---|
| 1 | **Model approval enforced**: proposals have a UUID, approval flag and model revision; `applyProposal` rejects unapproved changes; direct `updateModel` is blocked while a proposal is open. Agent-side direct filesystem edits remain outside this service's control. |
| 2 | **Fixed**: realpath checks and repo-boundary checks reject escaping symlinks and traversal. |
| 3 | **Fixed**: source file revision joins the view cache key; file additions and metadata edits cause refresh. |
| 4 | **Fixed**: malformed operation names use `Object.hasOwn` and arrays are validated. |
| 5 | **Fixed**: model hash bound to proposal and checked before approval/application; write lock prevents concurrent VibeBlocks operations. |
| 6 | **Fixed default**: HTML exports contain map metadata only. `--include-code` is explicit, warns about leaks, and limits embedding; sensitive filenames excluded. No automated redaction can guarantee private strings inside ordinary source are safe to publish. |
| 7 | **Improved, not a parser guarantee**: comment-only and string-only symbols no longer satisfy declaration checks; conservative declaration detection. Additional language-specific AST parsers would be needed for full semantic correctness. |
| 8 | **Fixed**: all components are independently checked for missing relationships. |
| 9 | **Fixed**: repo-root `./` references are invalid and do not count toward coverage. |
| 10 | **Fixed**: malformed proposal YAML is quarantined and never executed. |
| 11 | **Fixed**: documentation and package engines require Node >=22.22.3. |
| 12 | **Fixed**: MCP uses `fileURLToPath()` for import paths. |
| 13 | **Fixed**: code viewer handles deleted code references and closes stale selection. |
| 14 | **Fixed**: source revision invalidates the open code viewer and cache. |
| 15 | **Fixed**: successful data refresh clears transient errors. |
| 16 | **Fixed bounded behavior**: browser chat now has body limits, max message size, concurrent request limits, rate limits, timeouts and session cap. |
| 17 | **Fixed**: chat resume sessions are tied to the project's bearer token and expire. |
| 18 | **Fixed**: size, UTF-8, binary and filesystem-type restrictions on source reads. |
| 19 | **Fixed for VibeBlocks service writes**: temp + fsync + atomic rename, lock on read/validate/write. External programs writing `.vibeblocks` directly cannot be serialized by VibeBlocks. |
| 20 | **Fixed**: code links route to the correct reference index. |
| 21 | **Fixed without changing visible UI**: Modify text submits on Enter and blur; Escape cancels; a title hint explains keyboard action. A new visible Submit button was intentionally not added. |
| 22 | **Fixed**: code-reading effects cancel stale asynchronous responses. |
| 23 | **Fixed**: code cache keyed by project root + source revision + file + symbol and bounded. |
| 24 | **Improved**: scanner covers more frontend, config, notebook, R and shell extensions. |
| 25 | **Fixed**: truncated file scans are explicitly flagged and warned. |
| 26 | **Fixed visibility/configuration**: skipped directories are reported and configurable. |
| 27 | **Fixed**: already-open VS Code panels receive focus updates. |
| 28 | **Improved**: VS Code extension search uses additional platform/install directories and falls back to browser; cannot discover every disabled/custom-host case reliably without querying VS Code itself. |
| 29 | **Fixed late result handling**: host metadata arriving after initialization dispatches a refresh/focus event. The timeout remains only as a fallback, not the last chance to receive metadata. |
| 30 | **Improved**: code range estimation checks declarations first and remains explicitly approximate, not language-complete AST highlighting. |
| 31 | **Fixed**: snapshots expose included/omitted reference counts and return missing-file guidance. |
| 32 | **Documented inherent limitation**: Claude still constructs semantic architecture maps. No independent repository-wide proof of map correctness was added. |
| 33 | **Fixed**: package, plugin and VS Code version set to 0.3.1. |
| 34 | **Fixed**: docs align with rebuild-required sources and available export/VS Code features. |
| 35 | **Improved**: regression tests for service authorization, source boundaries, crashes, cache, snapshots and browser authorization added. Full React/VS Code integration automation still requires a running host and was not tested here. |
| 36 | **Partially addressed**: map history with `undo_model` for 25 revisions. External code edits, source undo and human-reviewed code diffing require source control / agent hooks and are not provided. |
| 37 | **Fixed**: development server only serves its configured local root; arbitrary `args.path` is rejected. |
| 38 | **Fixed for new credentials**: salted scrypt password hashing with constant-time comparison. Existing Base64 credentials must be migrated or reset. |
| 39 | **Fixed**: random one-use, expiring, hashed password-reset tokens with transactional consumption. |
| 40 | **Fixed**: authenticated checkout takes product ID/quantity, loads trusted database prices and calculates totals server-side. |
| 41 | **Fixed design**: idempotency keys, durable pending orders, database transactions and Stripe hosted checkout. Race handling added for cancellation. Requires live Stripe integration tests. |
| 42 | **Fixed design**: authenticated owner check and idempotent cancellation/refund; webhook handles late paid cancelled orders. Requires integration tests. |
| 43 | **Fixed functionality without visible UI change**: cart supports product selection via `?product=<uuid>`, a `acme:add-to-cart` event, and persistence. No new storefront button was added, to respect the no-UI-change request. |
| 44 | **Fixed design**: Stripe Checkout redirects + verified raw-body webhook. Requires real Stripe webhook, credentials and migration to verify end-to-end. |
| 45 | **Fixed manifests**: sample declares `tsx`, `vite` and TypeScript types. |
| 46 | **Fixed distribution**: old unencrypted ASP.NET sample Data Protection key deleted and ignored. |

## Acme Shop configuration

In `example-projects/acme-shop/`, install dependencies (`npm install`), load `db/schema.sql`
into PostgreSQL, create or migrate user/product data, and configure `DATABASE_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_URL`, and SendGrid credentials.
The current schema is intended for a fresh demo database; **do not apply it directly to
existing production tables** without planning a migration. The existing login screen has no
registration/reset screen. Test payment flows with Stripe test mode and a public webhook forwarder.

## Remaining scope and limitations

This is a best-effort source repair, not a verified promise that every possible bug is gone.
The original audit noted unavoidable design limitations and behaviors outside the VibeBlocks
service's authority. This ZIP does **not** contain a working rebuilt plugin/VSIX, nor does it
claim live Claude, VS Code, Graphviz/LikeC4, Stripe or SendGrid integration tests succeeded.
The bundled third-party example applications beyond Acme Shop were not exhaustively audited.
