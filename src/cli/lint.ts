import path from "node:path";

import { OntologyCompiler } from "../compiler/compile.js";
import { loadOntologyModel } from "../ontology/ingest.js";

export type LintWarningScope = "ingest_entity" | "ingest_property" | "compile";

export interface LintWarningRecord {
  scope: LintWarningScope;
  entity_name: string;
  property_name?: string;
  message: string;
}

export interface IngestEntityWarningGroup {
  entity_name: string;
  warnings: string[];
}

export interface IngestPropertyWarningGroup {
  entity_name: string;
  property_name: string;
  warnings: string[];
}

export interface CompileWarningGroup {
  entity_name: string;
  warnings: string[];
}

export interface LintResult {
  ontology_dir: string;
  entity_count: number;
  warning_count: number;
  fail_on_warnings: boolean;
  failed: boolean;
  exit_code: 0 | 1;
  ingest_entity_warnings: IngestEntityWarningGroup[];
  ingest_property_warnings: IngestPropertyWarningGroup[];
  compile_warnings: CompileWarningGroup[];
  warnings: LintWarningRecord[];
}

export interface LintOptions {
  ontologyDir: string;
  failOnWarnings: boolean;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function dedupeWarningRecords(records: LintWarningRecord[]): LintWarningRecord[] {
  const byKey = new Map<string, LintWarningRecord>();

  for (const record of records) {
    const key = `${record.scope}|${record.entity_name}|${record.property_name ?? ""}|${record.message}`;
    if (!byKey.has(key)) {
      byKey.set(key, record);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const byScope = left.scope.localeCompare(right.scope);
    if (byScope !== 0) {
      return byScope;
    }
    const byEntity = left.entity_name.localeCompare(right.entity_name);
    if (byEntity !== 0) {
      return byEntity;
    }
    const byProperty = (left.property_name ?? "").localeCompare(right.property_name ?? "");
    if (byProperty !== 0) {
      return byProperty;
    }
    return left.message.localeCompare(right.message);
  });
}

export async function runLint(options: LintOptions): Promise<LintResult> {
  const ontologyDirectory = path.resolve(options.ontologyDir);
  const model = await loadOntologyModel(ontologyDirectory);
  const compiler = new OntologyCompiler(model);

  const ingestEntityWarnings: IngestEntityWarningGroup[] = [];
  const ingestPropertyWarnings: IngestPropertyWarningGroup[] = [];
  const compileWarnings: CompileWarningGroup[] = [];
  const warningRecords: LintWarningRecord[] = [];

  for (const entity of model.entities) {
    if (entity.warnings.length > 0) {
      const warnings = uniqueSorted(entity.warnings);
      ingestEntityWarnings.push({
        entity_name: entity.name,
        warnings,
      });
      for (const warning of warnings) {
        warningRecords.push({
          scope: "ingest_entity",
          entity_name: entity.name,
          message: warning,
        });
      }
    }

    for (const property of entity.properties) {
      if (property.warnings.length === 0) {
        continue;
      }

      const warnings = uniqueSorted(property.warnings);
      ingestPropertyWarnings.push({
        entity_name: entity.name,
        property_name: property.fieldName,
        warnings,
      });

      for (const warning of warnings) {
        warningRecords.push({
          scope: "ingest_property",
          entity_name: entity.name,
          property_name: property.fieldName,
          message: warning,
        });
      }
    }
  }

  for (const entityName of model.entityNames) {
    const bundle = compiler.compileEntityBundle(entityName);
    if (bundle.warnings.length === 0) {
      continue;
    }

    const warnings = uniqueSorted(bundle.warnings);
    compileWarnings.push({
      entity_name: entityName,
      warnings,
    });

    for (const warning of warnings) {
      warningRecords.push({
        scope: "compile",
        entity_name: entityName,
        message: warning,
      });
    }
  }

  const warnings = dedupeWarningRecords(warningRecords);
  const warningCount = warnings.length;
  const failed = options.failOnWarnings && warningCount > 0;

  return {
    ontology_dir: ontologyDirectory,
    entity_count: model.entities.length,
    warning_count: warningCount,
    fail_on_warnings: options.failOnWarnings,
    failed,
    exit_code: failed ? 1 : 0,
    ingest_entity_warnings: ingestEntityWarnings.sort((left, right) =>
      left.entity_name.localeCompare(right.entity_name),
    ),
    ingest_property_warnings: ingestPropertyWarnings.sort((left, right) => {
      const byEntity = left.entity_name.localeCompare(right.entity_name);
      if (byEntity !== 0) {
        return byEntity;
      }
      return left.property_name.localeCompare(right.property_name);
    }),
    compile_warnings: compileWarnings.sort((left, right) => left.entity_name.localeCompare(right.entity_name)),
    warnings,
  };
}

export function renderLintReport(result: LintResult): string {
  const lines: string[] = [];

  lines.push("OntoMCP Lint Report");
  lines.push("");
  lines.push(`Ontology directory: ${result.ontology_dir}`);
  lines.push(`Entity count: ${result.entity_count}`);
  lines.push(`Fail on warnings: ${result.fail_on_warnings ? "yes" : "no"}`);
  lines.push("");

  if (result.ingest_entity_warnings.length > 0) {
    lines.push("Ingest warnings (entity)");
    for (const group of result.ingest_entity_warnings) {
      lines.push(`- ${group.entity_name}`);
      for (const warning of group.warnings) {
        lines.push(`  * ${warning}`);
      }
    }
    lines.push("");
  }

  if (result.ingest_property_warnings.length > 0) {
    lines.push("Ingest warnings (property)");
    for (const group of result.ingest_property_warnings) {
      lines.push(`- ${group.entity_name}.${group.property_name}`);
      for (const warning of group.warnings) {
        lines.push(`  * ${warning}`);
      }
    }
    lines.push("");
  }

  if (result.compile_warnings.length > 0) {
    lines.push("Compile warnings (by root entity)");
    for (const group of result.compile_warnings) {
      lines.push(`- ${group.entity_name}`);
      for (const warning of group.warnings) {
        lines.push(`  * ${warning}`);
      }
    }
    lines.push("");
  }

  lines.push("Summary");
  lines.push(`- Total warnings: ${result.warning_count}`);
  lines.push(`- Status: ${result.failed ? "FAIL" : "PASS"}`);

  return lines.join("\n");
}
