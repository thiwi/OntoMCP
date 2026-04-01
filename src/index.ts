import path from "node:path";
import { existsSync } from "node:fs";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createOntoMcpServer } from "./mcp/server.js";

function resolveOntologyDirectory(): string {
  const configuredDirectory = process.env.ONTOLOGY_DIR;
  if (configuredDirectory && configuredDirectory.trim().length > 0) {
    return path.resolve(configuredDirectory.trim());
  }

  const exampleDefault = path.resolve(process.cwd(), "examples", "ontologies", "retail-banking");
  if (existsSync(exampleDefault)) {
    return exampleDefault;
  }

  return path.resolve(process.cwd(), "ontology");
}

async function main(): Promise<void> {
  const ontologyDirectory = resolveOntologyDirectory();
  const { server } = await createOntoMcpServer(ontologyDirectory);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`OntoMCP server is running on stdio (ontology: ${ontologyDirectory})`);
}

main().catch((error) => {
  console.error("OntoMCP startup failure:", error);
  process.exit(1);
});
