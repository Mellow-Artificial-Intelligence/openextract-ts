import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { extractMany, extractManyWithResults } from "./batch.js";
import { extract, extractWithUsage, type ExtractOptions } from "./extract.js";
import { ModelError } from "./exceptions.js";
import { loadSchema } from "./schema.js";
import { Extractor, type ExtractorOptions } from "./session.js";
import { ExtractionStyle } from "./styles.js";
import { RetryPolicy, type ExtractionInputLike, type Usage } from "./types.js";
import type { ExtractManyOptions } from "./batch.js";
import type { LanguageModel } from "./model.js";

const STYLES = [ExtractionStyle.DIRECT, ExtractionStyle.SEARCH, ExtractionStyle.CODE] as const;
const SERVER_VERSION = "0.1.0";

const inputFields = {
  source: z.string().optional().describe("Local path or http(s) URL"),
  data: z.string().optional().describe("Base64-encoded bytes (requires mediaType)"),
  mediaType: z.string().optional().describe("MIME type; required for base64 bytes"),
  name: z.string().optional().describe("Optional input label"),
};

const sharedFields = {
  schema: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .describe("JSON Schema object/string, or a local module:exportName path"),
  model: z.string().optional().describe("AI Gateway id, e.g. openai/gpt-5.5. Defaults to OPENEXTRACT_MODEL."),
  instructions: z.string().optional().describe("Natural-language extraction guidance"),
  style: z.enum(STYLES).optional().describe("direct (default), search, or code"),
  maxInputBytes: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  retryBackoff: z.number().nonnegative().optional(),
  retryMaxBackoff: z.number().nonnegative().optional(),
  timeout: z.number().positive().optional().describe("Model call timeout in seconds"),
};

export interface McpInput {
  source?: string;
  data?: string;
  mediaType?: string;
  name?: string;
}

export interface ExtractorHandle {
  extract(input: ExtractionInputLike, options?: { mediaType?: string }): Promise<unknown>;
  extractWithUsage(
    input: ExtractionInputLike,
    options?: { mediaType?: string },
  ): Promise<{ output: unknown; usage: Usage }>;
  close(): void;
}

export interface CreateOpenExtractMcpServerOptions {
  model?: string;
  extract?: typeof extract;
  extractWithUsage?: typeof extractWithUsage;
  extractMany?: typeof extractMany;
  extractManyWithResults?: typeof extractManyWithResults;
  createExtractor?: (
    schema: z.ZodType<unknown>,
    model: LanguageModel,
    options?: ExtractorOptions,
  ) => ExtractorHandle;
}

export function resolveMcpInput(input: McpInput): ExtractionInputLike {
  if (input.data != null) {
    if (!input.mediaType) throw new Error("mediaType is required when data is base64 bytes.");
    return { source: Buffer.from(input.data, "base64"), mediaType: input.mediaType, name: input.name };
  }
  if (!input.source) throw new Error("Each input needs source (path/URL) or data (base64).");
  return input.mediaType || input.name
    ? { source: input.source, mediaType: input.mediaType, name: input.name }
    : input.source;
}

function extractOptions(args: {
  instructions?: string;
  style?: string;
  mediaType?: string;
  maxInputBytes?: number;
  maxRetries?: number;
  retryBackoff?: number;
  retryMaxBackoff?: number;
  timeout?: number;
}): ExtractOptions {
  return {
    instructions: args.instructions,
    style: args.style,
    mediaType: args.mediaType,
    maxInputBytes: args.maxInputBytes,
    maxRetries: args.maxRetries,
    retryBackoff: args.retryBackoff,
    retryMaxBackoff: args.retryMaxBackoff,
    timeout: args.timeout,
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  const err = error instanceof Error ? error : new Error(String(error));
  const payload: Record<string, unknown> = { error: err.message, errorType: err.name };
  if (error instanceof ModelError) {
    payload.provider = error.provider;
    payload.statusCode = error.statusCode;
    payload.retryable = error.retryable;
    payload.retryAfter = error.retryAfter;
  }
  return payload;
}

function toolResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function capabilities(): Record<string, unknown> {
  return {
    tools: ["extract", "extract_many", "create_extractor", "extractor_extract", "close_extractor"],
    styles: STYLES,
    inputs: ["local path", "http(s) URL", "base64 bytes + mediaType"],
    schemas: ["JSON Schema object", "JSON Schema string", "module:exportName"],
    options: [
      "instructions",
      "style",
      "mediaType",
      "maxInputBytes",
      "maxRetries",
      "retryBackoff",
      "retryMaxBackoff",
      "timeout",
      "maxConcurrency",
      "returnExceptions",
      "includeUsage",
      "includeResults",
    ],
    env: [
      "AI_GATEWAY_API_KEY",
      "OPENEXTRACT_MODEL",
      "OPENEXTRACT_URL_TIMEOUT",
      "OPENEXTRACT_MAX_REDIRECTS",
      "OPENEXTRACT_ALLOW_PRIVATE_URLS",
      "OPENEXTRACT_MAX_INPUT_BYTES",
    ],
    errors: [
      "ExtractionError",
      "InputTooLargeError",
      "ModelError",
      "ProviderNotInstalledError",
      "SchemaValidationError",
      "UrlFetchError",
    ],
  };
}

export function createOpenExtractMcpServer(
  options: CreateOpenExtractMcpServerOptions = {},
): McpServer {
  const runExtract = options.extract ?? extract;
  const runExtractWithUsage = options.extractWithUsage ?? extractWithUsage;
  const runExtractMany = options.extractMany ?? extractMany;
  const runExtractManyWithResults = options.extractManyWithResults ?? extractManyWithResults;
  const createExtractor =
    options.createExtractor ??
    ((schema, model, extractorOptions) => new Extractor(schema, model, extractorOptions));
  const sessions = new Map<string, ExtractorHandle>();

  const resolveModel = (model?: string): string => {
    const id = model ?? options.model ?? process.env.OPENEXTRACT_MODEL;
    if (!id) {
      throw new Error("model is required (pass model or set OPENEXTRACT_MODEL).");
    }
    return id;
  };

  const server = new McpServer(
    { name: "openextract", version: SERVER_VERSION },
    {
      instructions:
        "Use extract for one document and extract_many for batches. " +
        "Pass a JSON Schema (or module:exportName) plus a path, URL, or base64 bytes. " +
        "create_extractor stores schema/model/options for repeated extractor_extract calls.",
      capabilities: { tools: {}, resources: {}, prompts: {}, completions: {} },
    },
  );

  server.registerTool(
    "extract",
    {
      title: "Extract",
      description:
        "Extract structured data from one document, image, audio, or video file. " +
        "Accepts a local path, URL, or base64 bytes.",
      inputSchema: {
        ...sharedFields,
        ...inputFields,
        includeUsage: z.boolean().optional().describe("Return { output, usage } instead of the value"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const schema = await loadSchema(args.schema);
        const input = resolveMcpInput(args);
        const model = resolveModel(args.model);
        const opts = extractOptions(args);
        const payload = args.includeUsage
          ? await runExtractWithUsage(schema, model, input, opts)
          : await runExtract(schema, model, input, opts);
        return toolResult(payload);
      } catch (error) {
        return toolResult(serializeError(error), true);
      }
    },
  );

  server.registerTool(
    "extract_many",
    {
      title: "Extract many",
      description: "Extract structured data from many inputs concurrently. Results keep input order.",
      inputSchema: {
        ...sharedFields,
        mediaType: z.string().optional().describe("Default MIME type applied to every input"),
        inputs: z.array(z.object(inputFields)).min(1).describe("Paths, URLs, or base64 items"),
        maxConcurrency: z.number().int().positive().optional(),
        returnExceptions: z.boolean().optional().describe("Keep going after per-item failures"),
        includeResults: z.boolean().optional().describe("Return ExtractionResult objects with usage"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const schema = await loadSchema(args.schema);
        const inputs = args.inputs.map(resolveMcpInput);
        const model = resolveModel(args.model);
        const opts: ExtractManyOptions = {
          ...extractOptions(args),
          maxConcurrency: args.maxConcurrency,
          returnExceptions: args.returnExceptions,
        };
        const results = args.includeResults
          ? await runExtractManyWithResults(schema, model, inputs, opts)
          : await runExtractMany(schema, model, inputs, opts);
        return toolResult(results.map((item) => (item instanceof Error ? serializeError(item) : item)));
      } catch (error) {
        return toolResult(serializeError(error), true);
      }
    },
  );

  server.registerTool(
    "create_extractor",
    {
      title: "Create extractor",
      description: "Create a reusable extractor session that stores schema, model, style, and retry policy.",
      inputSchema: {
        ...sharedFields,
        includeUsage: z.boolean().optional().describe("Default includeUsage for extractor_extract"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => {
      try {
        const schema = await loadSchema(args.schema);
        const extractor = createExtractor(schema, resolveModel(args.model), {
          instructions: args.instructions,
          style: args.style,
          timeout: args.timeout,
          maxInputBytes: args.maxInputBytes,
          retryPolicy: new RetryPolicy({
            maxRetries: args.maxRetries,
            backoff: args.retryBackoff,
            maxBackoff: args.retryMaxBackoff,
          }),
        });
        const sessionId = randomUUID();
        sessions.set(sessionId, extractor);
        return toolResult({ sessionId, includeUsage: Boolean(args.includeUsage) });
      } catch (error) {
        return toolResult(serializeError(error), true);
      }
    },
  );

  server.registerTool(
    "extractor_extract",
    {
      title: "Extractor extract",
      description: "Run extraction with a session created by create_extractor.",
      inputSchema: {
        sessionId: z.string().describe("Session id from create_extractor"),
        ...inputFields,
        includeUsage: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const extractor = sessions.get(args.sessionId);
        if (!extractor) throw new Error(`Unknown extractor session '${args.sessionId}'.`);
        const input = resolveMcpInput(args);
        const media = args.mediaType ? { mediaType: args.mediaType } : {};
        const payload = args.includeUsage
          ? await extractor.extractWithUsage(input, media)
          : await extractor.extract(input, media);
        return toolResult(payload);
      } catch (error) {
        return toolResult(serializeError(error), true);
      }
    },
  );

  server.registerTool(
    "close_extractor",
    {
      title: "Close extractor",
      description: "Close a reusable extractor session.",
      inputSchema: { sessionId: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sessionId }) => {
      const extractor = sessions.get(sessionId);
      if (extractor) {
        extractor.close();
        sessions.delete(sessionId);
      }
      return toolResult({ closed: true, sessionId });
    },
  );

  server.registerResource(
    "capabilities",
    "openextract://capabilities",
    {
      title: "Capabilities",
      description: "Styles, inputs, options, environment variables, and error types.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(capabilities(), null, 2) }],
    }),
  );

  server.registerResource(
    "api",
    "openextract://docs/api",
    {
      title: "API",
      description: "How to call extract and extract_many over MCP.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# openextract MCP",
            "",
            "Tools: `extract`, `extract_many`, `create_extractor`, `extractor_extract`, `close_extractor`.",
            "Styles: `direct` (any media), `search` and `code` (UTF-8 text only).",
            "Schema: JSON Schema object/string, or `module:exportName` for a local Zod export.",
            "Input: `source` (path or URL) or `data` (base64) plus `mediaType`.",
          ].join("\n"),
        },
      ],
    }),
  );

  const styleArg = completable(z.string().optional().describe("direct, search, or code"), (value) =>
    STYLES.filter((style) => style.startsWith(value ?? "")),
  );

  server.registerPrompt(
    "extract-document",
    {
      title: "Extract document",
      description: "Prompt the model to extract structured fields from one document.",
      argsSchema: {
        source: z.string().describe("Path or URL"),
        schema: z.string().describe("JSON Schema or module:exportName"),
        instructions: z.string().optional().describe("Extraction guidance"),
        style: styleArg,
      },
    },
    ({ source, schema, instructions, style }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Extract structured data from ${source} using the openextract extract tool. ` +
              `Schema: ${schema}. Style: ${style ?? "direct"}.` +
              (instructions ? ` Instructions: ${instructions}` : ""),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "extract-batch",
    {
      title: "Extract batch",
      description: "Prompt the model to extract structured fields from many documents.",
      argsSchema: {
        sources: z.string().describe("Comma-separated paths or URLs"),
        schema: z.string().describe("JSON Schema or module:exportName"),
        instructions: z.string().optional(),
      },
    },
    ({ sources, schema, instructions }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Extract structured data from these inputs with extract_many: ${sources}. ` +
              `Schema: ${schema}.` +
              (instructions ? ` Instructions: ${instructions}` : ""),
          },
        },
      ],
    }),
  );

  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : undefined;
}

export function startOpenExtractMcpHttpServer(
  options: CreateOpenExtractMcpServerOptions & { host?: string; port?: number } = {},
): Server {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
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
    res.writeHead(405, { "content-type": "application/json" }).end(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }),
    );
    return;
  }
  const server = createOpenExtractMcpServer(options);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, await readJsonBody(req));
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: error instanceof Error ? error.message : "Internal server error" },
          id: null,
        }),
      );
    }
  } finally {
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}
