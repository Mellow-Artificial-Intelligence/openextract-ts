# AGENTS.md

Instructions for coding agents working in this repository. Product direction lives in [VISION.md](VISION.md). Human setup is in [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Project

`openextract` turns a document, image, audio, or video into a validated Zod object in one call. Model traffic goes through the Vercel AI SDK and AI Gateway.

Agents are a first-class caller. Prefer the public TypeScript API or the MCP server over inventing a parallel extraction path.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
```

Web UI (`web/`):

```bash
npm install --prefix web
npm run web
npm run web:typecheck
npm run web:build
```

Node.js 20+. Set `AI_GATEWAY_API_KEY` for live model calls. Tests use `MockLanguageModelV3` and do not need a key.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | Public library exports. Change this when the API changes. |
| `src/extract.ts` | One-shot `extract` / `extractWithUsage` |
| `src/batch.ts` | Concurrent `extractMany*` |
| `src/session.ts` | Reusable `Extractor` |
| `src/pipeline.ts` | Shared media → style → retry → model path |
| `src/styles.ts` | `direct` / `search` / `code` |
| `src/model.ts` | AI Gateway routing, `generateText`, `ToolLoopAgent` |
| `src/media.ts` | Paths, URLs, bytes, streams, SSRF guards |
| `src/schema.ts` | Zod / JSON Schema / `module:exportName` |
| `src/schema-spec.ts` | Field-list and JSON schema specs for TUI/CLI |
| `src/mcp.ts` | MCP tools, resources, prompts |
| `src/cli.ts` | `openextract` CLI |
| `src/tui/` | OpenTUI app |
| `web/` | Next.js extract UI (Vercel root = `web/`) |
| `tests/` | Vitest. Mocks live in `tests/helpers.ts` |
| `examples/` | Runnable samples |

## Conventions

- TypeScript ESM. Imports use `.js` extensions. `verbatimModuleSyntax` and `noUncheckedIndexedAccess` are on.
- Zod 4 schemas. Public extract functions take `z.ZodType<T>` and return `T`.
- One pipeline. New extract entry points must call `runDocumentExtraction` in `src/pipeline.ts`. Do not duplicate media loading, style workspaces, or retries.
- Keep the public surface small. Export new API from `src/index.ts` (or `src/mcp.ts` via `openextract/mcp`).
- Prefer concise, fast code. Reuse helpers; do not add layers for a single call site.
- Comments describe what the code does, not the product.
- Async-first. `extractAsync` / `AsyncExtractor` are aliases, not a second implementation.

## Extraction styles

`style` selects how the model inspects the input:

- `direct` (default) — send resolved media in one shot. Required for PDF, Office, images, audio, video.
- `search` — file tools over a UTF-8 text workspace.
- `code` — sandboxed JavaScript with the document as `document`.

`search` and `code` reject binary / non-UTF-8 input. Do not silently fall back to `direct`.

## Testing

- Add or update a Vitest file next to the behavior you change (`tests/<area>.test.ts`).
- Use `mockModel` / `mockModelFn` from `tests/helpers.ts`. Do not hit a live provider in unit tests.
- Cover success, typed errors (`ModelError`, `SchemaValidationError`, `InputTooLargeError`, `UrlFetchError`), and retry/style edge cases.
- Run `npm test` and `npm run typecheck` before finishing. For `web/` changes, also run `npm run web:typecheck`.

## Security

URL fetch is a privileged operation. Keep the SSRF and size guards in `src/media.ts`:

- Only `http` / `https`.
- Re-validate the host on every redirect hop.
- Default 50 MiB cap (`OPENEXTRACT_MAX_INPUT_BYTES`).
- Private hosts stay blocked unless `OPENEXTRACT_ALLOW_PRIVATE_URLS` is set.

Do not weaken these for convenience. Details: [SECURITY.md](SECURITY.md).

## Agent surfaces

When *using* this library as an agent (not just editing it):

1. Call `extract(schema, model, input, options?)` or the MCP `extract` tool.
2. Pass a Zod schema in process, or JSON Schema / `module:exportName` over MCP.
3. Use `extractMany` / `extract_many` for batches. Default concurrency is 5.
4. Reuse an `Extractor` / `create_extractor` session when schema, model, and style stay fixed.
5. Choose `style` from the input type; do not invent a fourth style without extending `ExtractionStyle`.

MCP: `npx openextract-mcp` (stdio) or `--http --port 3000` (loopback). Tools: `extract`, `extract_many`, `create_extractor`, `extractor_extract`, `close_extractor`. Resources: `openextract://capabilities`, `openextract://docs/api`.

## Docs

Update [README.md](README.md) and [docs/api-reference.md](docs/api-reference.md) when the public API, CLI, MCP tools, or env vars change. Note user-facing changes in [CHANGELOG.md](CHANGELOG.md) under `[Unreleased]`.
