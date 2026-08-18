import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOpenExtractMcpServer, type CreateOpenExtractMcpServerOptions } from "./server.js";

export interface McpHttpOptions extends CreateOpenExtractMcpServerOptions {
  host?: string;
  port?: number;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : undefined;
}

function writeJsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" }).end(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
  );
}

export function startOpenExtractMcpHttpServer(options: McpHttpOptions = {}): Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? /* v8 ignore next */ 3000;
  const httpServer = createServer((req, res) => {
    void handleHttp(req, res, options);
  });
  httpServer.listen(port, host);
  return httpServer;
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  options: CreateOpenExtractMcpServerOptions,
): Promise<void> {
  if (req.method !== "POST") {
    writeJsonRpcError(res, 405, -32000, "Method not allowed.");
    return;
  }
  const server = createOpenExtractMcpServer(options);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, await readJsonBody(req));
  } catch (error) {
    if (!res.headersSent) {
      writeJsonRpcError(
        res,
        500,
        -32603,
        error instanceof Error ? error.message : /* v8 ignore next */ "Internal server error",
      );
    }
  } finally {
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}
