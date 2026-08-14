# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Interactive OpenTUI app for extracting structured data from a file, URL, or pasted text. Launch with `openextract` or `openextract --tui`. Schemas can be a preset, field list, JSON example, JSON Schema, or `module:export`.
- MCP server (`openextract-mcp` / `openextract/mcp`) exposing extract, extract_many, and extractor sessions over stdio and Streamable HTTP, plus capabilities resources and extract prompts.
- Local Next.js UI (`npm run web`) with AI SDK streaming and AI Elements.
- `web/vercel.json` so Vercel treats the UI as a Next.js app (set the Git root directory to `web/`).

### Changed

- Restyled the Next.js web UI to match the GitHub Pages landing page: Inter / JetBrains Mono, light `#fafafa` grid, square cards, and the OE mark.
- Rewrote the library in TypeScript on the Vercel AI SDK. Schemas are Zod objects, model calls use `generateText` / `ToolLoopAgent` through AI Gateway, and the public API is async-first (`extract`, `extractWithUsage`, `extractMany`, `Extractor`).
- Shared one extraction pipeline across one-shot, session, and batch APIs so media loading, style workspaces, retries, and option defaults are no longer duplicated.
