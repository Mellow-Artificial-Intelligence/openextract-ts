---
layout: docs
title: Guide
description: How to extract structured data with openextract — for people and for agents.
permalink: /guide.html
---

# Guide

openextract turns a document, image, audio, or video into a **validated object** in one call. Point at a path or URL, pass a schema, get typed data. Model calls go through the [Vercel AI SDK](https://ai-sdk.dev) and [AI Gateway](https://vercel.com/ai-gateway).

Do not invent a second extraction pipeline. Use `extract`, `extractMany`, `extractSwarm`, or the MCP tools below.

## For agents

Read this section first. Then call the library or MCP — do not wrap `generateText` yourself.

| Job | Call |
| --- | --- |
| One input, one schema | `extract` / MCP `extract` |
| Many inputs, same schema | `extractMany` / `extract_many` |
| Several agents on one input | `extractSwarm` / `extract_swarm` |
| Reuse schema + model + style | `Extractor` / `create_extractor` → `extractor_extract` |
| Durable (survives deploys) | `extractWorkflow` / `extractManyWorkflow` |

| Input | `style` |
| --- | --- |
| PDF, Office, image, audio, video | `direct` (required) |
| UTF-8 text you need to grep | `search` |
| UTF-8 text you need to compute | `code` |

`search` and `code` reject binary / non-UTF-8 input. Do not fall back to `direct`.

**Schema:** Zod in process. Over MCP and workflows: JSON Schema object/string, or `module:exportName`. If `agent` has `outputSchema`, omit `schema`.

**Input:** path or `http(s)` URL; bytes/streams need `mediaType`. MCP: `source` **or** base64 `data` + `mediaType`. Cap is 50 MiB.

**Auth:** `AI_GATEWAY_API_KEY`, or Vercel OIDC in production. Default model: `OPENEXTRACT_MODEL`.

Full MCP contract: [MCP for agents](mcp.html). Function catalog: [API reference](api-reference.html). Machine index: [llms.txt](llms.txt).

## Install

```bash
npm install openextract zod
```

Node.js 20+. Set `AI_GATEWAY_API_KEY` (or deploy on Vercel with OIDC).

```ts
import { z } from "zod";
import { extract } from "openextract";

const PdfInfo = z.object({
  summary: z.string(),
  language: z.string(),
});

const result = await extract(PdfInfo, "xai/grok-4.6", "https://example.com/document.pdf", {
  instructions: "Return a two-sentence summary and the document's primary language.",
});
```

`result` is `{ summary, language }` — not a raw string. Colon ids such as `openai:gpt-5.5` are accepted and routed to AI Gateway (`openai/gpt-5.5`).

## Inputs

Local paths, `http(s)` URLs, `Uint8Array` / `Buffer`, and readable streams. Bytes and streams require `mediaType`.

```ts
await extract(PdfInfo, "xai/grok-4.6", "./reports/q4.pdf");
await extract(PdfInfo, "xai/grok-4.6", pdfBytes, { mediaType: "application/pdf" });
```

Every input is capped at 50 MiB (`maxInputBytes` / `OPENEXTRACT_MAX_INPUT_BYTES`). Oversized inputs raise `InputTooLargeError` before a model request.

URL fetch is privileged: only `http`/`https`, host re-checked on every redirect, private hosts blocked unless `OPENEXTRACT_ALLOW_PRIVATE_URLS` is set. Details: [SECURITY.md](https://github.com/Mellow-Artificial-Intelligence/openextract-ts/blob/main/SECURITY.md).

## Styles

`style` selects how the model inspects the source. Default is `direct`.

```ts
import { extract, ExtractionStyle } from "openextract";

await extract(PdfInfo, "openai/gpt-5.5", "notes.txt");
await extract(PdfInfo, "openai/gpt-5.5", "notes.txt", { style: "search" });
await extract(PdfInfo, "openai/gpt-5.5", "notes.txt", { style: ExtractionStyle.CODE });
```

A fourth style is an extension of `ExtractionStyle`, not a parallel stack.

## Sessions

Reuse schema, model, style, and retry policy across files.

```ts
import { Extractor, RetryPolicy } from "openextract";

const extractor = new Extractor(PdfInfo, "openai/gpt-5.5", {
  instructions: "Extract the summary and primary language.",
  timeout: 30,
  retryPolicy: new RetryPolicy({ maxRetries: 3 }),
});

const first = await extractor.extract("./reports/q3.pdf");
const { output, usage } = await extractor.extractWithUsage("./reports/q4.pdf");
extractor.close();
```

## Batch

Many inputs, one schema. Default concurrency is 5. Results keep input order.

```ts
import { extractMany, extractManyWithResults, totalUsage } from "openextract";

const results = await extractMany(PdfInfo, "xai/grok-4.6", [
  "./reports/q3.pdf",
  { source: pdfBytes, mediaType: "application/pdf" },
]);

const rich = await extractManyWithResults(PdfInfo, "xai/grok-4.6", [
  "./reports/q3.pdf",
  "./reports/q4.pdf",
]);
```

`returnExceptions: true` keeps going after per-item failures. `iterExtractMany` yields `[index, result]` in completion order.

## Swarms

Several agents on **one** input, then reduce. The source is loaded once. Failed agents are skipped as long as one succeeds (max 16 agents).

| `reduce` | Behavior |
| --- | --- |
| `merge` (default) | Fill empty fields; union unique array items |
| `vote` | Majority value per field |
| `first` | First successful agent |

```ts
import { extractSwarm, extractSwarmWithResults } from "openextract";

const merged = await extractSwarm(PdfInfo, "openai/gpt-5.5", "./reports/q4.pdf", {
  size: 4,
});

const { output, usage, agents } = await extractSwarmWithResults(PdfInfo, [
  { model: "openai/gpt-5.6-luna" },
  { model: "xai/grok-4.6", style: "search" },
  { model: "google/gemini-3.7-flash" },
], "./reports/q4.pdf", { reduce: "merge" });
```

`onAgentStart` / `onAgent` fire when each parallel agent begins and finishes.

## Importable agents

Eve pattern: default-export `defineAgent` / `defineRemoteAgent`, no `name` field, `outputSchema` on the definition, specialists under `subagents/`.

```text
agents/
├── agent.ts
├── instructions.md
└── subagents/
    ├── search/agent.ts
    └── remote.ts
```

```ts
import { defineAgent, extract, loadAgent } from "openextract";

export default defineAgent({
  description: "Extracts invoice totals and line items.",
  model: "openai/gpt-5.5",
  style: "direct",
  outputSchema: Invoice,
});

const agent = await loadAgent("./agents");
const result = await extract(agent, "./bill.pdf");
```

```ts
import { defineRemoteAgent } from "openextract";
import { bearer } from "openextract/agents/auth";

export default defineRemoteAgent({
  url: () => process.env.OCR_AGENT_URL ?? "https://extract.example.com",
  description: "Remote OCR specialist.",
  auth: bearer(() => process.env.OCR_AGENT_TOKEN ?? ""),
  outputSchema: Invoice,
});
```

`loadAgent` accepts a directory, a file default export, or `module:exportName`. Discovered subagents flatten into a swarm. A remote agent POSTs loaded bytes to `{url}{path}` (default `/extract`). Auth helpers: `bearer`, `basic`, `vercelOidc`. Failures raise `RemoteAgentError`. Remote URLs are trusted configuration (`http`/`https` only), not document SSRF targets.

## CLI, TUI, cookbook

```bash
npx openextract ./reports/q4.pdf \
  --schema ./schemas.ts:Invoice \
  --model xai/grok-4.6 \
  --style direct \
  --instructions "Pull totals and line items."
```

`--agent` can be a directory, file, or `module:exportName`. Swarm: `--swarm N`, `--models id,id`, `--agents path,path`, `--reduce merge|vote|first`.

```bash
npx openextract
npx openextract --tui ./reports/q4.pdf
npm run cookbook   # AP inbox, file audit, vote, invoice math
npm run web        # Next.js cookbook UI
```

The OpenTUI renderer needs [Bun](https://bun.sh) or Node.js 26.4+ with `--experimental-ffi`. Keys: `Tab` cycles fields, `Ctrl+E` extracts, `Ctrl+C` quits.

Exit codes: `0` success, `2` URL fetch, `3` schema validation, `4` model, `5` other extraction, `6` missing credentials, `7` partial batch (`--continue-on-error`).

## MCP

```bash
npx openextract-mcp
```

stdio by default. `--http --port 3000` serves Streamable HTTP on `127.0.0.1`. Tools: `extract`, `extract_many`, `extract_swarm`, `create_extractor`, `extractor_extract`, `close_extractor`. Resources: `openextract://capabilities`, `openextract://docs/api`.

See [MCP for agents](mcp.html) for tool arguments, Cursor config, and prompts.

## Workflows

Durable extraction for Vercel Workflows. Zod is not serializable across step boundaries — pass JSON Schema.

```ts
import { start } from "workflow/api";
import { extractWorkflow } from "openextract/workflow";

const run = await start(extractWorkflow, [
  {
    schema: {
      type: "object",
      properties: { summary: { type: "string" }, language: { type: "string" } },
      required: ["summary", "language"],
    },
    model: "openai/gpt-5.5",
    input: { source: "https://example.com/document.pdf" },
    style: "direct",
  },
]);

const { output, usage } = await run.returnValue;
```

Next.js: `withWorkflow()` from `workflow/next` and `transpilePackages: ["openextract"]`.

## Errors

Only transient `ModelError` (timeouts, rate limits, 5xx) is retried. Backoff is exponential with jitter; `Retry-After` wins when present.

```ts
import {
  UrlFetchError,
  InputTooLargeError,
  SchemaValidationError,
  ProviderNotInstalledError,
  ModelError,
  RemoteAgentError,
  ExtractionError,
} from "openextract";
```

| Error | When |
| --- | --- |
| `UrlFetchError` | Fetch / SSRF / redirects |
| `InputTooLargeError` | Size cap |
| `SchemaValidationError` | Model output failed the schema |
| `ProviderNotInstalledError` | Missing `AI_GATEWAY_API_KEY` |
| `ModelError` | Provider/model failure (`retryable`, `retryAfter`) |
| `RemoteAgentError` | `defineRemoteAgent` HTTP failure |
| `ExtractionError` | Fallback base class |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | — | AI Gateway authentication |
| `OPENEXTRACT_MODEL` | — | Default model id (CLI, TUI, MCP, cookbook) |
| `OPENEXTRACT_URL_TIMEOUT` | `30` | URL fetch timeout (seconds) |
| `OPENEXTRACT_MAX_REDIRECTS` | `10` | Maximum redirect hops |
| `OPENEXTRACT_ALLOW_PRIVATE_URLS` | unset | `1` / `true` / `yes` allows private hosts |
| `OPENEXTRACT_MAX_INPUT_BYTES` | `52428800` | Per-input byte cap |
