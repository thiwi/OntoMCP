# Contributing to OntoMCP

## Setup

```bash
npm install
npm run build
npm test
```

## Development workflow

1. Create a branch from `main`.
2. Implement focused changes.
3. Run:
   - `npm test`
   - `npm run test:coverage`
   - `npm run typecheck`
4. Open a PR with:
   - problem statement,
   - design notes,
   - test evidence.

## Coding standards

- TypeScript strict mode must stay enabled.
- Keep output deterministic (stable sorting/order where applicable).
- Preserve non-breaking behavior of existing MCP tools.
- Add tests for new behavior and edge cases.

## Commit messages

Use clear, scoped messages, for example:

- `feat(mcp): add entity graph context tool`
- `fix(ingest): handle malformed sh:in list safely`
- `test(compiler): cover enum and pattern constraints`

## Reporting issues

When filing a bug, include:

- ontology snippet (`.ttl`),
- tool call payload,
- expected vs actual result,
- versions (`node`, `npm`, commit SHA).
