import { describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerOntoMcpTools } from "../src/mcp/server.js";
import { OntoMcpToolRuntime } from "../src/mcp/tools.js";
import type { OntologyModel } from "../src/ontology/types.js";

function buildSyntheticModel(): OntologyModel {
  const root = {
    iri: "http://example.com/synth#Root",
    namespaceIri: "http://example.com/synth#",
    localName: "Root",
    name: "Root",
    label: "Root",
    comment: "Synthetic root entity.",
    shapeIris: [],
    warnings: ["Entity-level warning"],
    properties: [
      { iri: "ex:pExact", fieldName: "pExact", minCount: 1, maxCount: 1, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pAtMost", fieldName: "pAtMost", minCount: 0, maxCount: 1, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pOneOrMore", fieldName: "pOneOrMore", minCount: 1, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pMultiple", fieldName: "pMultiple", minCount: 0, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pZero", fieldName: "pZero", minCount: 0, maxCount: 0, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pBetween", fieldName: "pBetween", minCount: 2, maxCount: 5, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pUpTo", fieldName: "pUpTo", minCount: 0, maxCount: 3, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pUnspecified", fieldName: "pUnspecified", minCount: -1, classIri: "http://example.com/synth#Target", patterns: [], warnings: [] },
      { iri: "ex:pMissingTarget", fieldName: "pMissingTarget", minCount: 0, maxCount: 1, classIri: "http://example.com/synth#Missing", patterns: [], warnings: [] },
      { iri: "ex:pNoClass", fieldName: "pNoClass", minCount: 0, maxCount: 1, patterns: [], warnings: [] },
      { iri: "ex:pWarn", fieldName: "pWarn", minCount: 0, maxCount: 1, classIri: "http://example.com/synth#Target", patterns: [], warnings: ["Property warning"] },
    ],
  };

  const incoming = {
    iri: "http://example.com/synth#Incoming",
    namespaceIri: "http://example.com/synth#",
    localName: "Incoming",
    name: "Incoming",
    shapeIris: [],
    warnings: [],
    properties: [
      { iri: "ex:inLink", fieldName: "inLink", minCount: 1, maxCount: 1, classIri: root.iri, patterns: [], warnings: [] },
    ],
  };

  const target = {
    iri: "http://example.com/synth#Target",
    namespaceIri: "http://example.com/synth#",
    localName: "Target",
    name: "Target",
    shapeIris: [],
    warnings: [],
    properties: [],
  };

  const entities = [incoming, root, target];
  return {
    ontologyDir: "/",
    store: {} as OntologyModel["store"],
    prefixesByNamespace: new Map(),
    entities,
    entitiesByName: new Map(entities.map((entity) => [entity.name, entity])),
    entitiesByIri: new Map(entities.map((entity) => [entity.iri, entity])),
    entityNames: entities.map((entity) => entity.name),
  };
}

describe("OntoMcpToolRuntime edge behavior", () => {
  it("builds pack summary and bounded graph context deterministically", () => {
    const model = buildSyntheticModel();
    const compiler = {
      listEntityNames: () => ["Root"],
      hasEntity: (name: string) => name === "Root",
      compileEntityBundle: () => ({ json_schema: {}, zod_code_snippet: "", semantic_context: "", warnings: [] }),
    } as unknown as ConstructorParameters<typeof OntoMcpToolRuntime>[2];
    const validator = {
      validate: () => ({ valid: true, errors: [] }),
    } as unknown as ConstructorParameters<typeof OntoMcpToolRuntime>[3];

    const runtime = new OntoMcpToolRuntime(model, "/", compiler, validator);
    const packs = runtime.listOntologyPacks();
    expect(packs.packs).toHaveLength(1);
    expect(packs.packs[0]?.pack_id).toBe("ontology");
    expect(packs.packs[0]?.warning_count).toBeGreaterThanOrEqual(2);

    const graph = runtime.getEntityGraphContext("Root", 200, 200);
    expect(graph.entity_name).toBe("Root");
    expect(graph.relations.length).toBeGreaterThan(0);

    const cardinalities = new Set(graph.relations.map((relation) => relation.cardinality));
    expect(cardinalities.has("exactly one")).toBe(true);
    expect(cardinalities.has("at most one")).toBe(true);
    expect(cardinalities.has("one or more")).toBe(true);
    expect(cardinalities.has("multiple")).toBe(true);
    expect(cardinalities.has("zero")).toBe(true);
    expect(cardinalities.has("between 2 and 5")).toBe(true);
    expect(cardinalities.has("up to 3")).toBe(true);
    expect(cardinalities.has("unspecified")).toBe(true);

    const bounded = runtime.getEntityGraphContext("Root", 1, 1);
    expect(bounded.relation_count).toBe(1);
    expect(bounded.warning_hotspot_count).toBe(1);
  });
});

describe("MCP server generic error mapping", () => {
  it("returns toolErrorResponse for non-UnknownEntity failures", async () => {
    const fakeRuntime = {
      listDomainEntities: () => ({ entities: [] }),
      listOntologyPacks: () => ({ packs: [] }),
      getEntitySchema: () => {
        throw new Error("schema fail");
      },
      validatePayload: () => {
        throw new Error("validate fail");
      },
      getEntityGraphContext: () => {
        throw new Error("graph fail");
      },
    } as unknown as OntoMcpToolRuntime;

    const server = new McpServer({ name: "err-test", version: "1.0.0" });
    registerOntoMcpTools(server, fakeRuntime);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "err-client", version: "1.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const schema = await client.callTool({
      name: "get_entity_schema",
      arguments: { entity_name: "Root" },
    });
    expect(schema.isError).toBe(true);
    expect(schema.structuredContent).toEqual({ error: "Failed to compile entity schema: schema fail" });

    const validate = await client.callTool({
      name: "validate_payload_against_ontology",
      arguments: { entity_name: "Root", json_payload: {} },
    });
    expect(validate.isError).toBe(true);
    expect(validate.structuredContent).toEqual({ error: "Failed to validate payload: validate fail" });

    const graph = await client.callTool({
      name: "get_entity_graph_context",
      arguments: { entity_name: "Root" },
    });
    expect(graph.isError).toBe(true);
    expect(graph.structuredContent).toEqual({ error: "Failed to build entity graph context: graph fail" });

    await Promise.all([client.close(), server.close()]);
  });
});

