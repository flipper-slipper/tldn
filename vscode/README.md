# VibeBlocks for VS Code

An interactive C4 map of your project, beside your code. Click from the whole system (Context) into
its apps and databases (Containers), their parts (Components), and the code itself. Ask your coding
agent about anything you select, and approve or reject the changes it proposes on the map.

## Use it

1. Install the VibeBlocks plugin for Claude Code, and draw the map once with `/vibeblocks:map`.
2. Run **VibeBlocks: Show Map** from the Command Palette, or click **VibeBlocks** in the status bar.
3. Select a box and press **Why is this here?**, **Explain**, or type your own question. It goes to
   your agent's chat, pointing at what you selected.
4. At the code level, **Open in editor** opens the file at that spot.

When Claude Code in VS Code shows the map, it opens in this panel.

## Which agent

The **VibeBlocks: Agent** setting picks where questions and approvals go:

- **auto** (default): Claude Code if it is installed, else GitHub Copilot Chat, else the clipboard.
- **claude-code**, **copilot**, or **clipboard** (copy, then paste into any agent).

The agent keeps the map current through the VibeBlocks MCP tools; the panel redraws by itself.
