import { describe, expect, it } from "vitest";

import { renderLintReport, runLint } from "../src/cli/lint.js";
import {
  lintCleanOntologyDir,
  lintEntityWarningOntologyDir,
  lintMultiWarningOntologyDir,
  ontologyDir,
} from "./helpers.js";

describe("runLint", () => {
  it("collects ingest + compile warnings and fails when fail-on-warnings is enabled", async () => {
    const result = await runLint({
      ontologyDir,
      failOnWarnings: true,
    });

    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.failed).toBe(true);
    expect(result.exit_code).toBe(1);
    expect(result.ingest_property_warnings.length).toBeGreaterThan(0);
    expect(result.compile_warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.scope === "ingest_property")).toBe(true);
    expect(result.warnings.some((warning) => warning.scope === "compile")).toBe(true);
  });

  it("passes on a clean ontology pack with fail-on-warnings enabled", async () => {
    const result = await runLint({
      ontologyDir: lintCleanOntologyDir,
      failOnWarnings: true,
    });

    expect(result.warning_count).toBe(0);
    expect(result.failed).toBe(false);
    expect(result.exit_code).toBe(0);
    expect(result.ingest_entity_warnings).toEqual([]);
    expect(result.ingest_property_warnings).toEqual([]);
    expect(result.compile_warnings).toEqual([]);
  });

  it("renders a stable textual lint report", async () => {
    const result = await runLint({
      ontologyDir: lintCleanOntologyDir,
      failOnWarnings: false,
    });

    const report = renderLintReport(result);
    expect(report).toContain("OntoMCP Lint Report");
    expect(report).toContain(`Ontology directory: ${lintCleanOntologyDir}`);
    expect(report).toContain("Summary");
    expect(report).toContain("- Status: PASS");
  });

  it("captures entity-level ingest warnings and reports warning sections", async () => {
    const result = await runLint({
      ontologyDir: lintEntityWarningOntologyDir,
      failOnWarnings: false,
    });

    expect(result.exit_code).toBe(0);
    expect(result.warning_count).toBeGreaterThan(0);
    expect(result.ingest_entity_warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.scope === "ingest_entity")).toBe(true);

    const report = renderLintReport(result);
    expect(report).toContain("Ingest warnings (entity)");
    expect(report).toContain("Summary");
    expect(report).toContain("- Status: PASS");
  });

  it("renders all warning groups when warning-rich fixture is linted", async () => {
    const result = await runLint({
      ontologyDir,
      failOnWarnings: true,
    });

    const report = renderLintReport(result);
    expect(report).toContain("Ingest warnings (property)");
    expect(report).toContain("Compile warnings (by root entity)");
    expect(report).toContain("- Status: FAIL");
  });

  it("keeps deterministic ordering for multi-warning properties", async () => {
    const result = await runLint({
      ontologyDir: lintMultiWarningOntologyDir,
      failOnWarnings: false,
    });

    expect(result.ingest_property_warnings.length).toBe(2);
    expect(result.ingest_property_warnings[0]?.property_name).toBe("badProp");
    expect(result.ingest_property_warnings[1]?.property_name).toBe("badPropB");
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
