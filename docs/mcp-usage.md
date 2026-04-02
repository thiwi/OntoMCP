# MCP Usage Guide

For CLI startup/lint workflows, see [CLI guide](./cli.md).

## Available tools

### `list_domain_entities`

Returns all ontology entity names.

### `get_entity_schema`

Input:

```json
{ "entity_name": "Person" }
```

Output:

- `json_schema`
- `zod_code_snippet`
- `semantic_context`

### `validate_payload_against_ontology`

Input:

```json
{
  "entity_name": "Person",
  "json_payload": {
    "fullName": "Alice Example",
    "customerStatus": "ACTIVE"
  }
}
```

Output:

- `valid: boolean`
- `errors: AjvErrorObject[]`

### `list_ontology_packs`

Returns metadata for ontology packs known by the running server.

### `get_entity_graph_context`

Input:

```json
{
  "entity_name": "Person",
  "max_relations": 50,
  "max_warning_hotspots": 50
}
```

Output:

- bounded relation neighborhood,
- cardinality summary,
- warning hotspots.

## Error behavior

Unknown entity errors are returned as structured MCP tool errors:

```json
{ "error": "Unknown entity: <Name>" }
```
