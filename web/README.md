# Local web UI

Streaming extraction chat for openextract. Next.js App Router, AI SDK, and [AI Elements](https://elements.ai-sdk.dev).

```bash
cp web/.env.example web/.env.local
# set AI_GATEWAY_API_KEY
npm run web
```

Open http://localhost:3000. Paste text or attach a file, pick a schema preset, and the model streams JSON through `/api/chat`.
