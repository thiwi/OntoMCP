import { startOntoMcpServer } from "./mcp/startup.js";

async function main(): Promise<void> {
  await startOntoMcpServer();
}

main().catch((error) => {
  console.error("OntoMCP startup failure:", error);
  process.exit(1);
});
