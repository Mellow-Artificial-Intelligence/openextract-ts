# API reference

## Terminal UI

`openextract` and `openextract --tui [input]` launch an OpenTUI app. The TUI calls `extractWithUsage` with a schema from a preset, field list, JSON example, JSON Schema, or `module:export`. It requires Bun or Node.js 26.4+ with `--experimental-ffi`.

## Local web UI

`npm run web` starts the Next.js UI in `web/`. **Extract** describes columns, streams a schema, then runs a team of specialists on one source (`POST /api/extract`). Team size, per-member models, **Workflows**, and **Sandboxes** live in the Team sheet. Gateway models use `direct` / `search` / `code`; Claude Code and Codex join as independent sandbox members when Sandboxes is on. Each coding agent has harness settings: inner model id, Claude Code max turns, or Codex reasoning effort (`POST` `model` like `claude-code/claude-sonnet-4-6` plus optional `coding`). Workflows on starts `extractTableWorkflow`; off runs in-process. **Agents** (`POST /api/cookbook`) is a system builder: a named system or a blank roster of specialists (gateway models, Claude Code, Codex) with per-agent style, instructions, and reduce (`merge` / `vote` / `first`). Send `{ system: { schema, reduce, sandbox, docs, agents } }`. Set `AI_GATEWAY_API_KEY` in `web/.env.local`. On Vercel, set the Git root directory to `web/` (see `web/vercel.json`); AI Gateway authenticates with OIDC. Pull-request preview deploys are skipped. Inspect durable table runs with `npx workflow web`. CLI `--models` assigns one model per agent.

## Extraction

### `extract(schema, model, inputFile, options?)` / `extract(agent, inputFile, options?)`

Extract one input and return a value matching `schema`. `model` may be an AI Gateway id, a `LanguageModel`, or a `defineAgent` / `defineRemoteAgent` export. `extract(agent, input)` uses the agent's `outputSchema`.

### `extractWithUsage(schema, model, inputFile, options?)`

Same as `extract`, returning `{ output, usage }`.

### `extractMany(schema, model, inputFiles, options?)`

Concurrent batch extraction. Results preserve input order. Set `returnExceptions: true` to keep going after per-item failures.

### `extractManyWithResults(schema, model, inputFiles, options?)`

Batch API returning `ExtractionResult` objects (output, usage, attempts, duration, model/media metadata, sanitized source).

### `iterExtractMany(schema, model, inputFiles, options?)`

Async generator of `[index, result]` pairs in completion order.

### `defineAgent(config)` / `defineRemoteAgent(config)`

Eve-shaped extract workers. Default-export them; there is no `name` field. `defineAgent` takes `description` (required), `model`, `outputSchema`, plus openextract knobs `style` / `instructions`. `defineRemoteAgent` takes `url` (string or lazy function), `description`, optional `auth` / `headers` / `path` (default `/extract`) / `outputSchema`. `loadAgent` accepts a directory (`agent.ts` + `subagents/` + optional `instructions.md`), a file default export, or `module:exportName`. Auth from `openextract/agents/auth`: `bearer`, `basic`, `vercelOidc`.

### `extractSwarm(schema, agents, inputFile, options?)`

Run several agents on one input in parallel and reduce their outputs. `agents` is a model, a model list, `{ model, style?, instructions? }` members, or `defineAgent` / `defineRemoteAgent` exports. `size` repeats a single model (max 16). `reduce` is `merge` (default), `vote`, or `first`. The source is loaded once. A coordinator agent with `subagents` expands to those members.

### `extractSwarmWithResults(schema, agents, inputFile, options?)`

Same as `extractSwarm`, returning `{ output, agents, usage, reduce }`. Per-agent failures are `Error` values; the call throws only when every agent fails.

### `Extractor`

Reusable session that stores schema, model, style, retry policy, and timeout.

## Common options

- `instructions` — optional natural-language guidance
- `style` — `direct` (default), `search`, `code`, or `sandbox`
- `mediaType` — required for bytes/streams
- `maxInputBytes` — per-input cap (default 50 MiB)
- `maxRetries` / `retryBackoff` / `retryMaxBackoff`
- `timeout` — model call timeout in seconds
- `sandbox` — `{ snapshotId?, timeout? }` for Claude Code / Codex
- `maxConcurrency` — batch and swarm (default 5)
- `size` / `reduce` — swarm only (`merge` | `vote` | `first`)
- `onAgentStart` / `onAgent` — swarm only; start fires when an agent begins, `onAgent` when it finishes
- `models` — swarm agent model ids (CLI `--models`, MCP `models`)
- `agent` / `agents` — directory, file, or `module:exportName` (CLI `--agent` / `--agents`, MCP `agent` / `agents`)

`model` is an AI Gateway id (`openai/gpt-5.5`), a `LanguageModel` instance, or a coding agent (`claude-code`, `codex`). Colon-prefixed ids (`openai:gpt-5.5`) are accepted. Coding-agent models run in a Vercel Sandbox.

## MCP

`npx openextract-mcp` starts a stdio MCP server. `--http --port 3000` serves Streamable HTTP on loopback.

Tools: `extract`, `extract_many`, `extract_swarm`, `create_extractor`, `extractor_extract`, `close_extractor`.

`schema` is a JSON Schema object/string or a `module:exportName` path; omit it when `agent` has `outputSchema`. `agent` / `agents` are a directory, file, or `module:exportName`. Inputs are a `source` path/URL or base64 `data` plus `mediaType`.

```ts
import { createOpenExtractMcpServer } from "openextract/mcp";

const server = createOpenExtractMcpServer({ model: "openai/gpt-5.5" });
```

Resources: `openextract://capabilities`, `openextract://docs/api`. Prompts: `extract-document`, `extract-batch`, `extract-swarm`.

## Vercel Workflows

`openextract/workflow` exports durable workflow functions. Arguments must be serializable (JSON Schema, model id, path/URL or base64). Start them with `start()` from `workflow/api`.

### `extractWorkflow(input)`

`"use workflow"` function. Loads the schema inside a `"use step"` and returns `{ output, usage }`.

### `extractManyWorkflow(input)`

Same, one step per input. `maxConcurrency` chunks parallel steps (default 5). `returnExceptions: true` returns `{ error, errorType }` per failure instead of failing the run.

### `runSerializableExtract(input, model?)`

The step body without directives. Use this if you write your own `"use workflow"` function and keep the directives in app source.

```ts
import { start } from "workflow/api";
import { extractWorkflow } from "openextract/workflow";

const run = await start(extractWorkflow, [
  {
    schema: { type: "object", properties: { summary: { type: "string" } } },
    model: "openai/gpt-5.5",
    input: { source: "https://example.com/document.pdf" },
  },
]);
```

Next.js: `withWorkflow()` in `next.config` and `transpilePackages: ["openextract"]`. See `examples/workflow/extract-route.ts`.
