#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { startOntoMcpServer } from "./mcp/startup.js";
import {
  renderLintReport,
  runLint,
  type LintOptions,
  type LintResult,
  type RenderLintReportOptions,
} from "./cli/lint.js";

interface CliIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
  isTTY: boolean;
}

interface CliDependencies {
  startServer: () => Promise<void>;
  runLint: (options: LintOptions) => Promise<LintResult>;
  renderLintReport: (result: LintResult, options?: RenderLintReportOptions) => string;
}

const defaultIo: CliIO = {
  stdout: console.log,
  stderr: console.error,
  isTTY: Boolean(process.stdout.isTTY),
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
    "  ontomcp lint <ontologyDir> [--fail-on-warnings|--fail-on-warnings=true|--fail-on-warnings=false]",
    "",
    "Exit codes:",
    "  0  success",
    "  1  runtime failure, or lint warnings with --fail-on-warnings",
    "  2  usage error",
  ].join("\n");
}

interface LintParseSuccess {
  kind: "ok";
  ontologyDir: string;
  failOnWarnings: boolean;
}

interface LintParseError {
  kind: "error";
  message: string;
}

interface LintParseHelp {
  kind: "help";
}

type LintParseResult = LintParseSuccess | LintParseError | LintParseHelp;

function parseBooleanFromFlag(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

function parseLintArguments(args: string[]): LintParseResult {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "help")) {
    return { kind: "help" };
  }

  let failOnWarnings = false;
  const positionals: string[] = [];

  for (const arg of args) {
    if (arg === "--help" || arg === "help") {
      return {
        kind: "error",
        message: "The --help option cannot be combined with other lint arguments.",
      };
    }

    if (arg === "--fail-on-warnings") {
      failOnWarnings = true;
      continue;
    }

    if (arg.startsWith("--fail-on-warnings=")) {
      const value = arg.slice("--fail-on-warnings=".length);
      const parsed = parseBooleanFromFlag(value);
      if (parsed === undefined) {
        return {
          kind: "error",
          message: `Invalid value for --fail-on-warnings: ${value}`,
        };
      }
      failOnWarnings = parsed;
      continue;
    }

    if (arg.startsWith("-")) {
      return {
        kind: "error",
        message: `Unknown option: ${arg}`,
      };
    }

    positionals.push(arg);
  }

  if (positionals.length !== 1) {
    return {
      kind: "error",
      message: "Missing required argument: <ontologyDir>",
    };
  }

  return {
    kind: "ok",
    ontologyDir: positionals[0]!,
    failOnWarnings,
  };
}

function debugModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.ONTOMCP_DEBUG;
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
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
    if (parsed.kind === "help") {
      io.stdout(usageText());
      return 0;
    }

    if (parsed.kind === "error") {
      io.stderr(parsed.message);
      io.stderr(usageText());
      return 2;
    }

    try {
      const lintResult = await deps.runLint({
        ontologyDir: parsed.ontologyDir,
        failOnWarnings: parsed.failOnWarnings,
      });

      io.stdout(
        deps.renderLintReport(lintResult, {
          colorMode: "auto",
          isTTY: io.isTTY,
          noColor: Boolean(process.env.NO_COLOR),
        }),
      );
      return lintResult.exit_code;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`Lint failed: ${message}`);

      if (debugModeEnabled()) {
        const stack = error instanceof Error ? error.stack : undefined;
        if (stack && stack.length > 0) {
          io.stderr(stack);
        }
      }

      return 1;
    }
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
