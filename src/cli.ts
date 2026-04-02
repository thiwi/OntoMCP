#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { startOntoMcpServer } from "./mcp/startup.js";
import { renderLintReport, runLint, type LintOptions, type LintResult } from "./cli/lint.js";

interface CliIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

interface CliDependencies {
  startServer: () => Promise<void>;
  runLint: (options: LintOptions) => Promise<LintResult>;
  renderLintReport: (result: LintResult) => string;
}

const defaultIo: CliIO = {
  stdout: console.log,
  stderr: console.error,
};

const defaultDependencies: CliDependencies = {
  startServer: startOntoMcpServer,
  runLint,
  renderLintReport,
};

function usageText(): string {
  return [
    "Usage:",
    "  ontomcp [start]",
    "  ontomcp lint <ontologyDir> [--fail-on-warnings]",
    "",
    "Exit codes:",
    "  0  success",
    "  1  runtime failure, or lint warnings with --fail-on-warnings",
    "  2  usage error",
  ].join("\n");
}

function parseLintArguments(args: string[]): { ontologyDir: string; failOnWarnings: boolean } | undefined {
  let failOnWarnings = false;
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === "--fail-on-warnings") {
      failOnWarnings = true;
      continue;
    }

    if (arg.startsWith("-")) {
      return undefined;
    }

    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    return undefined;
  }

  return {
    ontologyDir: positionals[0]!,
    failOnWarnings,
  };
}

export async function executeCli(
  args: string[],
  io: CliIO = defaultIo,
  deps: CliDependencies = defaultDependencies,
): Promise<number> {
  const [command, ...rest] = args;

  if (!command || command === "start") {
    if (rest.length > 0) {
      io.stderr(usageText());
      return 2;
    }

    await deps.startServer();
    return 0;
  }

  if (command === "lint") {
    const parsed = parseLintArguments(rest);
    if (!parsed) {
      io.stderr(usageText());
      return 2;
    }

    const lintResult = await deps.runLint({
      ontologyDir: parsed.ontologyDir,
      failOnWarnings: parsed.failOnWarnings,
    });

    io.stdout(deps.renderLintReport(lintResult));
    return lintResult.exit_code;
  }

  if (command === "-h" || command === "--help" || command === "help") {
    io.stdout(usageText());
    return 0;
  }

  io.stderr(usageText());
  return 2;
}

export async function main(): Promise<void> {
  const code = await executeCli(process.argv.slice(2));
  if (code !== 0) {
    process.exit(code);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error) => {
    console.error("OntoMCP CLI failure:", error);
    process.exit(1);
  });
}
