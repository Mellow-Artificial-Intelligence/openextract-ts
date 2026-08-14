# API reference

## Extraction

### `extract(schema, model, inputFile, options?)`

Extract one input and return a value matching `schema`.

### `extractWithUsage(schema, model, inputFile, options?)`

Same as `extract`, returning `{ output, usage }`.

### `extractMany(schema, model, inputFiles, options?)`

Concurrent batch extraction. Results preserve input order. Set `returnExceptions: true` to keep going after per-item failures.

### `extractManyWithResults(schema, model, inputFiles, options?)`

Batch API returning `ExtractionResult` objects (output, usage, attempts, duration, model/media metadata, sanitized source).

### `iterExtractMany(schema, model, inputFiles, options?)`

Async generator of `[index, result]` pairs in completion order.

### `Extractor`

Reusable session that stores schema, model, style, retry policy, and timeout.

## Common options

- `instructions` — optional natural-language guidance
- `style` — `direct` (default), `search`, or `code`
- `mediaType` — required for bytes/streams
- `maxInputBytes` — per-input cap (default 50 MiB)
- `maxRetries` / `retryBackoff` / `retryMaxBackoff`
- `timeout` — model call timeout in seconds
- `maxConcurrency` — batch only (default 5)

`model` is an AI Gateway id (`openai/gpt-5.5`) or a `LanguageModel` instance. Colon-prefixed ids (`openai:gpt-5.5`) are accepted.

## MCP

`npx openextract-mcp` starts a stdio MCP server. `--http --port 3000` serves Streamable HTTP on loopback.

Tools: `extract`, `extract_many`, `create_extractor`, `extractor_extract`, `close_extractor`.

`schema` is a JSON Schema object/string or a `module:exportName` path. Inputs are a `source` path/URL or base64 `data` plus `mediaType`.

```ts
import { createOpenExtractMcpServer } from "openextract/mcp";

const server = createOpenExtractMcpServer({ model: "openai/gpt-5.5" });
```

Resources: `openextract://capabilities`, `openextract://docs/api`. Prompts: `extract-document`, `extract-batch`.
