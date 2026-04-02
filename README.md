# OntoMCP

[![CI](https://github.com/thiwi/OntoMCP/actions/workflows/ci.yml/badge.svg)](https://github.com/thiwi/OntoMCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Ontology Model Context Protocol (MCP) server and CLI linter for deterministic, ontology-driven schema generation and validation.

<img src="docs/logo.png" alt="OntoMCP Logo" width="300" height="300" style="max-width: 300px; max-height: 300px;" />

## Why

LLM coding agents often invent data models that violate enterprise ontology rules.  
OntoMCP provides:

- ingests OWL/RDFS/SHACL Turtle files,
- compiles deterministic JSON Schema + Zod snippets,
- validates payloads with AJV against compiled ontology schemas,
- lints ontology packs from the CLI (optionally fail-on-warnings for CI gates).

## Features

- `list_domain_entities`
- `get_entity_schema`
- `validate_payload_against_ontology`
- `list_ontology_packs`
- `get_entity_graph_context`
- `ontomcp lint <ontologyDir> [--fail-on-warnings]`

## Quickstart

```bash
npm install
npm run build
npm run start
```

CLI lint examples:

```bash
# report warnings
node dist/cli.js lint /absolute/path/to/ontology-pack

# fail CI on warnings
node dist/cli.js lint /absolute/path/to/ontology-pack --fail-on-warnings

# explicit boolean forms are also supported
node dist/cli.js lint /absolute/path/to/ontology-pack --fail-on-warnings=true
```

Lint UX notes:

- unknown options fail with exit code `2` and show `Unknown option: ...`
- `ontomcp lint --help` works as a short-circuit (also when combined with other lint args)
- fatal lint failures print `Lint failed: ...` (stacktraces only with `ONTOMCP_DEBUG=1`)
- PASS/FAIL is colorized automatically in TTY terminals

Default ontology path:

- `ONTOLOGY_DIR=<repo>/examples/ontologies/retail-banking`

Override with:

```bash
ONTOLOGY_DIR=/absolute/path/to/ttl-pack npm run start
```

## Use in VS Code MCP

Create/update `.vscode/mcp.json`:

```json
{
  "servers": {
    "ontoMcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/OntoMCP/dist/index.js"],
      "env": {
        "ONTOLOGY_DIR": "/absolute/path/to/OntoMCP/examples/ontologies/retail-banking"
      }
    }
  }
}
```

Then in chat you can call tools like:

- `list_domain_entities`
- `get_entity_schema` for an entity
- `validate_payload_against_ontology` before writing API code

## Development

```bash
npm run dev
npm test
npm run test:coverage
npm run typecheck
```

Coverage target is configured in `vitest.config.ts`.

## Documentation

- [Developer guide](./docs/development.md)
- [CLI guide](./docs/cli.md)
- [MCP usage guide](./docs/mcp-usage.md)
- [Architecture](./docs/architecture.md)
- [Maintainer operations](./docs/maintainers.md)

## Example ontology packs

Additive sample packs are under:

- `examples/ontologies/retail-banking`
- `examples/ontologies/credit-risk`
- `examples/ontologies/capital-markets`

They are **not** auto-loaded unless `ONTOLOGY_DIR` points to one of them.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## Community and governance

- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)
- [Support](./SUPPORT.md)
- [Changelog](./CHANGELOG.md)

## License

MIT, see [LICENSE](./LICENSE).
