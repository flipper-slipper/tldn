// Files in <repo>/.vibeblocks/:
//   model.yaml     the C4 model (commit it)
//   proposal.yaml  a change the agent proposed and the user has not approved yet
import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { Model } from './schema';
import { Validation, repoReader, validate } from './validate';

export const DIR = '.vibeblocks';
const modelFile = (root: string) => path.join(root, DIR, 'model.yaml');
const proposalFile = (root: string) => path.join(root, DIR, 'proposal.yaml');

export interface Proposal { summary: string; ops: unknown[]; created: string }

/** null when the repo has no model yet. An invalid file still loads, with its errors, so the UI can show them. */
export function loadModel(root: string): (Validation & { raw: unknown }) | null {
  let text: string;
  try { text = fs.readFileSync(modelFile(root), 'utf8'); } catch { return null; }
  let raw: unknown;
  try { raw = YAML.parse(text); } catch (e) { return { raw: null, errors: [{ path: 'model.yaml', message: `not valid YAML: ${(e as Error).message}` }], warnings: [] }; }
  return { raw, ...validate(raw, repoReader(root)) };
}

export function saveModel(root: string, m: Model): void {
  fs.mkdirSync(path.join(root, DIR), { recursive: true });
  const header = '# VibeBlocks C4 model. Edited by your agent through VibeBlocks; commit it with the code.\n';
  fs.writeFileSync(modelFile(root), header + YAML.stringify(m, { lineWidth: 0 }));
}

export function loadProposal(root: string): Proposal | null {
  try { return YAML.parse(fs.readFileSync(proposalFile(root), 'utf8')) as Proposal; } catch { return null; }
}

export function saveProposal(root: string, p: Proposal | null): void {
  if (!p) { fs.rmSync(proposalFile(root), { force: true }); return; }
  fs.mkdirSync(path.join(root, DIR), { recursive: true });
  fs.writeFileSync(proposalFile(root), YAML.stringify(p, { lineWidth: 0 }));
}
