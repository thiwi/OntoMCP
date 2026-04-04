# Capital Markets Example Ontology

This pack models trade lifecycle and settlement structures with recursive references.

## Main entities

- `Trade`
- `Instrument`
- `Counterparty`
- `Book`
- `Allocation`
- `SettlementInstruction`
- `CashLeg`
- `SecurityLeg`
- `ClearingStatus`

## Why this pack is useful

- Includes recursive references around trade allocations and settlement instructions.
- Mixes required and optional graph edges with scalar and multi-value constraints.
- Contains unsupported semantics (`owl:propertyChainAxiom`) and unsupported datatype (`xsd:dateTime`) for fallback behavior checks.

## Run OntoMCP with this ontology

From repository root:

```bash
cd /path/to/OntoMCP
ONTOLOGY_DIR=./examples/ontologies/capital-markets npm run dev
```

Then call MCP tools:

- `list_domain_entities`
- `get_entity_schema` with `entity_name: "Trade"`
- `validate_payload_against_ontology` with payloads from `sample-payloads.json`
