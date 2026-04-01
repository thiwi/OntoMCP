import { beforeAll, describe, expect, it } from "vitest";

import { OntologyCompiler } from "../src/compiler/compile.js";
import { OntologyPayloadValidator } from "../src/compiler/validate.js";
import { loadOntologyModel } from "../src/ontology/ingest.js";
import { ontologyDir } from "./helpers.js";

describe("OntologyPayloadValidator", () => {
  let validator: OntologyPayloadValidator;

  beforeAll(async () => {
    const model = await loadOntologyModel(ontologyDir);
    const compiler = new OntologyCompiler(model);
    validator = new OntologyPayloadValidator(compiler);
  });

  it("accepts valid payloads", () => {
    const result = validator.validate("Person", {
      fullName: "Alice Example",
      customerStatus: "ACTIVE",
      contactEmail: "alice@example.com",
      isVip: true,
      lastKycReviewAt: "2026-01-15T10:30:00Z",
      ownsAccount: [
        {
          accountNumber: 123,
          availableBalance: 1200.55,
          hasOwner: {
            fullName: "Alice Example",
            customerStatus: "ACTIVE",
          },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing required fields", () => {
    const result = validator.validate("Person", {});

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.keyword === "required")).toBe(true);
  });

  it("rejects invalid integer datatype", () => {
    const result = validator.validate("BankAccount", {
      accountNumber: "abc",
      availableBalance: 5.75,
      hasOwner: {
        fullName: "Alice Example",
        customerStatus: "ACTIVE",
      },
    } as unknown as Record<string, unknown>);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath === "/accountNumber")).toBe(true);
  });

  it("enforces array semantics when sh:maxCount is absent", () => {
    const result = validator.validate("Person", {
      fullName: "Alice Example",
      customerStatus: "ACTIVE",
      ownsAccount: {
        accountNumber: 123,
        availableBalance: 1200.55,
        hasOwner: {
          fullName: "Alice Example",
          customerStatus: "ACTIVE",
        },
      },
    } as unknown as Record<string, unknown>);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath === "/ownsAccount")).toBe(true);
  });

  it("rejects values outside sh:in enum", () => {
    const result = validator.validate("Person", {
      fullName: "Alice Example",
      customerStatus: "UNKNOWN",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath === "/customerStatus")).toBe(true);
  });

  it("rejects sh:pattern and sh:minLength violations", () => {
    const result = validator.validate("Person", {
      fullName: "Alice Example",
      customerStatus: "ACTIVE",
      contactEmail: "x",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath === "/contactEmail")).toBe(true);
  });

  it("rejects invalid xsd:boolean and xsd:dateTime values", () => {
    const result = validator.validate("Person", {
      fullName: "Alice Example",
      customerStatus: "ACTIVE",
      isVip: "yes",
      lastKycReviewAt: "not-a-date",
    } as unknown as Record<string, unknown>);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath === "/isVip")).toBe(true);
    expect(result.errors.some((error) => error.instancePath === "/lastKycReviewAt")).toBe(true);
  });
});
