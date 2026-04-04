# Credit Risk Example Ontology

This pack models a credit risk domain with namespace collisions, cycles, and deeper reference chains.

## Main entities

- `Obligor`
- `Facility`
- `Exposure`
- `Covenant`
- `CollateralAsset`
- `Valuation`
- `Guarantee`
- `DefaultEvent`
- `RiskRating`
- `CRMRating` (namespace-collision case from `crm:Rating`)

## Why this pack is useful

- Includes namespace collision (`risk:Rating` vs `crm:Rating`) to verify deterministic prefix-based naming.
- Includes cyclic links (`Obligor <-> Facility`, `CollateralAsset <-> Valuation`).
- Contains unsupported semantics (`owl:propertyChainAxiom`) and unsupported datatypes (`xsd:dateTime`) to validate graceful degradation.

## Run OntoMCP with this ontology

From repository root:

```bash
cd /path/to/OntoMCP
ONTOLOGY_DIR=./examples/ontologies/credit-risk npm run dev
```

Then call MCP tools:

- `list_domain_entities`
- `get_entity_schema` with `entity_name: "Obligor"`
- `validate_payload_against_ontology` with payloads from `sample-payloads.json`
