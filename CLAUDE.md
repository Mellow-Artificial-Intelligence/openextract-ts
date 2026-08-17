@AGENTS.md
@VISION.md

# Claude Code

This file is the Claude-specific companion to [AGENTS.md](AGENTS.md). Follow those repo rules; this page only adds Claude and MCP notes.

## How to work here

- Read [VISION.md](VISION.md) before changing extraction APIs, styles, or agent/MCP surfaces.
- Keep edits small. Public API lives in `src/index.ts`.
- After code changes: `npm run test:coverage` and `npm run typecheck`. After `web/` changes: `npm run web:typecheck`.
- File issues and PRs with the GitHub templates (bug, feature, agent/MCP, PR). Do not open a blank issue.

## Extracting as Claude

Prefer the shipped MCP server over ad-hoc `generateText` calls. How-to: [MCP for agents](https://mellow-artificial-intelligence.github.io/openextract-ts/mcp.html).

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
- Batch: `extract_many`. Swarm: `extract_swarm` (`size`, `models`, or importable `agents`, `reduce`: `merge` / `vote` / `first`). Session: `create_extractor` → `extractor_extract` → `close_extractor`.
- Agents: eve-shaped `defineAgent` / `defineRemoteAgent` (default export, `outputSchema`, `subagents/` directory). `extract(agent, input)` or `agent` / `agents` on MCP/CLI.
- Durable: `extractWorkflow` / `extractManyWorkflow` from `openextract/workflow` with JSON Schema.

In-process, the same rules apply: `extract(schema, model, input)` and share one `Extractor` when the schema is stable.

## Swarm-shaped work

When a single `extract` call is not enough, use the shipped primitives: `extractMany` for many inputs, `extractSwarm` for many agents on one input. Do not add a second pipeline. New orchestration should sit on `runDocumentExtraction` / `runLoadedExtraction`.
