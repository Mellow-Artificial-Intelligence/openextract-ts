# Vision

openextract exists so an agent can turn any file, URL, or stream into typed data without building a pipeline.

The product is not “another LLM wrapper.” It is the extraction layer agents reach for: one schema, one call, validated output — and a way to scale that call into a swarm when the job is too large or too varied for a single pass.

## North star

**Extraction is easy for agents.** An agent should not write fetchers, prompt templates, parsers, or retry loops. It names the shape it wants, points at a source, and gets a Zod-validated object (or a typed error). MCP, CLI, TUI, and the TypeScript API all express that same contract.

**Swarms are available when you need them.** Simple documents stay single-shot. Hard jobs — many files, mixed media, several schemas, or a document that must be searched then computed — fan out across agents that share the same extract primitive. The swarm is optional infrastructure, not a different product.

**The kind of extraction is easy to vary.** Style (`direct`, `search`, `code`), schema, model, instructions, and concurrency are knobs, not forks. Adding a new extraction mode should be a new style or a new schema, not a new library.

## Why this exists

Agents already read files and call models. What they lack is a reliable, typed extract step they can reuse:

- The same call for a PDF, an image, a CSV, or a URL.
- A schema the runtime enforces, so downstream tools see data, not prose.
- Batch and session forms so a swarm can share configuration without copying prompts.
- Styles that match the work: send the bytes, search the text, or run code against it.

If extraction stays ad hoc, every agent reinvents it. openextract is that shared step.

## Design principles

1. **One primitive.** `extract(schema, model, input, options?)` is the core. Batch, sessions, CLI, TUI, web, and MCP are adapters. New surfaces call the shared pipeline; they do not reimplement it.
2. **Schema is the API.** The caller describes the result. The library returns that type or a typed failure. No raw model strings on the happy path.
3. **Agents first, humans included.** MCP tools, JSON Schema, and `module:exportName` are as important as the TypeScript import. The TUI and web UI are the same extract flow with a face.
4. **Single-shot by default, swarm by composition.** `extractMany`, extractor sessions, and parallel MCP calls are how swarms form. Orchestration sits on top of extract, never beside it.
5. **Variability without fragmentation.** Styles, models, instructions, and schemas are interchangeable. A fourth style is an extension of `ExtractionStyle`, not a parallel stack.
6. **Safe defaults.** Size caps, SSRF guards, and explicit `mediaType` for bytes stay on. Convenience never removes the guardrails.

## What “easy for agents” means

- Discoverable: MCP resources (`openextract://capabilities`, `openextract://docs/api`) and this repo’s agent files explain the contract.
- Minimal: schema + source (+ optional style/instructions) is enough.
- Typed: success is a validated object; failure is `UrlFetchError`, `InputTooLargeError`, `SchemaValidationError`, `ModelError`, or `ProviderNotInstalledError`.
- Reusable: an `Extractor` holds schema, model, style, and retry policy so a swarm worker does not re-specify them per file.
- Composable: one agent can plan a schema, another can extract, another can merge. Each step uses the same primitive.

## What “swarms when needed” means

Not every extract needs a swarm. A one-page invoice should be one `direct` call.

Use a swarm when:

- The corpus is many inputs (`extractMany` / `extract_many`).
- The work splits by schema (invoices vs. contracts vs. tables).
- The work splits by style (search a log, then code-reduce it, then `direct` on attached images).
- Validation or coverage needs a second pass with a different model or schema.

A swarm is just concurrent extract calls with a shared or per-worker schema. openextract supplies the workers and the typed results; the caller supplies the split and the join.

## What “easy variability” means

Extraction type is a choice at the call site:

| Knob | What it changes |
| --- | --- |
| Schema | The shape of the result |
| `style` | How the model inspects the source |
| `instructions` | Natural-language bias without a new code path |
| Model | Provider/quality/cost via AI Gateway ids |
| Session vs one-shot | Whether config is reused |
| Batch concurrency | How hard the swarm hits the provider |

The caller should be able to change any of these without rewriting I/O, retries, or validation.

## Current foundation

- Shared pipeline: media → style workspace → retries → structured model output (`runDocumentExtraction` / `runLoadedExtraction`).
- Styles: `direct`, `search`, `code`.
- Surfaces: library, CLI, OpenTUI, Next.js UI, MCP, Vercel Workflows.
- Batch (`extractMany`) for many inputs; `extractSwarm` for many agents on one input (`merge` / `vote` / `first`).
- `Extractor` sessions and `openextract/workflow` for reused or durable runs.

## Direction

Keep the primitive small. Grow the ways agents can *use* it:

- Richer style/variability so new extraction modes plug in without new entry points.
- Clearer swarm composition (split, map, reduce) on top of `extract` / `extractMany` / `extractSwarm`.
- Better agent discovery: capabilities, schemas, and examples that an MCP client can act on immediately.
- The same contract everywhere — if a human can extract it in the TUI, an agent can extract it through MCP.

## Non-goals

- A general agent framework or workflow engine.
- Replacing the Vercel AI SDK or AI Gateway.
- Unstructured “summarize this” as the primary API.
- Weakening URL or size safety to make demos easier.

## Success

An agent can extract a new document type by choosing a schema and a style — not by forking the repo. When the job outgrows one call, the same agent (or a swarm of them) keeps using `extract`. Variability stays in options, not in one-off pipelines.
