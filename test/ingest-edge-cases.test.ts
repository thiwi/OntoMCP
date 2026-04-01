import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadOntologyModel } from "../src/ontology/ingest.js";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ontomcp-ingest-"));
  tempDirs.push(dir);
  return dir;
}

describe("ontology ingestion edge-cases", () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails deterministically when ontology directory has no ttl files", async () => {
    const dir = await createTempDir();
    await expect(loadOntologyModel(dir)).rejects.toThrow("No .ttl files found in ontology directory");
  });

  it("captures malformed SHACL constraints as warnings without crashing", async () => {
    const dir = await createTempDir();
    const nested = path.join(dir, "nested");
    await mkdir(nested, { recursive: true });

    const ttl = `@prefix : <http://example.com/default#> .
@prefix ex: <http://example.com/ex#> .
@prefix ex2: <http://example.com/ex2#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

ex:Edge a owl:Class ;
  rdfs:label "Edge" ;
  owl:propertyChainAxiom ( ex:a ex:b ) .

ex:Other a owl:Class .
ex:Another a owl:Class .
ex:Third a owl:Class .
ex:chainProp a owl:ObjectProperty ;
  owl:propertyChainAxiom ( ex:x ex:y ) .

ex:sameA a owl:DatatypeProperty ;
  rdfs:label "same field" .
ex2:sameB a owl:DatatypeProperty ;
  rdfs:label "same field" .

ex:EdgeShapeA a sh:NodeShape ;
  sh:targetClass ex:Edge ;
  sh:property [
    sh:path ex:status ;
    sh:datatype xsd:string ;
    sh:in ( "A" "B" ) ;
    sh:minCount 1 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:status ;
    sh:datatype xsd:string ;
    sh:in ( "C" ) ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:conflictType ;
    sh:datatype xsd:string ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:conflictType ;
    sh:datatype xsd:integer ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:conflictClass ;
    sh:class ex:Other ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:conflictClass ;
    sh:class ex:Another ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:typeAndClass ;
    sh:datatype xsd:string ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:typeAndClass ;
    sh:class ex:Other ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:lengthOops ;
    sh:datatype xsd:string ;
    sh:minLength 10 ;
    sh:maxLength 3 ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path [ ex:bogus "x" ] ;
    sh:datatype xsd:string ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:badBoth ;
    sh:datatype xsd:string ;
    sh:class ex:Other ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:badCard ;
    sh:datatype xsd:string ;
    sh:minCount 2 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:enumNonLiteral ;
    sh:datatype xsd:string ;
    sh:in ( ex:Other ) ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:enumBoolInvalid ;
    sh:datatype xsd:boolean ;
    sh:in ( "maybe"^^xsd:boolean ) ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:enumMissingFirst ;
    sh:datatype xsd:string ;
    sh:in ex:listMissingFirst ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:enumMissingRest ;
    sh:datatype xsd:string ;
    sh:in ex:listMissingRest ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:enumCycle ;
    sh:datatype xsd:string ;
    sh:in ex:listCycle ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:chainProp ;
    sh:class ex:Third ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex:sameA ;
    sh:datatype xsd:string ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] ;
  sh:property [
    sh:path ex2:sameB ;
    sh:datatype xsd:string ;
    sh:minCount 0 ;
    sh:maxCount 1
  ] .

ex:listMissingFirst rdf:rest rdf:nil .
ex:listMissingRest rdf:first "X" .
ex:listCycle rdf:first "Y" ;
  rdf:rest ex:listCycle .
`;

    const nestedTtl = `@prefix ex: <http://example.com/ex#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
ex:NestedOnly a owl:Class .
`;

    await writeFile(path.join(dir, "edge.ttl"), ttl, "utf8");
    await writeFile(path.join(nested, "nested.ttl"), nestedTtl, "utf8");

    const model = await loadOntologyModel(dir);
    const edge = model.entitiesByName.get("Edge");

    expect(model.entityNames).toContain("NestedOnly");
    expect(edge).toBeDefined();
    expect(edge?.warnings.some((warning) => warning.includes("propertyChainAxiom"))).toBe(true);

    const conflictType = edge?.properties.find((property) => property.iri === "http://example.com/ex#conflictType");
    expect(conflictType?.warnings.some((warning) => warning.includes("Conflicting sh:datatype"))).toBe(true);

    const conflictClass = edge?.properties.find((property) => property.iri === "http://example.com/ex#conflictClass");
    expect(conflictClass?.warnings.some((warning) => warning.includes("Conflicting sh:class"))).toBe(true);

    const typeAndClass = edge?.properties.find((property) => property.iri === "http://example.com/ex#typeAndClass");
    expect(typeAndClass?.warnings.some((warning) => warning.includes("declares both sh:datatype and sh:class"))).toBe(
      true,
    );

    const status = edge?.properties.find((property) => property.iri === "http://example.com/ex#status");
    expect(status?.warnings.some((warning) => warning.includes("Conflicting sh:in"))).toBe(true);

    const badCard = edge?.properties.find((property) => property.iri === "http://example.com/ex#badCard");
    expect(badCard?.warnings.some((warning) => warning.includes("Invalid cardinality"))).toBe(true);

    const badBoth = edge?.properties.find((property) => property.iri === "http://example.com/ex#badBoth");
    expect(badBoth?.warnings.some((warning) => warning.includes("defines sh:datatype and sh:class"))).toBe(true);

    const enumNonLiteral = edge?.properties.find((property) => property.iri === "http://example.com/ex#enumNonLiteral");
    expect(enumNonLiteral?.warnings.some((warning) => warning.includes("Unsupported non-literal value"))).toBe(true);

    const enumBoolInvalid = edge?.properties.find((property) => property.iri === "http://example.com/ex#enumBoolInvalid");
    expect(enumBoolInvalid?.warnings.some((warning) => warning.includes("Unsupported literal in sh:in"))).toBe(true);

    const enumMissingFirst = edge?.properties.find((property) => property.iri === "http://example.com/ex#enumMissingFirst");
    expect(enumMissingFirst?.warnings.some((warning) => warning.includes("missing rdf:first"))).toBe(true);

    const enumMissingRest = edge?.properties.find((property) => property.iri === "http://example.com/ex#enumMissingRest");
    expect(enumMissingRest?.warnings.some((warning) => warning.includes("missing rdf:rest"))).toBe(true);

    const enumCycle = edge?.properties.find((property) => property.iri === "http://example.com/ex#enumCycle");
    expect(enumCycle?.warnings.some((warning) => warning.includes("Detected cycle in sh:in RDF list"))).toBe(true);

    const chainProp = edge?.properties.find((property) => property.iri === "http://example.com/ex#chainProp");
    expect(chainProp?.warnings.some((warning) => warning.includes("propertyChainAxiom"))).toBe(true);

    const unknownPath = edge?.properties.find((property) => property.iri.endsWith("#unknownProperty"));
    expect(unknownPath).toBeDefined();
    expect(unknownPath?.warnings.some((warning) => warning.includes("Unsupported sh:path"))).toBe(true);

    const sameFieldProperties = edge?.properties.filter((property) => property.label === "same field");
    expect(sameFieldProperties).toHaveLength(2);
    expect(new Set(sameFieldProperties.map((property) => property.fieldName)).size).toBe(2);
  });
});

