@AGENTS.md
@VISION.md

# Claude Code

This file is the Claude-specific companion to [AGENTS.md](AGENTS.md). Follow those repo rules; this page only adds Claude and MCP notes.

## How to work here

- Read [VISION.md](VISION.md) before changing extraction APIs, styles, or agent/MCP surfaces.
- Keep edits small. Public API lives in `src/index.ts`.
- After code changes: `npm test` and `npm run typecheck`. After `web/` changes: `npm run web:typecheck`.

## Extracting as Claude

Prefer the shipped MCP server over ad-hoc `generateText` calls:

```bash
npx openextract-mcp
```

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

- Schema: JSON Schema object/string, or a local `module:exportName`.
- Input: `source` (path/URL) or base64 `data` plus `mediaType`.
- Style: `direct` for binary media; `search` or `code` only for UTF-8 text.
- Batch: `extract_many`. Session: `create_extractor` → `extractor_extract` → `close_extractor`.

In-process, the same rules apply: `extract(schema, model, input)` and share one `Extractor` when the schema is stable.

## Swarm-shaped work

When a single `extract` call is not enough (large corpora, mixed media, or several schemas), split work across parallel MCP/`extractMany` calls and merge validated objects. Do not add a second pipeline. New swarm orchestration should sit on top of `runDocumentExtraction`.
