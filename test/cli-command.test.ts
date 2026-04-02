import { describe, expect, it, vi } from "vitest";

import { executeCli, main } from "../src/cli.js";
import type { LintResult } from "../src/cli/lint.js";

function emptyLintResult(exitCode: 0 | 1): LintResult {
  return {
    ontology_dir: "/tmp/ontology",
    entity_count: 0,
    warning_count: exitCode === 1 ? 1 : 0,
    fail_on_warnings: exitCode === 1,
    failed: exitCode === 1,
    exit_code: exitCode,
    ingest_entity_warnings: [],
    ingest_property_warnings: [],
    compile_warnings: [],
    warnings: [],
  };
}

describe("executeCli", () => {
  it("returns usage error on invalid command", async () => {
    const stderr: string[] = [];
    const code = await executeCli(
      ["nope"],
      { stdout: () => {}, stderr: (value) => stderr.push(value) },
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
    expect(stderr[0]).toContain("Usage:");
  });

  it("returns usage error when lint arguments are missing", async () => {
    const code = await executeCli(
      ["lint"],
      { stdout: () => {}, stderr: () => {} },
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
  });

  it("calls lint runner and returns lint exit code", async () => {
    const runLintMock = vi.fn(async () => emptyLintResult(1));
    const renderMock = vi.fn(() => "lint-report");
    const stdout: string[] = [];

    const code = await executeCli(
      ["lint", "./ontology", "--fail-on-warnings"],
      {
        stdout: (value) => stdout.push(value),
        stderr: () => {},
      },
      {
        startServer: vi.fn(async () => {}),
        runLint: runLintMock,
        renderLintReport: renderMock,
      },
    );

    expect(runLintMock).toHaveBeenCalledWith({
      ontologyDir: "./ontology",
      failOnWarnings: true,
    });
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(stdout).toEqual(["lint-report"]);
    expect(code).toBe(1);
  });

  it("returns usage error for unknown lint flag", async () => {
    const code = await executeCli(
      ["lint", "./ontology", "--bad-flag"],
      { stdout: () => {}, stderr: () => {} },
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
  });

  it("prints help text and returns success", async () => {
    const stdout: string[] = [];

    const code = await executeCli(
      ["--help"],
      { stdout: (value) => stdout.push(value), stderr: () => {} },
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(0);
    expect(stdout[0]).toContain("Usage:");
  });

  it("defaults to start mode with no arguments", async () => {
    const startMock = vi.fn(async () => {});

    const code = await executeCli(
      [],
      { stdout: () => {}, stderr: () => {} },
      {
        startServer: startMock,
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(startMock).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });

  it("rejects extra arguments in start mode", async () => {
    const startMock = vi.fn(async () => {});

    const code = await executeCli(
      ["start", "extra"],
      { stdout: () => {}, stderr: () => {} },
      {
        startServer: startMock,
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(startMock).not.toHaveBeenCalled();
    expect(code).toBe(2);
  });

  it("main exits with non-zero code for usage errors", async () => {
    const originalArgv = process.argv;
    const originalExit = process.exit;
    try {
      process.argv = ["node", "cli.js", "unknown-command"];

      const exitSpy = vi.fn((code?: number) => {
        throw new Error(`process.exit:${code ?? 0}`);
      });
      process.exit = exitSpy as typeof process.exit;

      await expect(main()).rejects.toThrow("process.exit:2");
      expect(exitSpy).toHaveBeenCalledWith(2);
    } finally {
      process.argv = originalArgv;
      process.exit = originalExit;
    }
  });
});
