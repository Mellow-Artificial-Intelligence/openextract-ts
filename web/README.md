# Local web UI

Single-turn extraction UI for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. Paste text or attach a file, pick a schema preset, and extract. The model streams JSON through `/api/extract`. Re-extracting replaces the previous result.

On Vercel, set the Git root directory to `web/`. AI Gateway uses OIDC; no `AI_GATEWAY_API_KEY` is required.
