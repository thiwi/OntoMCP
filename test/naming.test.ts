import { describe, expect, it } from "vitest";

import {
  resolveEntityNames,
  splitNamespaceAndLocalName,
  toCamelCase,
  toPascalCase,
} from "../src/ontology/naming.js";

describe("naming helpers", () => {
  it("normalizes identifiers to PascalCase and CamelCase", () => {
    expect(toPascalCase("")).toBe("Entity");
    expect(toPascalCase("123 account name")).toBe("N123AccountName");
    expect(toPascalCase("risk-class")).toBe("RiskClass");
    expect(toCamelCase("Risk Class")).toBe("riskClass");
  });

  it("splits namespace/local name for hash, slash, colon and fallback IRIs", () => {
    expect(splitNamespaceAndLocalName("http://example.com/finance#Account")).toEqual({
      namespaceIri: "http://example.com/finance#",
      localName: "Account",
    });

    expect(splitNamespaceAndLocalName("http://example.com/finance/Account")).toEqual({
      namespaceIri: "http://example.com/finance/",
      localName: "Account",
    });

    expect(splitNamespaceAndLocalName("urn:finance:Account")).toEqual({
      namespaceIri: "urn:finance:",
      localName: "Account",
    });

    expect(splitNamespaceAndLocalName("NoDelimiter")).toEqual({
      namespaceIri: "NoDelimiter",
      localName: "NoDelimiter",
    });
  });

  it("resolves namespace-collisions with deterministic prefixes", () => {
    const classIris = [
      "http://example.com/finance#Account",
      "http://example.com/it#Account",
    ];
    const prefixes = new Map<string, string>([
      ["http://example.com/finance#", "finance"],
      ["http://example.com/it#", "it"],
    ]);

    const resolved = resolveEntityNames(classIris, prefixes);

    expect(resolved.get("http://example.com/finance#Account")).toBe("FinanceAccount");
    expect(resolved.get("http://example.com/it#Account")).toBe("ITAccount");
  });

  it("falls back deterministically when prefix candidates are exhausted", () => {
    const classIris = [
      "urn:dup:Account",
      "urn:dup:account",
      "urn:dup:ACCOUNT",
      "urn:dup:account_",
      "urn:dup:account--",
    ];

    const resolved = resolveEntityNames(classIris, new Map());
    const names = classIris.map((iri) => resolved.get(iri)).filter((name): name is string => Boolean(name));

    expect(names.length).toBe(5);
    expect(names.some((name) => name.includes("UrnDupAccount"))).toBe(true);
  });
});
