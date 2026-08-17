---
layout: docs
title: MCP for agents
description: How a coding agent should call openextract over MCP.
permalink: /mcp.html
---

# MCP for agents

Use the shipped MCP server. Do not wrap `generateText` or invent a parallel extract path.

```bash
npx openextract-mcp                 # stdio (Cursor, Claude Desktop)
npx openextract-mcp --http --port 3000   # Streamable HTTP on 127.0.0.1
```

In-process: `import { createOpenExtractMcpServer } from "openextract/mcp"`.

## Cursor config

```json
{
  "mcpServers": {
    "openextract": {
      "command": "npx",
      "args": ["openextract-mcp"],
      "env": {
        "AI_GATEWAY_API_KEY": "…",
        "OPENEXTRACT_MODEL": "openai/gpt-5.5"
      }
    }
  }
}
```

`model` on each tool overrides `OPENEXTRACT_MODEL`.

## Which tool

| Job | Tool |
| --- | --- |
| One document / image / audio / video | `extract` |
| Many inputs, same schema | `extract_many` |
| Several agents on one input | `extract_swarm` |
| Same schema + model across files | `create_extractor` → `extractor_extract` → `close_extractor` |

## Schema and input

- **Schema:** JSON Schema object, JSON Schema string, or `module:exportName` for a local Zod export. Omit `schema` when `agent` has `outputSchema`.
- **Input:** `source` (path or `http(s)` URL) **or** base64 `data` plus `mediaType`. `name` is an optional label.
- **Agent:** `agent` / `agents` as a directory (`agent.ts` + `subagents/`), file, or `module:exportName`.
- **Style:** `direct` (default; required for PDF / Office / image / audio / video), `search` or `code` (UTF-8 text only). Never fall back.

## `extract`

```json
{
  "schema": { "type": "object", "properties": { "summary": { "type": "string" } }, "required": ["summary"] },
  "model": "openai/gpt-5.5",
  "source": "./reports/q4.pdf",
  "style": "direct",
  "instructions": "Two-sentence summary.",
  "includeUsage": false
}
```

Optional: `agent`, `mediaType`, `maxInputBytes`, `maxRetries`, `retryBackoff`, `retryMaxBackoff`, `timeout`, `data` (base64).

## `extract_many`

`inputs` is an array of `{ source? , data? , mediaType? , name? }`. Optional `maxConcurrency` (default 5), `returnExceptions`, `includeResults`.

## `extract_swarm`

One input, parallel agents, then reduce.

| Argument | Meaning |
| --- | --- |
| `size` | Repeat `model` this many times (max 16) |
| `models` | One model id per agent (overrides `model`+`size`) |
| `agents` | Importable `defineAgent` paths (overrides `models`) |
| `reduce` | `merge` (default), `vote`, or `first` |
| `includeResults` | Return `{ output, usage, reduce, agents }` |

Failed agents are skipped as long as one succeeds.

## Sessions

1. `create_extractor` — stores schema, model, style, retries; returns `{ sessionId }`.
2. `extractor_extract` — `{ sessionId, source | data+mediaType }`.
3. `close_extractor` — `{ sessionId }`.

## Resources

Read these before calling tools if you are unsure.

| URI | What it is |
| --- | --- |
| `openextract://capabilities` | JSON: tools, styles, inputs, options, env, errors |
| `openextract://docs/api` | Short markdown contract |

## Prompts

`extract-document`, `extract-batch`, `extract-swarm` — fill `source` / `sources` and `schema`.

## Errors

Tool failures return JSON `{ error, errorType, ... }` with `isError: true`.

| `errorType` | Meaning |
| --- | --- |
| `UrlFetchError` | Fetch / SSRF |
| `InputTooLargeError` | 50 MiB cap |
| `SchemaValidationError` | Output missed the schema |
| `ProviderNotInstalledError` | Missing `AI_GATEWAY_API_KEY` |
| `ModelError` | Provider failure (`retryable`, `retryAfter`) |
| `RemoteAgentError` | Remote `defineRemoteAgent` |

## Do not

- Do not add a fourth style.
- Do not use `search` / `code` on PDFs, images, audio, or video.
- Do not disable SSRF (`OPENEXTRACT_ALLOW_PRIVATE_URLS`) for convenience.
- Do not pass Zod objects over MCP or workflows — they are not serializable.

Library how-to: [Guide](guide.html). Function catalog: [API reference](api-reference.html).
