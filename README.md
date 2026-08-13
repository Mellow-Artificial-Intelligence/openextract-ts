# openextract

**Extract structured data from documents, images, audio, and video using LLMs.**

`openextract` turns any document, image, audio, or video file into a typed Zod object in a single call. Point it at a local path or a URL, pass a schema, and get back validated data. Model calls go through the [Vercel AI SDK](https://ai-sdk.dev) and [AI Gateway](https://vercel.com/ai-gateway).

## Installation

```bash
npm install openextract zod
```

Requires Node.js 20+. Set `AI_GATEWAY_API_KEY` (or deploy on Vercel with OIDC).

## Quick start

```ts
import { z } from "zod";
import { extract } from "openextract";

const PdfInfo = z.object({
  summary: z.string(),
  language: z.string(),
});

const result = await extract(PdfInfo, "xai/grok-4.6", "https://example.com/document.pdf", {
  instructions: "Return a two-sentence summary and the document's primary language.",
});

console.log(result.summary, result.language);
```

`result` is a validated `{ summary, language }` object — not a raw string.

Pydantic-AI style ids such as `openai:gpt-5.5` are accepted and routed to AI Gateway (`openai/gpt-5.5`).

## Extraction styles

`style` selects how the model inspects the input. The default, `direct`, sends the resolved media in one shot. For **text** documents you can search with file tools or run JavaScript against the text.

```ts
import { extract, ExtractionStyle } from "openextract";

await extract(PdfInfo, "openai/gpt-5.5", "notes.txt");

await extract(PdfInfo, "openai/gpt-5.5", "notes.txt", { style: "search" });
await extract(PdfInfo, "openai/gpt-5.5", "notes.txt", { style: ExtractionStyle.CODE });
```

`search` and `code` require UTF-8 text (`text/*`, JSON, XML, YAML, and similar). PDFs, Office documents, images, audio, and video stay on `direct`.

## Reusable sessions

```ts
import { Extractor, RetryPolicy } from "openextract";

const extractor = new Extractor(PdfInfo, "openai/gpt-5.5", {
  instructions: "Extract the summary and primary language.",
  timeout: 30,
  retryPolicy: new RetryPolicy({ maxRetries: 3 }),
});

const first = await extractor.extract("./reports/q3.pdf");
const { output, usage } = await extractor.extractWithUsage("./reports/q4.pdf");
extractor.close();
```

## Inputs

Local paths, `http(s)` URLs, `Uint8Array` / `Buffer`, and readable streams are accepted. Bytes and streams require `mediaType`.

```ts
await extract(PdfInfo, "xai/grok-4.6", "./reports/q4.pdf");
await extract(PdfInfo, "xai/grok-4.6", pdfBytes, { mediaType: "application/pdf" });
```

Every input is capped at 50 MiB. Override with `maxInputBytes` or `OPENEXTRACT_MAX_INPUT_BYTES`. Oversized inputs raise `InputTooLargeError` before a model request.

## Retry and usage

```ts
const { output, usage } = await extractWithUsage(PdfInfo, "xai/grok-4.6", "./reports/q4.pdf", {
  maxRetries: 3,
});

console.log(usage.inputTokens, usage.outputTokens, usage.totalTokens);
```

Only transient `ModelError` failures (timeouts, rate limits, 5xx) are retried. Backoff is exponential with up to 25% jitter, bounded by `retryMaxBackoff` (60s). A provider `Retry-After` value takes precedence.

## Batch extraction

```ts
import { extractMany, extractManyWithResults, totalUsage } from "openextract";

const results = await extractMany(PdfInfo, "xai/grok-4.6", [
  "./reports/q3.pdf",
  { source: pdfBytes, mediaType: "application/pdf" },
]);

const rich = await extractManyWithResults(PdfInfo, "xai/grok-4.6", [
  "./reports/q3.pdf",
  "./reports/q4.pdf",
]);
console.log(totalUsage(rich.filter((item) => !(item instanceof Error))));
```

## Command line

```bash
npx openextract ./reports/q4.pdf \
  --schema ./schemas.ts:Invoice \
  --model xai/grok-4.6 \
  --instructions "Pull totals and line items."
```

`--schema` is a `module:exportName` path to a Zod schema. Exit codes: `0` success, `2` URL fetch, `3` schema validation, `4` model, `5` other extraction, `6` missing credentials, `7` partial batch (`--continue-on-error`).

## Error handling

```ts
import {
  extract,
  InputTooLargeError,
  UrlFetchError,
  SchemaValidationError,
  ModelError,
  ProviderNotInstalledError,
  ExtractionError,
} from "openextract";

try {
  await extract(PdfInfo, "xai/grok-4.6", url);
} catch (error) {
  if (error instanceof UrlFetchError) { /* fetch / SSRF */ }
  else if (error instanceof InputTooLargeError) { /* size cap */ }
  else if (error instanceof SchemaValidationError) { /* schema mismatch */ }
  else if (error instanceof ProviderNotInstalledError) { /* AI_GATEWAY_API_KEY */ }
  else if (error instanceof ModelError) {
    console.log(error.provider, error.statusCode, error.retryable, error.retryAfter);
  } else if (error instanceof ExtractionError) { /* fallback */ }
}
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | — | AI Gateway authentication |
| `OPENEXTRACT_URL_TIMEOUT` | `30` | URL fetch timeout (seconds) |
| `OPENEXTRACT_MAX_REDIRECTS` | `10` | Maximum redirect hops |
| `OPENEXTRACT_ALLOW_PRIVATE_URLS` | unset | Set `1` / `true` / `yes` to allow private hosts |
| `OPENEXTRACT_MAX_INPUT_BYTES` | `52428800` | Per-input byte cap |

## Development

```bash
npm install
npm test
npm run typecheck
```

## License

[MIT](LICENSE) © Cole McIntosh
