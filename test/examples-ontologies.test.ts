import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { OntologyCompiler } from "../src/compiler/compile.js";
import { OntologyPayloadValidator } from "../src/compiler/validate.js";
import { loadOntologyModel } from "../src/ontology/ingest.js";
import { examplesOntologiesDir, repoRoot } from "./helpers.js";

interface ExamplePayloads {
  rootEntity: string;
  validPayload: Record<string, unknown>;
  invalidPayload: Record<string, unknown>;
}

const packs = [
  {
    id: "retail-banking",
    dir: path.resolve(examplesOntologiesDir, "retail-banking"),
  },
  {
    id: "credit-risk",
    dir: path.resolve(examplesOntologiesDir, "credit-risk"),
  },
  {
    id: "capital-markets",
    dir: path.resolve(examplesOntologiesDir, "capital-markets"),
  },
] as const;

describe("example ontologies", () => {
  for (const pack of packs) {
    it(`${pack.id}: loads and compiles deterministic schemas`, async () => {
      const payloads = JSON.parse(
        readFileSync(path.resolve(pack.dir, "sample-payloads.json"), "utf8"),
      ) as ExamplePayloads;

      const model = await loadOntologyModel(pack.dir);
      expect(model.entityNames.length).toBeGreaterThan(0);

      const compiler = new OntologyCompiler(model);
      const bundle = compiler.compileEntityBundle(payloads.rootEntity);

      expect(bundle.json_schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(bundle.json_schema.$ref).toBe(`#/$defs/${payloads.rootEntity}`);
      expect(bundle.zod_code_snippet).toContain("z.lazy(() =>");
      expect(bundle.zod_code_snippet).toContain("z.any()");

      const validator = new OntologyPayloadValidator(compiler);
      const validResult = validator.validate(payloads.rootEntity, payloads.validPayload);
      expect(validResult.valid).toBe(true);

      const invalidResult = validator.validate(payloads.rootEntity, payloads.invalidPayload);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });
  }

  it("credit-risk: resolves namespace collision without numeric suffixes", async () => {
    const model = await loadOntologyModel(path.resolve(examplesOntologiesDir, "credit-risk"));

    expect(model.entityNames).toContain("RiskRating");
    expect(model.entityNames).toContain("CRMRating");
    expect(model.entityNames.some((name) => /_\d+$/.test(name))).toBe(false);
  });

  it("cleanup: playground directory and references are removed", () => {
    expect(existsSync(path.resolve(repoRoot, "playground"))).toBe(false);

    const scan = spawnSync(
      "rg",
      [
        "-n",
        "playground",
        "src",
        "ontology",
        "examples",
        "docs",
        ".vscode",
        "package.json",
        "tsconfig.json",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(scan.status).toBe(1);
  });
});
