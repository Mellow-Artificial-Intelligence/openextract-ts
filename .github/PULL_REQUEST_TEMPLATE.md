## Summary

<!-- One or two sentences: what changed and why. -->

## Surface

<!-- Check every area this PR touches. -->

- [ ] Library / public API (`src/`, `src/index.ts`)
- [ ] CLI / TUI
- [ ] MCP
- [ ] Web UI (`web/`)
- [ ] Docs / agent files (`AGENTS.md`, `CLAUDE.md`, `VISION.md`)

## Changes

<!-- Concrete file- or behavior-level list. -->

-

## Pipeline

<!-- Required if this PR adds or changes an extract path. See AGENTS.md. -->

- [ ] No new extract implementation (or it calls `runDocumentExtraction`)
- [ ] No new public export without updating `src/index.ts` (or `openextract/mcp`)
- [ ] Style change extends `ExtractionStyle` rather than adding a parallel stack
- [ ] N/A (docs, CI, or non-extract code)

## Testing

```bash
npm test
npm run typecheck
```

<!-- What you ran, which tests you added, and any live-model gaps. -->

-

## Docs

- [ ] `README.md` / `docs/api-reference.md` updated (API, CLI, MCP, or env)
- [ ] `CHANGELOG.md` `[Unreleased]` updated
- [ ] N/A

## Checklist

- [ ] Read [AGENTS.md](https://github.com/Mellow-Artificial-Intelligence/openextract-ts/blob/main/AGENTS.md). Read [VISION.md](https://github.com/Mellow-Artificial-Intelligence/openextract-ts/blob/main/VISION.md) if this changes extract APIs, styles, swarms, or MCP.
- [ ] `npm test` and `npm run typecheck` pass
- [ ] `npm run web:typecheck` if `web/` changed
- [ ] SSRF and size guards in `src/media.ts` are unchanged (or intentionally tightened)
