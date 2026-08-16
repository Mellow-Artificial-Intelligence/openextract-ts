# Local web UI

Cookbook UI for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. The left rail picks a recipe. **Table extract** is the default: describe the table, generate columns, edit them, then extract from pasted text or an attached file. `/api/schema` streams the table shape; `/api/extract` starts a Vercel Workflow (`WorkflowAgent`) and returns rows into a sortable shadcn table. Extraction settings can run a swarm of agents in parallel, attach a model to each agent, and merge unique rows.

The other recipes are AP inbox, file audit, disputed payable, and invoice math on bundled fixtures (`POST /api/cookbook`).

Inspect durable table runs with `npx workflow web`.

On Vercel, set the Git root directory to `web/`. AI Gateway uses OIDC; no `AI_GATEWAY_API_KEY` is required. The Workflow SDK needs no extra production config. Preview and pull-request deploys are skipped (`ignoreCommand` in `vercel.json`); only `main` production builds run.
