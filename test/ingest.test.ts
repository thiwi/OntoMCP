import { beforeAll, describe, expect, it } from "vitest";

import { loadOntologyModel } from "../src/ontology/ingest.js";
import { ontologyDir } from "./helpers.js";

describe("loadOntologyModel", () => {
  let model: Awaited<ReturnType<typeof loadOntologyModel>>;

  beforeAll(async () => {
    model = await loadOntologyModel(ontologyDir);
  });

  it("extracts entities with deterministic namespace-safe names", () => {
    expect(model.entityNames).toEqual(["BankAccount", "FinanceAccount", "ITAccount", "Person"]);
  });

  it("extracts labels/comments and SHACL constraints", () => {
    const person = model.entitiesByName.get("Person");
    expect(person).toBeDefined();
    expect(person?.label).toBe("Person");
    expect(person?.comment).toBe("A banking customer profile.");

    const fullName = person?.properties.find((property) => property.fieldName === "fullName");
    expect(fullName?.datatypeIri).toBe("http://www.w3.org/2001/XMLSchema#string");
    expect(fullName?.minCount).toBe(1);
    expect(fullName?.maxCount).toBe(1);

    const ownsAccount = person?.properties.find((property) => property.fieldName === "ownsAccount");
    expect(ownsAccount?.classIri).toBe("http://example.com/finance#BankAccount");
    expect(ownsAccount?.minCount).toBe(0);
    expect(ownsAccount?.maxCount).toBeUndefined();

    const customerStatus = person?.properties.find((property) => property.fieldName === "customerStatus");
    expect(customerStatus?.enumValues).toEqual(["ACTIVE", "BLOCKED", "SUSPENDED"]);

    const contactEmail = person?.properties.find((property) => property.fieldName === "contactEmail");
    expect(contactEmail?.patterns).toEqual(["^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"]);
    expect(contactEmail?.minLength).toBe(5);
    expect(contactEmail?.maxLength).toBe(254);

    const isVip = person?.properties.find((property) => property.fieldName === "isVip");
    expect(isVip?.datatypeIri).toBe("http://www.w3.org/2001/XMLSchema#boolean");

    const lastKycReviewAt = person?.properties.find((property) => property.fieldName === "lastKycReviewAt");
    expect(lastKycReviewAt?.datatypeIri).toBe("http://www.w3.org/2001/XMLSchema#dateTime");
  });

  it("captures unsupported rules as warnings instead of crashing", () => {
    const person = model.entitiesByName.get("Person");
    const unsupportedRiskLink = person?.properties.find(
      (property) => property.fieldName === "unsupportedRiskLink",
    );

    expect(unsupportedRiskLink).toBeDefined();
    expect(unsupportedRiskLink?.warnings.some((warning) => warning.includes("propertyChainAxiom"))).toBe(true);
  });
});
