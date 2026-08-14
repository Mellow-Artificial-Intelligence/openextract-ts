# Local web UI

Single-turn extraction UI for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. Describe the table you want, generate columns, edit them, then extract from pasted text or an attached file. `/api/schema` streams the table shape; `/api/extract` streams rows into a sortable shadcn table.

On Vercel, set the Git root directory to `web/`. AI Gateway uses OIDC; no `AI_GATEWAY_API_KEY` is required.
