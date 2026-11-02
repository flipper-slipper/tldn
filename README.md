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

- **Claude Code**, either in a terminal or in the **Code** tab of the Claude desktop app, signed in to
  your own Claude account.
- **Node.js 20 or later.** Check with `node --version`. If you don't have it, install it from
  [nodejs.org](https://nodejs.org).

## Set up

### 1. Download this repository

On this page, click **Code → Download ZIP**, then unzip it. You'll get a folder named `tldn-main`.
These steps assume it's in your Downloads folder.

### 2. Install the VibeBlocks plugin

Start Claude Code (open a terminal and type `claude`, or open the Code tab in the desktop app), then
type these two commands, one at a time:

```
/plugin marketplace add ~/Downloads/tldn-main
```

```
/plugin install vibeblocks@vibeblocks
```

Then **quit Claude Code and start it again** so the plugin loads.

### 3. Open the example project

Open the folder `example-projects/acme-shop` from the download. It's a small online shop: a web
storefront, a server, a database, and Stripe and SendGrid for payments and email.

- **In a terminal:**

  ```bash
  cd ~/Downloads/tldn-main/example-projects/acme-shop
  ```

  ```bash
  claude
  ```

- **In the desktop app:** start a new session in the Code tab and choose the `acme-shop` folder.

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
- **Arrows** show what talks to what. **Dashed** boxes are either outside services (like Stripe) or
  changes that are proposed but not built yet.
- **Ask the agent:** with something selected, use **Why is this here?**, **Explain**, or type your own
  question and press **Send to chat**. The question goes to Claude in the chat, already pointing at
  what you selected.
- Code is read-only on the diagram. To change it, ask the agent.

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

- **The diagram may not appear in the chat in some versions of the Claude desktop app's Code tab.**
  Claude still prints a text summary of the map. If this happens, try Claude Code in a terminal.
- If Node.js was installed with a version manager (nvm, fnm), the desktop app may not find it, and the
  plugin won't start. Use Claude Code in a terminal instead, or install Node from nodejs.org.
- Very large folders on one level make the boxes small. Zoom in to read them.
- The bigger example projects (`conduit`, `spring-petclinic`, `eshoponweb`) take noticeably longer to
  map than `acme-shop`.

## If something goes wrong

- **`/vibeblocks:map` isn't recognised:** the plugin isn't loaded. Run `/plugin` to check it's
  installed and enabled, then restart Claude Code.
- **"The vibeblocks server failed to start":** check `node --version` is 20 or later (see the Node.js
  note under known issues).
- **Install from GitHub instead of the ZIP:** if you have git access to this repo, step 2 can be
  `/plugin marketplace add flipper-slipper/tldn` instead.
- **Start a map over:** delete the `.vibeblocks` folder inside the project and run `/vibeblocks:map`
  again.

Building on VibeBlocks itself? See [DEVELOPING.md](DEVELOPING.md).
