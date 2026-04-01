import path from "node:path";

export const repoRoot = path.resolve(process.cwd());
export const ontologyDir = path.resolve(repoRoot, "test", "fixtures");
export const examplesOntologiesDir = path.resolve(repoRoot, "examples", "ontologies");
