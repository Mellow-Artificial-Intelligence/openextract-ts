# Contributing to openextract

Thanks for your interest in contributing to openextract!

## Development setup

```bash
git clone https://github.com/Mellow-Artificial-Intelligence/openextract.git
cd openextract
npm install
npm test
npm run typecheck
```

The local Next.js UI lives in `web/`. From the repo root: `npm install --prefix web` then `npm run web`.

## Making changes

1. Create a new branch from `main`
2. Make your changes
3. Ensure tests pass and `npm run typecheck` is clean
4. Submit a pull request

Keep changes focused. Public API lives in `src/index.ts`.
