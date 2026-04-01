# OntoMCP

[![CI](https://github.com/thiwi/OntoMCP/actions/workflows/ci.yml/badge.svg)](https://github.com/thiwi/OntoMCP/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Ontology Model Context Protocol Server for deterministic, ontology-driven DTO/schema generation.

## Why

LLM coding agents often invent data models that violate enterprise ontology rules.  
OntoMCP provides a local MCP server that:

- ingests OWL/RDFS/SHACL Turtle files,
- compiles deterministic JSON Schema + Zod snippets,
- validates payloads with AJV against compiled ontology schemas.

## Features

- `list_domain_entities`
- `get_entity_schema`
- `validate_payload_against_ontology`
- `list_ontology_packs`
- `get_entity_graph_context`

## Quickstart

```bash
npm install
npm run build
npm run start
```

Default ontology path:

- `ONTOLOGY_DIR=<repo>/ontology`

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
        "ONTOLOGY_DIR": "/absolute/path/to/OntoMCP/ontology"
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

- [Improvement roadmap](./docs/ontomcp-improvements.md)
- [Developer guide](./docs/development.md)
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
