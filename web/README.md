# Local web UI

Single-turn extraction UI for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. Describe the table you want, generate columns, edit them, then extract from pasted text or an attached file. The UI is a three-step flow so query, schema, and source each get their own screen. `/api/schema` streams the table shape; `/api/extract` starts a Vercel Workflow (`WorkflowAgent`) and returns rows into a sortable shadcn table. Extraction settings can run a swarm of agents in parallel, attach a model to each agent, and merge unique rows.

Inspect durable runs with `npx workflow web`.

On Vercel, set the Git root directory to `web/`. AI Gateway uses OIDC; no `AI_GATEWAY_API_KEY` is required. The Workflow SDK needs no extra production config. Preview and pull-request deploys are skipped (`ignoreCommand` in `vercel.json`); only `main` production builds run.
