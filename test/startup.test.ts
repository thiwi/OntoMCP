import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { resolveOntologyDirectory, startOntoMcpServer } from "../src/mcp/startup.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ontomcp-startup-"));
  tempDirs.push(dir);
  return dir;
}

describe("startup helpers", () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("resolves ontology directory from ONTOLOGY_DIR when provided", () => {
    const resolved = resolveOntologyDirectory("/tmp/repo", { ONTOLOGY_DIR: "./custom-pack" });
    expect(resolved).toBe(path.resolve("./custom-pack"));
  });

  it("falls back to examples/ontologies/retail-banking when present", async () => {
    const cwd = await createTempDir();
    await mkdir(path.resolve(cwd, "examples", "ontologies", "retail-banking"), { recursive: true });

    const resolved = resolveOntologyDirectory(cwd, {});
    expect(resolved).toBe(path.resolve(cwd, "examples", "ontologies", "retail-banking"));
  });

  it("falls back to ./ontology when no env var and no example pack exists", async () => {
    const cwd = await createTempDir();
    const resolved = resolveOntologyDirectory(cwd, {});

    expect(resolved).toBe(path.resolve(cwd, "ontology"));
  });

  it("starts server via injected dependencies", async () => {
    const connectSpy = vi.fn(async () => {});
    const fakeTransport = {} as StdioServerTransport;
    const logSpy = vi.fn();
    const createServerSpy = vi.fn(async () => ({
      server: {
        connect: connectSpy,
      },
    }));

    await startOntoMcpServer(
      "/tmp/project",
      {},
      {
        createServer: createServerSpy,
        createTransport: () => fakeTransport,
        log: logSpy,
      },
    );

    expect(createServerSpy).toHaveBeenCalledWith(path.resolve("/tmp/project", "ontology"));
    expect(connectSpy).toHaveBeenCalledWith(fakeTransport);
    expect(logSpy).toHaveBeenCalledWith(
      `OntoMCP server is running on stdio (ontology: ${path.resolve("/tmp/project", "ontology")})`,
    );
  });
});
