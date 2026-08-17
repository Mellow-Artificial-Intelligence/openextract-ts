# Cookbook

Interactive OpenTUI recipes with sample files. Each recipe is a small composition of `extract` or `extractSwarm` — not a second pipeline. The local web UI (`npm run web`) is the same cookbook: table extract is the default recipe; AP inbox, file audit, disputed payable, and invoice math sit next to it in the rail.

```bash
cp .env.example .env   # then set AI_GATEWAY_API_KEY
npm run cookbook
```

The Output pane is the main surface and stays empty until you extract. Recipe, documents, and model sit in a left rail. Each document card lists every agent: role, queued/running/done, a one-line extract, and elapsed time. Cards update in place as agents start and finish.

Keys: `R` extracts, `Space` toggles a document, `[` / `]` sets agent count (when the recipe allows it), `Tab` moves focus, `Ctrl+C` quits. The model list comes from AI Gateway (`gateway.getAvailableModels()`), defaulting to `xai/grok-4.6` when that id is in the catalog.

The OpenTUI renderer needs [Bun](https://bun.sh) or Node.js 26.4+ with `--experimental-ffi`. If `bun` is on your `PATH`, the cookbook re-execs through it.

Create a key with `vercel ai-gateway api-keys create --name openextract-local --scope mellow-ai`. The TUI loads `.env` from the repo root, discovers models from the gateway, and prefers `xai/grok-4.6`. Optional: `OPENEXTRACT_MODEL`, `OPENEXTRACT_SWARM_SIZE` (used when the recipe does not lock agent count).

JSON dump without the TUI:

```bash
npx tsx examples/cookbook/01-document-swarm/extract.ts
```

Unit tests cover the recipe with `MockLanguageModelV3` (`npm test`). Live runs hit AI Gateway.

| Recipe | What it shows |
| --- | --- |
| [AP inbox](01-document-swarm/extract.ts) | A folder of vendor invoices. One extract per bill — a payable record each. |
| [File audit](04-audit/docs) | Completeness, policy, and math agents review each file (clean invoice, messy expense, draft MSA), then merge a verdict. |
| [Disputed payable](03-vote/docs/contoso-invoice.txt) | Agents `vote` when the printed total and a rush scribble disagree. |
| [Invoice math](recipes.ts) | One `search` agent and one `code` agent on the same invoice, then `merge`. |

AP inbox is the everyday job: many documents, one output each. File audit is the swarm: several perspectives on the same packet, then a final result.
