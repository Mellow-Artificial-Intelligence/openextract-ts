# Contributing to openextract

Thanks for your interest in contributing to openextract!

## Development setup

```bash
git clone https://github.com/Mellow-Artificial-Intelligence/openextract-ts.git
cd openextract-ts
npm install
npm run test:coverage
npm run typecheck
```

The local Next.js cookbook lives in `web/`. From the repo root: `npm install --prefix web` then `npm run web`. OpenTUI recipes: `npm run cookbook`.

## Making changes

1. Create a new branch from `main`
2. Make your changes
3. Ensure `npm run test:coverage` and `npm run typecheck` are clean (`npm run web:typecheck` if you touched `web/`)
4. Open a pull request with `.github/PULL_REQUEST_TEMPLATE.md`

Keep changes focused. Public API lives in `src/index.ts`. Agent conventions are in [AGENTS.md](AGENTS.md); product direction is in [VISION.md](VISION.md). User and agent how-to lives in `docs/` (GitHub Pages).

Preview docs locally with Jekyll (`docs/` as source) or by opening the Markdown files. The Pages workflow publishes `docs/` on `main`.

## Issues

Use a form under `.github/ISSUE_TEMPLATE/` (bug, feature, or agent/MCP). Blank issues are disabled so reports stay structured.
