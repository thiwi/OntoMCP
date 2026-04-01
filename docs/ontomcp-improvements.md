# OntoMCP Improvement Roadmap

This roadmap prioritizes practical, non-breaking improvements for OntoMCP.

## P0: Reliability and Error UX

### Goals

- Make validation and translation failures deterministic and easy to act on.
- Reduce ambiguity for AI agents consuming tool outputs.

### Work items

1. Normalize AJV errors in `validate_payload_against_ontology`.
2. Introduce deterministic warning codes for compiler degradations (for example `UNSUPPORTED_PROPERTY_CHAIN`, `UNSUPPORTED_DATATYPE`, `CONFLICTING_PROPERTY_CONSTRAINT`).
3. Improve unknown-entity diagnostics with suggestions from nearest entity names.

### Acceptance criteria

- Tool output returns stable, machine-readable error/warning codes.
- Two identical invalid payloads produce byte-identical error payload order.
- Unknown entity responses include up to 3 deterministic suggestions.

## P1: Expand SHACL and Datatype Coverage

### Goals

- Increase fidelity between enterprise ontology constraints and generated schemas.

### Work items

1. Add support for `sh:in` enum constraints.
2. Add support for `sh:pattern`, `sh:minLength`, `sh:maxLength`.
3. Add datatype mappings for `xsd:boolean`, `xsd:decimal`, `xsd:dateTime`.

### Acceptance criteria

- `get_entity_schema` emits JSON Schema/Zod constraints for supported SHACL facets.
- AJV validation fails on out-of-enum, pattern, and length violations.
- Existing behavior for unsupported constructs remains graceful (no crashes).

## P2: Performance and Operability

### Goals

- Improve runtime responsiveness and observability for larger ontology packs.

### Work items

1. Add ontology hot-reload mode with cache invalidation.
2. Build an ontology-pack index (metadata per pack: entity count, warnings, last loaded timestamp).
3. Add structured telemetry spans for ingestion, compile, and validation paths.

### Acceptance criteria

- Reloading ontology updates compiler cache without process restart.
- Entity schemas after reload reflect new triples deterministically.
- Telemetry provides per-tool latency and degradation counts.

## P3: Optional MCP Tooling Extensions (Non-Breaking)

### Goals

- Improve discoverability and graph-level context for consuming AI agents.

### Candidate tools

1. `list_ontology_packs`: list available ontology packs and metadata.
2. `get_entity_graph_context`: return neighborhood graph summary (related entities, edge cardinalities, warning hotspots).

### Acceptance criteria

- Existing tools stay backward compatible.
- New tools are optional and do not alter current contracts.
- Context output remains bounded and deterministic.
