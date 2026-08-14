#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { toError } from "./errors.js";
import { createOpenExtractMcpServer, startOpenExtractMcpHttpServer } from "./mcp.js";

function usage(code = 0): never {
  const stream = code === 0 ? console.log : console.error;
  stream(`Usage: openextract-mcp [--http] [--host 127.0.0.1] [--port 3000]

Start an MCP server that exposes extract, extract_many, and extractor sessions.

  (default)   stdio transport for Cursor, Claude Desktop, and other MCP hosts
  --http      Streamable HTTP on --host/--port (POST /)

Environment: AI_GATEWAY_API_KEY, OPENEXTRACT_MODEL`);
  process.exit(code);
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
    else {
      console.error(`error: unknown option ${arg}`);
      usage(1);
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("error: --port must be an integer from 1 to 65535");
    process.exit(1);
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(toError(error).message);
    process.exit(1);
  });
}
