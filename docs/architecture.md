# Architecture

OntoMCP consists of three runtime layers:

1. **Ingestion (`src/ontology`)**
   - Recursively loads `.ttl` files.
   - Parses triples into an in-memory graph (`n3.Store`).
   - Normalizes classes, properties, labels/comments, and SHACL constraints.

2. **Compiler (`src/compiler`)**
   - Converts ontology entities into Draft 2020-12 JSON Schema.
   - Generates cycle-safe Zod snippets (`z.lazy`).
   - Degrades unsupported semantics to safe fallbacks (`z.any`) with warnings.

3. **MCP interface (`src/mcp`)**
   - Exposes deterministic tools over MCP stdio.
   - Supports schema lookup, validation, pack listing, and graph context.

## Tool flow

- `list_domain_entities` -> compiler entity index
- `get_entity_schema` -> compile bundle (`json_schema`, `zod_code_snippet`, `semantic_context`)
- `validate_payload_against_ontology` -> AJV validation against compiled JSON Schema
- `list_ontology_packs` -> ontology pack metadata
- `get_entity_graph_context` -> bounded relationship + warning hotspot summary

## Design constraints

- No OWL inferencing engine.
- Deterministic output order (entities/fields/warnings).
- No ORM or SQL generation.
