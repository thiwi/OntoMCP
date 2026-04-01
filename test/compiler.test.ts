import { beforeAll, describe, expect, it } from "vitest";

import { OntologyCompiler } from "../src/compiler/compile.js";
import { loadOntologyModel } from "../src/ontology/ingest.js";
import { ontologyDir } from "./helpers.js";

describe("OntologyCompiler", () => {
  let compiler: OntologyCompiler;

  beforeAll(async () => {
    const model = await loadOntologyModel(ontologyDir);
    compiler = new OntologyCompiler(model);
  });

  it("builds cycle-safe JSON Schema with $defs/$ref", () => {
    const bundle = compiler.compileEntityBundle("Person");
    const defs = bundle.json_schema.$defs as Record<string, any>;

    expect(bundle.json_schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(bundle.json_schema.$ref).toBe("#/$defs/Person");

    expect(defs.Person.properties.ownsAccount.items.$ref).toBe("#/$defs/BankAccount");
    expect(defs.BankAccount.properties.hasOwner.$ref).toBe("#/$defs/Person");
    expect(defs.Person.properties.customerStatus.enum).toEqual(["ACTIVE", "BLOCKED", "SUSPENDED"]);
    expect(defs.Person.properties.contactEmail.pattern).toBe("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    expect(defs.Person.properties.contactEmail.minLength).toBe(5);
    expect(defs.Person.properties.contactEmail.maxLength).toBe(254);
    expect(defs.Person.properties.isVip.type).toBe("boolean");
    expect(defs.Person.properties.lastKycReviewAt.format).toBe("date-time");
    expect(defs.BankAccount.properties.availableBalance.type).toBe("number");
  });

  it("generates z.lazy bundle and injects semantic comments", () => {
    const bundle = compiler.compileEntityBundle("Person");

    expect(bundle.zod_code_snippet).toContain("z.lazy(() => BankAccountSchema)");
    expect(bundle.zod_code_snippet).toContain("z.lazy(() => PersonSchema)");
    expect(bundle.zod_code_snippet).toContain('customerStatus: z.union([z.literal("ACTIVE"), z.literal("BLOCKED"), z.literal("SUSPENDED")])');
    expect(bundle.zod_code_snippet).toContain('contactEmail: z.string().regex(new RegExp("^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$")).min(5).max(254).optional()');
    expect(bundle.zod_code_snippet).toContain("isVip: z.boolean().optional()");
    expect(bundle.zod_code_snippet).toContain("lastKycReviewAt: z.string().datetime().optional()");
    expect(bundle.zod_code_snippet).toContain("A banking customer profile.");
    expect(bundle.zod_code_snippet).toContain("Legal full name of the person.");
  });

  it("falls back to z.any for unsupported rules", () => {
    const bundle = compiler.compileEntityBundle("Person");

    expect(bundle.zod_code_snippet).toContain("unsupportedRiskLink: z.any().optional()");
    expect(bundle.semantic_context).toContain("Warnings:");
  });

  it("is deterministic for repeated compilation", () => {
    const first = compiler.compileEntityBundle("Person");
    const second = compiler.compileEntityBundle("Person");

    expect(first).toEqual(second);
  });
});
