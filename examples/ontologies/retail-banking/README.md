# Retail Banking Example Ontology

This pack models a retail banking domain with cyclic relations and mixed cardinalities.

## Main entities

- `Customer`
- `Household`
- `CurrentAccount`
- `SavingsAccount`
- `Card`
- `LoanContract`
- `Collateral`
- `Branch`
- `KycProfile`

## Why this pack is useful

- Includes cycles (for example `Customer <-> CurrentAccount` and `LoanContract <-> Collateral`).
- Uses required, optional, scalar, and multi-value fields.
- Contains an unsupported semantic rule (`owl:propertyChainAxiom`) to test graceful fallback to `z.any()`.

## Run OntoMCP with this ontology

From repository root:

```bash
cd /path/to/OntoMCP
ONTOLOGY_DIR=./examples/ontologies/retail-banking npm run dev
```

Then call MCP tools:

- `list_domain_entities`
- `get_entity_schema` with `entity_name: "Customer"`
- `validate_payload_against_ontology` with payloads from `sample-payloads.json`
