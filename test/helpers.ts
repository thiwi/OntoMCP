import path from "node:path";

export const repoRoot = path.resolve(process.cwd());
export const ontologyDir = path.resolve(repoRoot, "test", "fixtures");
export const examplesOntologiesDir = path.resolve(repoRoot, "examples", "ontologies");
export const lintCleanOntologyDir = path.resolve(repoRoot, "test", "lint-fixtures", "clean");
export const lintEntityWarningOntologyDir = path.resolve(
  repoRoot,
  "test",
  "lint-fixtures",
  "entity-warning",
);
export const lintMultiWarningOntologyDir = path.resolve(
  repoRoot,
  "test",
  "lint-fixtures",
  "multi-warning",
);
