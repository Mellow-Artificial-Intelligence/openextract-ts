# API reference

## Terminal UI

`openextract` and `openextract --tui [input]` launch an OpenTUI app. The TUI calls `extractWithUsage` with a schema from a preset, field list, JSON example, JSON Schema, or `module:export`. It requires Bun or Node.js 26.4+ with `--experimental-ffi`.

`npm run cookbook` is a separate OpenTUI app for the AP inbox, file audit, disputed payable, and invoice math recipes in `examples/cookbook`.

## Local web UI

`npm run web` starts the Next.js cookbook in `web/`. **Table extract** (the default recipe) describes columns, streams a schema, then runs table extraction as a Vercel Workflow (`WorkflowAgent` in `web/src/workflows/extract.ts`); `POST /api/extract` starts the run and returns the structured rows. Other recipes (`POST /api/cookbook`) cover AP inbox, file audit, disputed payable, and invoice math on bundled fixtures. Set `AI_GATEWAY_API_KEY` in `web/.env.local`. On Vercel, set the Git root directory to `web/` (see `web/vercel.json`); AI Gateway authenticates with OIDC. Pull-request preview deploys are skipped. Inspect table runs with `npx workflow web`. The table recipe can run several agents in parallel, attach a model to each agent, and merge unique rows. CLI `--models` assigns one model per agent.

## Command line

```bash
npx openextract [<input...>] --schema <module:export> --model <provider/model>
```

| Flag | Purpose |
| --- | --- |
| `--tui` | OpenTUI app |
| `--schema` | Zod `module:exportName` (optional when `--agent` has `outputSchema`) |
| `--model` | AI Gateway id |
| `--instructions` | Natural-language guidance |
| `--style` | `direct` (default), `search`, or `code` |
| `--media-type` | Required for stdin (`-`) |
| `--usage` | Print token usage (single input) |
| `--continue-on-error` | Batch: keep going, exit `7` on partial failure |
| `--output` | `json` (default) or `repr` |
| `--max-retries` / `--retry-backoff` / `--retry-max-backoff` | Transient `ModelError` retries |
| `--max-input-bytes` | Per-input cap |
| `--swarm` / `--models` / `--reduce` | Parallel agents on one input (`merge` \| `vote` \| `first`) |
| `--agent` / `--agents` | Directory, file, or `module:exportName` |

Exit codes: `0` success, `2` URL fetch, `3` schema validation, `4` model, `5` other extraction, `6` missing credentials, `7` partial batch.

## Extraction

### `extract(schema, model, inputFile, options?)` / `extract(agent, inputFile, options?)`

Extract one input and return a value matching `schema`. `model` may be an AI Gateway id, a `LanguageModel`, or a `defineAgent` / `defineRemoteAgent` export. `extract(agent, input)` uses the agent's `outputSchema`.

### `extractWithUsage(schema, model, inputFile, options?)` / `extractWithUsage(agent, inputFile, options?)`

Same as `extract`, returning `{ output, usage }`.

### `extractMany(schema, model, inputFiles, options?)`

Concurrent batch extraction. Results preserve input order. Set `returnExceptions: true` to keep going after per-item failures.

### `extractManyWithResults(schema, model, inputFiles, options?)`

Batch API returning `ExtractionResult` objects (output, usage, attempts, duration, model/media metadata, sanitized source).

### `iterExtractMany(schema, model, inputFiles, options?)`

Async generator of `[index, result]` pairs in completion order.

### `defineAgent(config)` / `defineRemoteAgent(config)`

Eve-shaped extract workers. Default-export them; there is no `name` field. `defineAgent` takes `description` (required), `model`, `outputSchema`, plus openextract knobs `style` / `instructions`. `defineRemoteAgent` takes `url` (string or lazy function), `description`, optional `auth` / `headers` / `path` (default `/extract`) / `outputSchema`. `loadAgent` / `loadAgents` accept a directory (`agent.ts` + `subagents/` + optional `instructions.md`), a file default export, or `module:exportName`. Auth from `openextract/agents/auth`: `bearer`, `basic`, `vercelOidc`. Remote failures raise `RemoteAgentError`.

### `extractSwarm(schema, agents, inputFile, options?)`

Run several agents on one input in parallel and reduce their outputs. `agents` is a model, a model list, `{ model, style?, instructions? }` members, or `defineAgent` / `defineRemoteAgent` exports. `size` repeats a single model (max 16). `reduce` is `merge` (default), `vote`, or `first`. The source is loaded once. A coordinator agent with `subagents` expands to those members.

### `extractSwarmWithResults(schema, agents, inputFile, options?)`

Same as `extractSwarm`, returning `{ output, agents, usage, reduce }`. Per-agent failures are `Error` values; the call throws only when every agent fails.

### `Extractor`

Reusable session that stores schema, model, style, retry policy, and timeout.

## Common options

- `instructions` — optional natural-language guidance
- `style` — `direct` (default), `search`, or `code`
- `mediaType` — required for bytes/streams
- `maxInputBytes` — per-input cap (default 50 MiB)
- `maxRetries` / `retryBackoff` / `retryMaxBackoff`
- `timeout` — model call timeout in seconds
- `maxConcurrency` — batch and swarm (default 5)
- `size` / `reduce` — swarm only (`merge` | `vote` | `first`)
- `onAgentStart` / `onAgent` — swarm only; start fires when an agent begins, `onAgent` when it finishes
- `models` — swarm agent model ids (CLI `--models`, MCP `models`)
- `agent` / `agents` — directory, file, or `module:exportName` (CLI `--agent` / `--agents`, MCP `agent` / `agents`)

`model` is an AI Gateway id (`openai/gpt-5.5`) or a `LanguageModel` instance. Colon-prefixed ids (`openai:gpt-5.5`) are accepted.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | — | AI Gateway authentication |
| `OPENEXTRACT_MODEL` | — | Default model id (CLI, TUI, MCP, cookbook) |
| `OPENEXTRACT_URL_TIMEOUT` | `30` | URL fetch timeout (seconds) |
| `OPENEXTRACT_MAX_REDIRECTS` | `10` | Maximum redirect hops |
| `OPENEXTRACT_ALLOW_PRIVATE_URLS` | unset | Set `1` / `true` / `yes` to allow private hosts |
| `OPENEXTRACT_MAX_INPUT_BYTES` | `52428800` | Per-input byte cap |

URL fetch is a privileged operation. See [SECURITY.md](../SECURITY.md).

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
