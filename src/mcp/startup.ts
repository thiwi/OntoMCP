import path from "node:path";
import { existsSync } from "node:fs";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createOntoMcpServer } from "./server.js";

export interface StartupDependencies {
  createServer: typeof createOntoMcpServer;
  createTransport: () => StdioServerTransport;
  log: (message: string) => void;
}

export function resolveOntologyDirectory(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredDirectory = env.ONTOLOGY_DIR;
  if (configuredDirectory && configuredDirectory.trim().length > 0) {
    return path.resolve(configuredDirectory.trim());
  }

  const exampleDefault = path.resolve(cwd, "examples", "ontologies", "retail-banking");
  if (existsSync(exampleDefault)) {
    return exampleDefault;
  }

  return path.resolve(cwd, "ontology");
}

export async function startOntoMcpServer(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  dependencies?: Partial<StartupDependencies>,
): Promise<void> {
  const ontologyDirectory = resolveOntologyDirectory(cwd, env);
  const createServer = dependencies?.createServer ?? createOntoMcpServer;
  const { server } = await createServer(ontologyDirectory);

  const transport = dependencies?.createTransport
    ? dependencies.createTransport()
    : new StdioServerTransport();
  await server.connect(transport);

  const log = dependencies?.log ?? console.error;
  log(`OntoMCP server is running on stdio (ontology: ${ontologyDirectory})`);
}
