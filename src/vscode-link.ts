// When the agent runs inside VS Code (the Claude Code extension) and the VibeBlocks VS Code extension
// is installed, show_map opens the map in that extension's panel instead of a browser tab, through
// its vscode://vibeblocks.vibeblocks/show link.
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const inVsCode = () => process.env.CLAUDE_CODE_ENTRYPOINT === 'claude-vscode' || process.env.TERM_PROGRAM === 'vscode';

function extensionInstalled(): boolean {
  try { return fs.readdirSync(path.join(os.homedir(), '.vscode', 'extensions')).some((d) => d.startsWith('vibeblocks.vibeblocks-')); } catch { return false; }
}

/** Ask VS Code to show the map of `root`. False when this isn't VS Code or the extension is missing. */
export function openInVsCode(root: string, focus?: string): boolean {
  if (process.env.VIBEBLOCKS_BROWSER === 'always' || !inVsCode() || !extensionInstalled()) return false;
  const link = `vscode://vibeblocks.vibeblocks/show?${new URLSearchParams({ path: root, ...(focus ? { focus } : {}) })}`;
  if (process.env.VIBEBLOCKS_NO_BROWSER === '1') return true;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [link]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : ['xdg-open', [link]];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return true;
}
