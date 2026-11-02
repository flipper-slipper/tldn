# VibeBlocks: evaluator guide

**How might we use interactive code abstractions to help vibe coders more easily modify AI-generated
code while developing a deeper understanding of how it works?**

VibeBlocks turns a software project into a diagram you can click through, right inside the chat with
your coding agent (Claude Code). You start with the whole system and its users, then go a level deeper
into the apps and databases, then into the parts of each app, and finally into the code itself. You can
ask the agent about anything you click. Before the agent builds a new feature, it draws the change on
the diagram as dashed boxes, and you approve, change or reject it there.

**Who it's for:** people who already use AI as part of their programming process but still want to
understand, and have more agency over, what they build: students, designers, founders, developers new
to a codebase. 

**When they'd use it:** when they open a project
they didn't write (or that the agent wrote), when something breaks and they need to find where, and
before they let the agent make a big change.

Setup takes about 5 minutes. Each task below takes 2 to 5 minutes.

## What you need

- **The Claude desktop app**, signed in to your own Claude account. You'll use its **Code** tab: the
  diagram shows up there. (Claude Code in a terminal works too, but it can only print a text summary
  of the map, not the diagram.)
- **Claude Code's `claude` command** in a terminal, to install the plugin. Check with
  `claude --version`. If you don't have it, install Claude Code from
  [claude.com/claude-code](https://claude.com/claude-code).
- **Node.js 20 or later.** Check with `node --version`. If you don't have it, install it from
  [nodejs.org](https://nodejs.org).

## Set up

### 1. Download this repository

On this page, click **Code → Download ZIP**, then unzip it. You'll get a folder named `tldn-main`.
These steps assume it's in your Downloads folder.

### 2. Install the VibeBlocks plugin

Open a terminal and run these two commands, one at a time:

```bash
claude plugin marketplace add ~/Downloads/tldn-main
```

```bash
claude plugin install vibeblocks@vibeblocks
```

Then **quit the Claude desktop app (⌘Q on Mac) and open it again** so the plugin loads.

### 3. Open the example project

In the desktop app's **Code** tab, start a new session and choose the folder
`tldn-main/example-projects/acme-shop` from the download. It's a small online shop: a web
storefront, a server, a database, and Stripe and SendGrid for payments and email.

### 4. Draw the map

Type:

```
/vibeblocks:map
```

Claude reads the project and draws its diagram. This takes a minute or two the first time; approve the
VibeBlocks tool calls if you're asked. When it's done, the diagram appears in the chat. That's your
starting point for every task.

## Using the diagram

- **Click** a box to select it. The panel on the right says what it is, which code belongs to it, and
  what it talks to.
- **Double-click** a box (or click the pill under it) to go one level deeper: system → apps and
  databases → parts of an app → code.
- **← Zoom out** or the breadcrumbs at the top take you back up.
- **Pinch** with two fingers on a trackpad: keep pinching into a box and it opens; pinch out past the
  whole level to go back up. One pinch moves one level.
- **Arrows** show what talks to what. **Dashed** boxes are either outside services (like Stripe) or
  changes that are proposed but not built yet.
- **Ask the agent:** with something selected, use **Why is this here?**, **Explain**, or type your own
  question and press **Send to chat**. The question goes to Claude in the chat, already pointing at
  what you selected.
- Code is read-only on the diagram. To change it, ask the agent.
- **?** at the top right opens a quick guide to all of this at any time. `/vibeblocks:help` gives the
  same guide in the chat.
- **Open in browser** (or `/vibeblocks:open`) shows the map in a browser tab, where it can fill the
  screen. The tab is view-only: you click around the diagram there and talk to Claude in the chat.
  It updates by itself while Claude is running.

## Tasks

1. **Find where money changes hands.** You just joined the Acme Shop team, and your first ticket is
   about a customer who was charged twice. Find the part of the system that charges customers' cards,
   and open the code that does it.

2. **Trace a broken email.** A shopper says they never got their password-reset email. Find which part
   of the system sends that email, and which outside service actually delivers it. Then ask the agent,
   from the diagram, why that email might not arrive.

3. **Plan a new feature, then change your mind.** Your team wants shoppers to be able to save products
   to a wishlist. Ask Claude in the chat to add a wishlist. Before writing any code it puts the plan on
   the diagram as dashed boxes. Look at what it would add, then use **Modify** to change one thing
   about the plan, and finally **Reject** it. The code shouldn't change.

4. **Approve a feature.** Ask for a small feature you'd actually want (for example, "let shoppers see
   their past orders"). Review the dashed plan and **Approve** it. Claude builds it, and the diagram
   updates so the new parts are drawn solid.

5. **(Optional) Map your own project.** Open one of your own projects in Claude Code and run
   `/vibeblocks:map`. Does the diagram match how you think about it?

## Tools we used

- **Claude Code plugin** and **MCP** (Model Context Protocol): how VibeBlocks plugs into the agent.
- **MCP Apps**: shows the interactive diagram inside the chat.
- **React** and **TypeScript**: the diagram UI and the server.
- **LikeC4** with **Graphviz**: works out which boxes and arrows each level shows, and lays them out.
- **Figma**: the visual design of the diagram (the "Task Flows" file).

## Limitations

**What's faked or done by Claude:** VibeBlocks doesn't analyse code itself yet. Claude reads the
project and draws the diagram through VibeBlocks' tools, and VibeBlocks checks the drawing against the
rules of a C4 diagram and against the files that exist. So:

- Two runs on the same project can draw slightly different diagrams.
- On a large project, drawing the map takes several minutes.
- The diagram is only as accurate as Claude's reading of the code.

**Not built yet:**

- Undo or history of diagram changes.
- Updating the diagram automatically when the code changes. Claude updates it when it builds a feature,
  but edits made outside a VibeBlocks proposal aren't picked up until you run `/vibeblocks:map` again.
- Hosts other than Claude Code (VS Code extension, Codex, Claude chat outside the Code tab).
- Exporting the diagram.

**Known issues:**

- **The diagram doesn't refresh itself in the desktop app.** After Claude changes the code or the
  plan, the diagram already in the chat stays as it was. Claude normally shows the map again; if it
  doesn't, ask it to.
- If Node.js was installed with a version manager (nvm, fnm), the desktop app may not find it, and the
  plugin won't start. Install Node from nodejs.org as well.
- Very large folders on one level make the boxes small. Zoom in to read them.
- The bigger example projects (`conduit`, `spring-petclinic`, `eshoponweb`) take noticeably longer to
  map than `acme-shop`.

## If something goes wrong

- **`/vibeblocks:map` isn't recognised:** the plugin isn't loaded. Run `claude plugin list` in a
  terminal to check it's installed and enabled, then quit and reopen the desktop app.
- **"The vibeblocks server failed to start":** check `node --version` is 20 or later (see the Node.js
  note under known issues).
- **The diagram says "VibeBlocks could not load the map":** you have an older version of the plugin.
  Download the ZIP again, then run `claude plugin marketplace update vibeblocks` and
  `claude plugin update vibeblocks@vibeblocks`, and reopen the app.
- **Install from GitHub instead of the ZIP:** if you have git access to this repo, step 2 can start
  with `claude plugin marketplace add flipper-slipper/tldn` instead.
- **Start a map over:** delete the `.vibeblocks` folder inside the project and run `/vibeblocks:map`
  again.

Building on VibeBlocks itself? See [DEVELOPING.md](DEVELOPING.md).
