# Examples

Cookbook recipes with sample files: [cookbook/README.md](cookbook/README.md).

```bash
cp .env.example .env   # then set AI_GATEWAY_API_KEY
npm run cookbook
npx tsx examples/basic/local-file.ts ./notes.txt
npx tsx examples/basic/url-extract.ts https://example.com
npx tsx examples/advanced/retry.ts ./notes.txt
npx tsx examples/advanced/swarm.ts ./notes.txt
npx tsx examples/advanced/agents.ts ./notes.txt
npx openextract --tui ./notes.txt
npm run web
```

`examples/workflow/extract-route.ts` is a Next.js route that starts `extractWorkflow`. It needs `workflow` and `withWorkflow()` in that app — it is not run with `tsx`.

Set `AI_GATEWAY_API_KEY`. Optional: `OPENEXTRACT_MODEL`. A sample image lives in `examples/fixtures/document_page.png`.
