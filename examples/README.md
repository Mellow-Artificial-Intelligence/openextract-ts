# Examples

```bash
npx tsx examples/basic/local-file.ts ./notes.txt
npx tsx examples/basic/url-extract.ts https://example.com
npx tsx examples/advanced/retry.ts ./notes.txt
npx tsx examples/advanced/swarm.ts ./notes.txt
npx openextract --tui ./notes.txt
npm run web
```

`examples/workflow/extract-route.ts` is a Next.js route that starts `extractWorkflow`. It needs `workflow` and `withWorkflow()` in that app — it is not run with `tsx`.

Set `AI_GATEWAY_API_KEY` (or `OPENEXTRACT_MODEL` is not required; pass the model in code). A sample image lives in `examples/fixtures/document_page.png`.
