# OntoMCP Development Guide

## Project structure

- `src/ontology`: Turtle ingestion, normalization, naming.
- `src/compiler`: ontology -> JSON Schema / Zod compiler and AJV validation.
- `src/mcp`: MCP server and tool registration/runtime.
- `ontology/`: default local ontology pack.
- `examples/ontologies/`: optional sample packs.

## Local commands

```bash
npm run dev
npm run build
npm test
npm run test:coverage
npm run typecheck
```

## Determinism guidelines

- Sort entities, properties, warnings, and output lists.
- Prefer stable field ordering in generated schema/snippets.
- Keep unknown/unsupported semantics graceful (`z.any()` + warnings).

## Testing expectations

- New parser/compiler behavior must have unit tests.
- MCP tools should have integration tests via `InMemoryTransport`.
- Coverage target is enforced via `vitest.config.ts`.

## Non-goals

- No OWL inferencing engine.
- No ORM or SQL schema generation.
- Focus is DTO generation and payload validation.
