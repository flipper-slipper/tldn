// Call the built MCP server from the shell, for agents or people without the server connected.
//   node --import tsx scripts/call.ts list                 tool names, descriptions and inputs
//   node --import tsx scripts/call.ts <tool> '<json args>'  e.g. get_guide '{}'
//   node --import tsx scripts/call.ts <tool> @args.json    args read from a file
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [tool, arg = '{}'] = process.argv.slice(2);
const client = new Client({ name: 'vibeblocks-cli', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(import.meta.dirname, '../dist/mcp.mjs')] }));
if (!tool || tool === 'list') {
  for (const t of (await client.listTools()).tools) {
    if ((t._meta as any)?.ui?.visibility?.includes?.('app') && !(t._meta as any)?.ui?.visibility?.includes?.('model')) continue;
    console.log(`## ${t.name}\n${t.description}\ninput: ${JSON.stringify(t.inputSchema)}\n`);
  }
} else {
  const args = JSON.parse(arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8') : arg);
  const r: any = await client.callTool({ name: tool, arguments: args });
  console.log(r.content?.map((c: any) => c.text).join('\n'));
}
await client.close();
