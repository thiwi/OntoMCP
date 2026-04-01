import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createOntoMcpServer } from "../src/mcp/server.js";
import { ontologyDir } from "./helpers.js";

describe("MCP tool integration", () => {
  let server: Awaited<ReturnType<typeof createOntoMcpServer>>["server"];
  let client: Client;

  beforeAll(async () => {
    const built = await createOntoMcpServer(ontologyDir);
    server = built.server;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "ontomcp-test-client", version: "1.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  it("registers and serves all required tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort((left, right) => left.localeCompare(right));

    expect(names).toEqual([
      "get_entity_graph_context",
      "get_entity_schema",
      "list_domain_entities",
      "list_ontology_packs",
      "validate_payload_against_ontology",
    ]);
  });

  it("list_domain_entities returns deterministic entity names", async () => {
    const result = await client.callTool({
      name: "list_domain_entities",
      arguments: {},
    });

    const structured = result.structuredContent as { entities: string[] };
    expect(structured.entities).toEqual(["BankAccount", "FinanceAccount", "ITAccount", "Person"]);
  });

  it("get_entity_schema returns compiled schema bundle", async () => {
    const result = await client.callTool({
      name: "get_entity_schema",
      arguments: { entity_name: "Person" },
    });

    const structured = result.structuredContent as {
      json_schema: { $defs: Record<string, unknown> };
      zod_code_snippet: string;
      semantic_context: string;
    };

    expect(Object.keys(structured.json_schema.$defs)).toContain("Person");
    expect(structured.zod_code_snippet).toContain("z.lazy(() => BankAccountSchema)");
    expect(structured.semantic_context).toContain("A 'Person'");
  });

  it("list_ontology_packs returns deterministic pack metadata", async () => {
    const result = await client.callTool({
      name: "list_ontology_packs",
      arguments: {},
    });

    const structured = result.structuredContent as {
      packs: Array<{
        pack_id: string;
        ontology_dir: string;
        entity_count: number;
        warning_count: number;
        loaded_at: string;
        active: boolean;
      }>;
    };

    expect(structured.packs).toHaveLength(1);
    expect(structured.packs[0]?.pack_id).toBe("ontology");
    expect(structured.packs[0]?.ontology_dir).toBe(ontologyDir);
    expect(structured.packs[0]?.entity_count).toBe(4);
    expect(structured.packs[0]?.warning_count).toBeGreaterThan(0);
    expect(structured.packs[0]?.active).toBe(true);
    expect(structured.packs[0]?.loaded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("get_entity_graph_context returns bounded neighborhood context", async () => {
    const result = await client.callTool({
      name: "get_entity_graph_context",
      arguments: {
        entity_name: "Person",
        max_relations: 1,
        max_warning_hotspots: 2,
      },
    });

    const structured = result.structuredContent as {
      entity_name: string;
      relations: Array<{
        direction: "incoming" | "outgoing";
        related_entity: string;
        via_field: string;
        cardinality: string;
      }>;
      relation_count: number;
      warning_hotspots: Array<{ scope: string; property_name?: string }>;
      warning_hotspot_count: number;
    };

    expect(structured.entity_name).toBe("Person");
    expect(structured.relation_count).toBe(1);
    expect(structured.warning_hotspot_count).toBeLessThanOrEqual(2);
    expect(structured.relations[0]?.related_entity).toBe("BankAccount");
    expect(structured.relations[0]?.cardinality.length).toBeGreaterThan(0);
    expect(structured.relations[0]?.direction).toMatch(/incoming|outgoing/);
    expect(structured.warning_hotspots.some((hotspot) => hotspot.scope === "property")).toBe(true);
  });

  it("validate_payload_against_ontology delegates to AJV validation", async () => {
    const valid = await client.callTool({
      name: "validate_payload_against_ontology",
      arguments: {
        entity_name: "Person",
        json_payload: {
          fullName: "Alice Example",
          customerStatus: "ACTIVE",
        },
      },
    });

    const validStructured = valid.structuredContent as { valid: boolean; errors: unknown[] };
    expect(validStructured.valid).toBe(true);
    expect(validStructured.errors).toEqual([]);

    const invalid = await client.callTool({
      name: "validate_payload_against_ontology",
      arguments: {
        entity_name: "Person",
        json_payload: {},
      },
    });

    const invalidStructured = invalid.structuredContent as { valid: boolean; errors: Array<{ keyword: string }> };
    expect(invalidStructured.valid).toBe(false);
    expect(invalidStructured.errors.some((error) => error.keyword === "required")).toBe(true);
  });

  it("returns structured tool error for unknown entities", async () => {
    const result = await client.callTool({
      name: "get_entity_schema",
      arguments: { entity_name: "DoesNotExist" },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: "Unknown entity: DoesNotExist" });
  });

  it("returns structured tool error for unknown graph context entity", async () => {
    const result = await client.callTool({
      name: "get_entity_graph_context",
      arguments: { entity_name: "DoesNotExist" },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: "Unknown entity: DoesNotExist" });
  });
});
