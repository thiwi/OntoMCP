import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { OntologyCompiler } from "../compiler/compile.js";
import { OntologyPayloadValidator } from "../compiler/validate.js";
import { loadOntologyModel } from "../ontology/ingest.js";
import type { OntologyModel } from "../ontology/types.js";
import { OntoMcpToolRuntime, UnknownEntityError } from "./tools.js";

export interface OntoMcpServerContext {
  model: OntologyModel;
  compiler: OntologyCompiler;
  validator: OntologyPayloadValidator;
  runtime: OntoMcpToolRuntime;
}

export async function createOntoMcpServerContext(
  ontologyDirectory: string,
): Promise<OntoMcpServerContext> {
  const model = await loadOntologyModel(ontologyDirectory);
  const compiler = new OntologyCompiler(model);
  const validator = new OntologyPayloadValidator(compiler);
  const runtime = new OntoMcpToolRuntime(model, ontologyDirectory, compiler, validator);

  return {
    model,
    compiler,
    validator,
    runtime,
  };
}

function toolErrorResponse(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    structuredContent: { error: message },
  };
}

export function registerOntoMcpTools(server: McpServer, runtime: OntoMcpToolRuntime): void {
  server.registerTool(
    "list_domain_entities",
    {
      title: "List Domain Entities",
      description: "Returns a sorted list of all OWL classes available in the ontology.",
    },
    async () => {
      const result = runtime.listDomainEntities();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "list_ontology_packs",
    {
      title: "List Ontology Packs",
      description: "Returns available ontology packs and metadata for discovery.",
    },
    async () => {
      const result = runtime.listOntologyPacks();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );

  server.registerTool(
    "get_entity_schema",
    {
      title: "Get Entity Schema",
      description:
        "Compiles one ontology entity into deterministic JSON Schema, Zod snippet, and semantic context.",
      inputSchema: {
        entity_name: z.string().min(1),
      },
    },
    async ({ entity_name }) => {
      try {
        const result = runtime.getEntitySchema(entity_name);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof UnknownEntityError) {
          return toolErrorResponse(error.message);
        }

        return toolErrorResponse(`Failed to compile entity schema: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "validate_payload_against_ontology",
    {
      title: "Validate Payload Against Ontology",
      description: "Validates a JSON payload with AJV against the compiled ontology JSON Schema.",
      inputSchema: {
        entity_name: z.string().min(1),
        json_payload: z.record(z.string(), z.unknown()),
      },
    },
    async ({ entity_name, json_payload }) => {
      try {
        const result = runtime.validatePayload(entity_name, json_payload);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof UnknownEntityError) {
          return toolErrorResponse(error.message);
        }

        return toolErrorResponse(`Failed to validate payload: ${(error as Error).message}`);
      }
    },
  );

  server.registerTool(
    "get_entity_graph_context",
    {
      title: "Get Entity Graph Context",
      description:
        "Returns a bounded graph-neighborhood summary with related entities, edge cardinalities, and warning hotspots.",
      inputSchema: {
        entity_name: z.string().min(1),
        max_relations: z.number().int().min(1).max(200).optional(),
        max_warning_hotspots: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ entity_name, max_relations, max_warning_hotspots }) => {
      try {
        const result = runtime.getEntityGraphContext(
          entity_name,
          max_relations,
          max_warning_hotspots,
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        if (error instanceof UnknownEntityError) {
          return toolErrorResponse(error.message);
        }

        return toolErrorResponse(`Failed to build entity graph context: ${(error as Error).message}`);
      }
    },
  );
}

export async function createOntoMcpServer(ontologyDirectory: string): Promise<{
  server: McpServer;
  context: OntoMcpServerContext;
}> {
  const context = await createOntoMcpServerContext(ontologyDirectory);

  const server = new McpServer({
    name: "ontomcp",
    version: "0.1.0",
  });

  registerOntoMcpTools(server, context.runtime);

  return {
    server,
    context,
  };
}
