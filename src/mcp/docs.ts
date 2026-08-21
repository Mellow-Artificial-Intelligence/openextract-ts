import { SWARM_REDUCES } from "../reduce.js";
import { EXTRACTION_STYLES } from "../styles.js";

export const MCP_TOOLS = [
  "extract",
  "extract_many",
  "extract_swarm",
  "create_extractor",
  "extractor_extract",
  "close_extractor",
] as const;

export const SERVER_INSTRUCTIONS =
  "Use extract for one document, extract_many for batches, and extract_swarm to run parallel agents on one input. " +
  "Pass a JSON Schema (or module:exportName) plus a path, URL, or base64 bytes. " +
  "Importable agents use agent / agents as module:exportName defineAgent exports. " +
  "Use model claude-code or codex with style sandbox to extract inside a Vercel Sandbox. " +
  "create_extractor stores schema/model/options for repeated extractor_extract calls.";

export function capabilities(): Record<string, unknown> {
  return {
    tools: [...MCP_TOOLS],
    styles: EXTRACTION_STYLES,
    inputs: ["local path", "http(s) URL", "base64 bytes + mediaType"],
    schemas: ["JSON Schema object", "JSON Schema string", "module:exportName"],
    agents: ["defineAgent", "defineRemoteAgent", "outputSchema", "subagents/", "directory", "module:exportName"],
    options: [
      "instructions",
      "style",
      "mediaType",
      "maxInputBytes",
      "maxRetries",
      "retryBackoff",
      "retryMaxBackoff",
      "timeout",
      "sandbox",
      "maxConcurrency",
      "returnExceptions",
      "includeUsage",
      "includeResults",
      "size",
      "models",
      "agent",
      "agents",
      "reduce",
    ],
    env: [
      "AI_GATEWAY_API_KEY",
      "OPENEXTRACT_MODEL",
      "OPENEXTRACT_URL_TIMEOUT",
      "OPENEXTRACT_MAX_REDIRECTS",
      "OPENEXTRACT_ALLOW_PRIVATE_URLS",
      "OPENEXTRACT_MAX_INPUT_BYTES",
      "OPENEXTRACT_SANDBOX_TIMEOUT",
      "OPENEXTRACT_SANDBOX_SNAPSHOT_ID",
      "VERCEL_TOKEN",
      "VERCEL_TEAM_ID",
      "VERCEL_PROJECT_ID",
    ],
    errors: [
      "ExtractionError",
      "InputTooLargeError",
      "ModelError",
      "ProviderNotInstalledError",
      "SchemaValidationError",
      "UrlFetchError",
      "RemoteAgentError",
    ],
  };
}

export const API_MARKDOWN = [
  "# openextract MCP",
  "",
  `Tools: ${MCP_TOOLS.map((name) => `\`${name}\``).join(", ")}.`,
  "Styles: `direct` (any media), `search` and `code` (UTF-8 text only), `sandbox` (Claude Code or Codex in a Vercel Sandbox).",
  "Schema: JSON Schema object/string, or `module:exportName` for a local Zod export.",
  "Agents: `agent` / `agents` as a directory (`agent.ts` + `subagents/`), file, or `module:exportName`.",
  `Swarm: \`size\`, \`models\`, or \`agents\`; \`reduce\` is \`${SWARM_REDUCES[0]}\` (default), ` +
    `\`${SWARM_REDUCES[1]}\`, or \`${SWARM_REDUCES[2]}\`.`,
  "Input: `source` (path or URL) or `data` (base64) plus `mediaType`.",
  "Guide: https://mellow-artificial-intelligence.github.io/openextract-ts/mcp.html",
].join("\n");
