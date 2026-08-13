# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Rewrote the library in TypeScript on the Vercel AI SDK. Schemas are Zod objects, model calls use `generateText` / `ToolLoopAgent` through AI Gateway, and the public API is async-first (`extract`, `extractWithUsage`, `extractMany`, `Extractor`).
