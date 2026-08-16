# Local web UI

Cookbook UI for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. **Extract** is the one-off table: describe columns, generate a schema, then extract from pasted text or an attached file (`POST /api/schema`, `POST /api/extract`). **Agents** is a system builder — compose specialists (gateway models, Claude Code, Codex) from a named system or a blank roster, then run them on bundled fixtures (`POST /api/cookbook` with a `system` body).

Inspect durable table runs with `npx workflow web`.

On Vercel, set the Git root directory to `web/`. AI Gateway uses OIDC; no `AI_GATEWAY_API_KEY` is required. The Workflow SDK needs no extra production config. Preview and pull-request deploys are skipped (`ignoreCommand` in `vercel.json`); only `main` production builds run.
