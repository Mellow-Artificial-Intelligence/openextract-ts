# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Importable extract agents in the eve pattern: default-export `defineAgent` / `defineRemoteAgent` (no `name`), `outputSchema` on the definition, and specialists under `subagents/`. `loadAgent` accepts a directory (`agent.ts` + `subagents/` + optional `instructions.md`), a file, or `module:exportName`. `extract(agent, input)` uses `outputSchema`. Auth from `openextract/agents/auth` (`bearer`, `basic`, `vercelOidc`). Remote agents POST loaded bytes to `{url}{path}` (default `/extract`). CLI `--agent` / `--agents` and MCP `agent` / `agents`. Failures raise `RemoteAgentError`.

## [0.2.0] - 2026-08-15

### Added

- Agent-native repo docs: `AGENTS.md`, `CLAUDE.md`, and `VISION.md`.
- Structured GitHub issue forms (bug, feature, agent/MCP) and an agent-oriented pull request template.
- Agent swarms: `extractSwarm` / `extractSwarmWithResults` run parallel agents on one input (same model × `size`, or a mixed model list) and reduce with `merge`, `vote`, or `first`. Wired through the CLI (`--swarm`, `--models`, `--reduce`), MCP (`extract_swarm`), and the web UI, where each agent gets its own model picker.
- `openextract/workflow` durable extraction: `extractWorkflow` / `extractManyWorkflow` for Vercel Workflows, plus `runSerializableExtract` for app-local `"use workflow"` wrappers. Arguments are JSON Schema + path/URL/base64 (Zod objects are not serializable across step boundaries).
- Local web UI runs table extraction as a `WorkflowAgent` workflow (`POST /api/extract` starts the run).

### Changed

- Skip Vercel preview and pull-request deploys; only production builds on `main` run.

## [0.1.0] - 2026-08-14

### Added

- GitHub Pages landing page for the TypeScript package: Zod, AI Gateway, MCP, OpenTUI, and the local web UI.
- Interactive OpenTUI app for extracting structured data from a file, URL, or pasted text. Launch with `openextract` or `openextract --tui`. Schemas can be a preset, field list, JSON example, JSON Schema, or `module:export`.
- MCP server (`openextract-mcp` / `openextract/mcp`) exposing extract, extract_many, and extractor sessions over stdio and Streamable HTTP, plus capabilities resources and extract prompts.
- Local Next.js UI (`npm run web`) with AI SDK streaming and AI Elements.
- `web/vercel.json` so Vercel treats the UI as a Next.js app (set the Git root directory to `web/`).

### Changed

- Restyled the Next.js web UI to match the GitHub Pages landing page: Inter / JetBrains Mono, light `#fafafa` canvas, square cards, and the OE mark.
- Rewrote the library in TypeScript on the Vercel AI SDK. Schemas are Zod objects, model calls use `generateText` / `ToolLoopAgent` through AI Gateway, and the public API is async-first (`extract`, `extractWithUsage`, `extractMany`, `Extractor`).
- Shared one extraction pipeline across one-shot, session, and batch APIs so media loading, style workspaces, retries, and option defaults are no longer duplicated.

[Unreleased]: https://github.com/Mellow-Artificial-Intelligence/openextract-ts/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Mellow-Artificial-Intelligence/openextract-ts/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Mellow-Artificial-Intelligence/openextract-ts/releases/tag/v0.1.0
