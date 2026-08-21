#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fail, isMainModule, printError, printUsage } from "./cli/runtime.js";
import { createOpenExtractMcpServer, startOpenExtractMcpHttpServer } from "./mcp.js";

export { isMainModule };

const USAGE = `Usage: openextract-mcp [--http] [--host 127.0.0.1] [--port 3000]

Start an MCP server that exposes extract, extract_many, and extractor sessions.

  (default)   stdio transport for Cursor, Claude Desktop, and other MCP hosts
  --http      Streamable HTTP on --host/--port (POST /)

Environment: AI_GATEWAY_API_KEY, OPENEXTRACT_MODEL`;

function usage(code = 0): never {
  return printUsage(USAGE, code);
}

function parseArgs(argv: string[]) {
  let http = false;
  let host = "127.0.0.1";
  let port = 3000;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--http") http = true;
    else if (arg === "--host") host = argv[++i] ?? usage(1);
    else if (arg === "--port") port = Number(argv[++i] ?? usage(1));
    else if (arg === "--help" || arg === "-h") usage(0);
    else fail(`unknown option ${arg}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("--port must be an integer from 1 to 65535");
  }
  return { http, host, port };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.http) {
    startOpenExtractMcpHttpServer({ host: args.host, port: args.port });
    console.error(`openextract MCP listening on http://${args.host}:${args.port}`);
    return;
  }
  const server = createOpenExtractMcpServer();
  await server.connect(new StdioServerTransport());
}

/* v8 ignore next 6 -- process entry */
if (isMainModule(import.meta.url, process.argv[1])) {
  void main().catch((error) => {
    printError(error);
    process.exit(1);
  });
}
