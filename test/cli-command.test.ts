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

function createIo(overrides?: {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
  isTTY?: boolean;
  env?: NodeJS.ProcessEnv;
}) {
  return {
    stdout: () => {},
    stderr: () => {},
    isTTY: false,
    env: {},
    ...overrides,
  };
}

describe("executeCli", () => {
  it("returns usage error on invalid command", async () => {
    const stderr: string[] = [];
    const code = await executeCli(
      ["nope"],
      createIo({ stderr: (value) => stderr.push(value) }),
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
    const stderr: string[] = [];
    const code = await executeCli(
      ["lint"],
      createIo({ stderr: (value) => stderr.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
    expect(stderr[0]).toContain("Missing required argument");
  });

  it("returns usage error when lint has too many positional arguments", async () => {
    const stderr: string[] = [];
    const code = await executeCli(
      ["lint", "./ontology-a", "./ontology-b"],
      createIo({ stderr: (value) => stderr.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
    expect(stderr[0]).toContain("Too many arguments for lint");
  });

  it("calls lint runner and returns lint exit code", async () => {
    const runLintMock = vi.fn(async () => emptyLintResult(1));
    const renderMock = vi.fn(() => "lint-report");
    const stdout: string[] = [];

    const code = await executeCli(
      ["lint", "./ontology", "--fail-on-warnings"],
      createIo({
        stdout: (value) => stdout.push(value),
      }),
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
    expect(renderMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        colorMode: "auto",
        isTTY: false,
        noColor: false,
      }),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(stdout).toEqual(["lint-report"]);
    expect(code).toBe(1);
  });

  it("returns usage error for unknown lint flag", async () => {
    const stderr: string[] = [];
    const code = await executeCli(
      ["lint", "./ontology", "--bad-flag"],
      createIo({ stderr: (value) => stderr.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
    expect(stderr[0]).toContain("Unknown option: --bad-flag");
  });

  it("prints help text and returns success", async () => {
    const stdout: string[] = [];

    const code = await executeCli(
      ["--help"],
      createIo({ stdout: (value) => stdout.push(value) }),
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
      createIo(),
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
      createIo(),
      {
        startServer: startMock,
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(startMock).not.toHaveBeenCalled();
    expect(code).toBe(2);
  });

  it("supports --fail-on-warnings=true and --fail-on-warnings=false", async () => {
    const runLintTrue = vi.fn(async () => emptyLintResult(0));
    const runLintFalse = vi.fn(async () => emptyLintResult(0));

    const codeTrue = await executeCli(
      ["lint", "./ontology", "--fail-on-warnings=true"],
      createIo(),
      {
        startServer: vi.fn(async () => {}),
        runLint: runLintTrue,
        renderLintReport: vi.fn(() => ""),
      },
    );

    const codeFalse = await executeCli(
      ["lint", "./ontology", "--fail-on-warnings=false"],
      createIo(),
      {
        startServer: vi.fn(async () => {}),
        runLint: runLintFalse,
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(codeTrue).toBe(0);
    expect(codeFalse).toBe(0);
    expect(runLintTrue).toHaveBeenCalledWith({
      ontologyDir: "./ontology",
      failOnWarnings: true,
    });
    expect(runLintFalse).toHaveBeenCalledWith({
      ontologyDir: "./ontology",
      failOnWarnings: false,
    });
  });

  it("returns usage error for invalid --fail-on-warnings value", async () => {
    const stderr: string[] = [];
    const code = await executeCli(
      ["lint", "./ontology", "--fail-on-warnings=maybe"],
      createIo({ stderr: (value) => stderr.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(2);
    expect(stderr[0]).toContain("Invalid value for --fail-on-warnings: maybe");
  });

  it("shows lint help and returns success", async () => {
    const stdout: string[] = [];
    const code = await executeCli(
      ["lint", "--help"],
      createIo({ stdout: (value) => stdout.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => emptyLintResult(0)),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(0);
    expect(stdout[0]).toContain("Usage:");
  });

  it("short-circuits to lint help when --help is combined with other lint args", async () => {
    const stdout: string[] = [];
    const runLintMock = vi.fn(async () => emptyLintResult(0));
    const code = await executeCli(
      ["lint", "./ontology", "--help", "--fail-on-warnings"],
      createIo({ stdout: (value) => stdout.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: runLintMock,
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(0);
    expect(runLintMock).not.toHaveBeenCalled();
    expect(stdout[0]).toContain("Usage:");
  });

  it("returns friendly lint failure message without stack by default", async () => {
    const stderr: string[] = [];
    const err = new Error("boom");
    err.stack = "Error: boom\nat fake:1:1";

    const code = await executeCli(
      ["lint", "./ontology"],
      createIo({ stderr: (value) => stderr.push(value) }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => {
          throw err;
        }),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(1);
    expect(stderr[0]).toBe("Lint failed: boom");
    expect(stderr.some((value) => value.includes("at fake:1:1"))).toBe(false);
  });

  it("prints stacktrace in debug mode for lint failures", async () => {
    const stderr: string[] = [];
    const err = new Error("debug-boom");
    err.stack = "Error: debug-boom\nat fake-debug:2:2";

    const code = await executeCli(
      ["lint", "./ontology"],
      createIo({
        stderr: (value) => stderr.push(value),
        env: { ONTOMCP_DEBUG: "1" },
      }),
      {
        startServer: vi.fn(async () => {}),
        runLint: vi.fn(async () => {
          throw err;
        }),
        renderLintReport: vi.fn(() => ""),
      },
    );

    expect(code).toBe(1);
    expect(stderr[0]).toBe("Lint failed: debug-boom");
    expect(stderr.some((value) => value.includes("at fake-debug:2:2"))).toBe(true);
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
