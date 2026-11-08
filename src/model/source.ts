/** Defensive source-file access and best-effort declaration lookup (not a full language parser). */
import * as fs from 'node:fs';
import * as path from 'node:path';

export const MAX_CODE_BYTES = 2_000_000;
export function safeSourcePath(root: string, file: string, kind: 'file' | 'dir' = 'file'): string | null {
  if (!file || file.includes('\0') || path.isAbsolute(file) || /^[A-Za-z]:/.test(file)) return null;
  try {
    const base = fs.realpathSync(root);
    const real = fs.realpathSync(path.resolve(base, file));
    if (real === base || !real.startsWith(base + path.sep)) return null;
    const info = fs.statSync(real);
    if (kind === 'dir') return info.isDirectory() ? real : null;
    return info.isFile() && info.size <= MAX_CODE_BYTES ? real : null;
  } catch { return null; }
}

export function sourceText(root: string, file: string): string | null {
  const real = safeSourcePath(root, file);
  if (!real) return null;
  try {
    const bytes = fs.readFileSync(real);
    if (bytes.includes(0)) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch { return null; }
}

/** Mask strings and comments before looking for a declaration. The result is deliberately conservative. */
function cleanLines(text: string): string[] {
  let block = false;
  return text.split('\n').map((line) => {
    let out = '', quote = '', escaped = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (block) { if (c === '*' && n === '/') { block = false; out += '  '; i++; } else out += ' '; continue; }
      if (quote) {
        if (!escaped && c === quote) quote = '';
        if (c === '\\' && !escaped) escaped = true; else escaped = false;
        out += ' '; continue;
      }
      if (c === '/' && n === '*') { block = true; out += '  '; i++; continue; }
      if ((c === '/' && n === '/') || c === '#') { out += ' '.repeat(line.length - i); break; }
      if (c === '"' || c === "'" || c === '`') { quote = c; out += ' '; continue; }
      out += c;
    }
    return out;
  });
}

export function findDeclarationLine(text: string, symbol: string): number {
  if (!/^[A-Za-z_$][\w$]*$/.test(symbol)) return -1;
  const name = symbol.replace(/\$/g, '\\$');
  // TypeScript, JavaScript, Python, Rust, Go, Ruby, Java, C#, C, C++, Swift.
  const declarations = [
    new RegExp(`\\b(?:class|function|const|let|var|def|interface|type|enum|struct|trait|fn|func|module|protocol|record|object)\\s+${name}\\b`),
    new RegExp(`^\\s*(?:(?:export|public|private|protected|static|async|final|override|internal|open|inline|abstract|virtual|fun|func|def)\\s+)*${name}\\s*\\(`),
    new RegExp(`^\\s*(?:(?:public|private|protected|static|async|final|internal|export|const|readonly|virtual|override)\\s+)*(?:[\\w<>,.?*\\[\\]]+\\s+)+${name}\\s*\\(`),
    new RegExp(`^\\s*(?:export\\s+)?${name}\\s*[:=]\\s*(?:function\\b|\\(?[\\w,\\s]*\\)?\\s*=>)`),
  ];
  return cleanLines(text).findIndex((line) => declarations.some((decl) => decl.test(line)));
}

/** Source excerpt end; returns just the declaration line when its boundaries aren't reliable. */
export function declarationEnd(text: string, start: number): number {
  const lines = cleanLines(text);
  const lead = lines[start]?.match(/^\s*/)?.[0].length ?? 0;
  let depth = 0, began = false;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') { depth++; began = true; } else if (ch === '}' && began) depth--; }
    if (began && depth <= 0) return i;
    if (!began && i > start && lines[i].trim() && (lines[i].match(/^\s*/)?.[0].length ?? 0) <= lead) return i - 1;
  }
  return began ? lines.length - 1 : start;
}
