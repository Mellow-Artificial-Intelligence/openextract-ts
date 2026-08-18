import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import {
  isDefinedAgent,
  loadAgent,
  loadAgents,
  resolveOutputSchema,
  type DefinedAgent,
  type ExtractAgent,
} from "../agent.js";
import { extractMany, extractManyWithResults, type ExtractManyOptions } from "../batch.js";
import { extract, extractWithUsage } from "../extract.js";
import { SWARM_REDUCES } from "../reduce.js";
import { loadSchema } from "../schema.js";
import {
  resolveSerializedInput,
  toExtractOptions,
  type SerializedInput,
} from "../serialized.js";
import { Extractor, type ExtractorOptions } from "../session.js";
import {
  extractSwarm,
  extractSwarmWithResults,
  type ExtractSwarmOptions,
  type SwarmMember,
} from "../swarm.js";
import { RetryPolicy, type ExtractionInputLike, type Usage } from "../types.js";
import { API_MARKDOWN, SERVER_INSTRUCTIONS, capabilities } from "./docs.js";
import { completeStyle, inputFields, maxConcurrencyField, sharedFields } from "./fields.js";
import { runTool, serializeItem, toolResult, userMessage } from "./results.js";

const SERVER_VERSION = "0.1.0";

export type McpInput = SerializedInput;

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
  extractSwarm?: typeof extractSwarm;
  extractSwarmWithResults?: typeof extractSwarmWithResults;
  createExtractor?: (
    schema: z.ZodType<unknown>,
    model: ExtractAgent,
    options?: ExtractorOptions,
  ) => ExtractorHandle;
}

export const resolveMcpInput = resolveSerializedInput;

const TOOL_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

export function createOpenExtractMcpServer(
  options: CreateOpenExtractMcpServerOptions = {},
): McpServer {
  const runExtract = options.extract ?? extract;
  const runExtractWithUsage = options.extractWithUsage ?? extractWithUsage;
  const runExtractMany = options.extractMany ?? extractMany;
  const runExtractManyWithResults = options.extractManyWithResults ?? extractManyWithResults;
  const runExtractSwarm = options.extractSwarm ?? extractSwarm;
  const runExtractSwarmWithResults = options.extractSwarmWithResults ?? extractSwarmWithResults;
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

  const resolveSchema = async (
    schema: unknown,
    agents: DefinedAgent[] | undefined,
  ): Promise<z.ZodType<unknown>> => {
    if (schema != null) return loadSchema(schema);
    const agent = agents?.[0];
    if (agent) return resolveOutputSchema(agent);
    throw new Error("schema is required unless agent has outputSchema.");
  };

  /** One agent path or one model id, plus the schema it should produce. */
  const resolveTarget = async (args: { agent?: string; model?: string; schema?: unknown }) => {
    const model: ExtractAgent = args.agent ? await loadAgent(args.agent) : resolveModel(args.model);
    const schema = await resolveSchema(args.schema, isDefinedAgent(model) ? [model] : undefined);
    return { model, schema };
  };

  const server = new McpServer(
    { name: "openextract", version: SERVER_VERSION },
    {
      instructions: SERVER_INSTRUCTIONS,
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
      annotations: TOOL_ANNOTATIONS,
    },
    async (args) =>
      runTool(async () => {
        const { model, schema } = await resolveTarget(args);
        const input = resolveMcpInput(args);
        const opts = toExtractOptions(args);
        return args.includeUsage
          ? runExtractWithUsage(schema, model, input, opts)
          : runExtract(schema, model, input, opts);
      }),
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
        maxConcurrency: maxConcurrencyField,
        returnExceptions: z.boolean().optional().describe("Keep going after per-item failures"),
        includeResults: z.boolean().optional().describe("Return ExtractionResult objects with usage"),
      },
      annotations: TOOL_ANNOTATIONS,
    },
    async (args) =>
      runTool(async () => {
        const { model, schema } = await resolveTarget(args);
        const inputs = args.inputs.map(resolveMcpInput);
        const opts: ExtractManyOptions = {
          ...toExtractOptions(args),
          maxConcurrency: args.maxConcurrency,
          returnExceptions: args.returnExceptions,
        };
        const results = args.includeResults
          ? await runExtractManyWithResults(schema, model, inputs, opts)
          : await runExtractMany(schema, model, inputs, opts);
        return results.map(serializeItem);
      }),
  );

  server.registerTool(
    "extract_swarm",
    {
      title: "Extract swarm",
      description:
        "Run several extraction agents in parallel on one input, then reduce their outputs " +
        "(merge filled fields / unique rows, vote, or take the first success).",
      inputSchema: {
        ...sharedFields,
        ...inputFields,
        models: z.array(z.string()).min(1).optional().describe("Agent model ids. Overrides model+size when set."),
        agents: z
          .array(z.string())
          .min(1)
          .optional()
          .describe("module:exportName defineAgent exports. Overrides models when set."),
        size: z.number().int().positive().optional().describe("Repeat model this many times (default 1)"),
        reduce: z.enum(SWARM_REDUCES).optional().describe("merge (default), vote, or first"),
        maxConcurrency: maxConcurrencyField,
        includeResults: z.boolean().optional().describe("Return output plus per-agent results and usage"),
      },
      annotations: TOOL_ANNOTATIONS,
    },
    async (args) =>
      runTool(async () => {
        const loaded = args.agents?.length
          ? await loadAgents(args.agents)
          : args.agent
            ? [await loadAgent(args.agent)]
            : undefined;
        const schema = await resolveSchema(args.schema, loaded);
        const input = resolveMcpInput(args);
        const members: DefinedAgent[] | SwarmMember[] | string =
          loaded ?? (args.models?.length ? args.models.map((model) => ({ model })) : resolveModel(args.model));
        const opts: ExtractSwarmOptions = {
          ...toExtractOptions(args),
          size: args.agents?.length || args.models?.length ? undefined : args.size,
          reduce: args.reduce,
          maxConcurrency: args.maxConcurrency,
        };
        if (!args.includeResults) return runExtractSwarm(schema, members, input, opts);
        const swarm = await runExtractSwarmWithResults(schema, members, input, opts);
        return {
          output: swarm.output,
          usage: swarm.usage,
          reduce: swarm.reduce,
          agents: swarm.agents.map(serializeItem),
        };
      }),
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
      annotations: { ...TOOL_ANNOTATIONS, openWorldHint: false },
    },
    async (args) =>
      runTool(async () => {
        const { model, schema } = await resolveTarget(args);
        const extractor = createExtractor(schema, model, {
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
        return { sessionId, includeUsage: Boolean(args.includeUsage) };
      }),
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
      annotations: TOOL_ANNOTATIONS,
    },
    async (args) =>
      runTool(async () => {
        const extractor = sessions.get(args.sessionId);
        if (!extractor) throw new Error(`Unknown extractor session '${args.sessionId}'.`);
        const input = resolveMcpInput(args);
        const media = args.mediaType ? { mediaType: args.mediaType } : {};
        return args.includeUsage
          ? extractor.extractWithUsage(input, media)
          : extractor.extract(input, media);
      }),
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
      description: "How to call extract, extract_many, and extract_swarm over MCP.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: API_MARKDOWN }],
    }),
  );

  const styleArg = completable(z.string().optional().describe("direct, search, or code"), completeStyle);

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
    ({ source, schema, instructions, style }) =>
      userMessage(
        `Extract structured data from ${source} using the openextract extract tool. ` +
          `Schema: ${schema}. Style: ${style ?? "direct"}.`,
        instructions,
      ),
  );

  server.registerPrompt(
    "extract-swarm",
    {
      title: "Extract swarm",
      description: "Prompt the model to extract with several parallel agents on one document.",
      argsSchema: {
        source: z.string().describe("Path or URL"),
        schema: z.string().describe("JSON Schema or module:exportName"),
        size: z.string().optional().describe("Number of agents"),
        instructions: z.string().optional(),
      },
    },
    ({ source, schema, size, instructions }) =>
      userMessage(
        `Extract structured data from ${source} using the openextract extract_swarm tool. ` +
          `Schema: ${schema}. Agents: ${size ?? "3"} (or pass agents as module:exportName).`,
        instructions,
      ),
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
    ({ sources, schema, instructions }) =>
      userMessage(
        `Extract structured data from these inputs with extract_many: ${sources}. Schema: ${schema}.`,
        instructions,
      ),
  );

  return server;
}
