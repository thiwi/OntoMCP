import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DataFactory, Parser, Store, type Literal, type Quad, type Term } from "n3";

import {
  OWL_CLASS,
  OWL_PROPERTY_CHAIN_AXIOM,
  RDF_FIRST,
  RDF_NIL,
  RDF_REST,
  RDF_TYPE,
  RDFS_CLASS,
  RDFS_COMMENT,
  RDFS_LABEL,
  SH_CLASS,
  SH_DATATYPE,
  SH_IN,
  SH_MAX_LENGTH,
  SH_MAX_COUNT,
  SH_MIN_LENGTH,
  SH_MIN_COUNT,
  SH_NODE_SHAPE,
  SH_PATH,
  SH_PATTERN,
  SH_PROPERTY,
  SH_TARGET_CLASS,
  XSD_BOOLEAN,
  XSD_DECIMAL,
  XSD_INTEGER,
} from "./vocab.js";
import { resolveEntityNames, splitNamespaceAndLocalName, toCamelCase } from "./naming.js";
import type { OntologyEntity, OntologyModel, OntologyPrimitive, OntologyProperty } from "./types.js";

const { namedNode } = DataFactory;

function parsePrefixDeclarations(turtleContent: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /@prefix\s+([A-Za-z][\w-]*)?:\s*<([^>]+)>\s*\./g;

  for (const match of turtleContent.matchAll(regex)) {
    const prefix = (match[1] ?? "").trim();
    const namespace = match[2]?.trim();
    if (!namespace) {
      continue;
    }

    if (prefix) {
      map.set(namespace, prefix);
    }
  }

  return map;
}

async function findTurtleFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findTurtleFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".ttl")) {
      files.push(fullPath);
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  return files;
}

function extractLiteralValue(
  store: Store,
  subjectIri: string,
  predicateIri: string,
): string | undefined {
  const subject = namedNode(subjectIri);
  const predicate = namedNode(predicateIri);
  const literals = store
    .getQuads(subject, predicate, null, null)
    .map((quad) => quad.object)
    .filter((term): term is Literal => term.termType === "Literal")
    .map((term) => term.value)
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return literals[0];
}

function extractIntegerValue(
  store: Store,
  subjectTerm: Term,
  predicateIri: string,
): number | undefined {
  const predicate = namedNode(predicateIri);
  const literal = store
    .getQuads(subjectTerm, predicate, null, null)
    .map((quad) => quad.object)
    .find((term): term is Literal => term.termType === "Literal");

  if (!literal) {
    return undefined;
  }

  const parsed = Number.parseInt(literal.value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getNamedObject(store: Store, subjectTerm: Term, predicateIri: string): string | undefined {
  const predicate = namedNode(predicateIri);
  const term = store
    .getQuads(subjectTerm, predicate, null, null)
    .map((quad) => quad.object)
    .find((objectTerm) => objectTerm.termType === "NamedNode");

  return term?.value;
}

function mergeMaxCount(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }

  if (right === undefined) {
    return left;
  }

  return Math.min(left, right);
}

function parseLiteralToPrimitive(literal: Literal): OntologyPrimitive | undefined {
  if (literal.datatype.value === XSD_BOOLEAN) {
    if (literal.value === "true" || literal.value === "1") {
      return true;
    }
    if (literal.value === "false" || literal.value === "0") {
      return false;
    }
    return undefined;
  }

  if (literal.datatype.value === XSD_INTEGER || literal.datatype.value === XSD_DECIMAL) {
    const parsed = Number(literal.value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return literal.value;
}

function compareOntologyPrimitive(left: OntologyPrimitive, right: OntologyPrimitive): number {
  const leftType = typeof left;
  const rightType = typeof right;

  if (leftType !== rightType) {
    return leftType.localeCompare(rightType);
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right));
}

function dedupeAndSortPrimitives(values: OntologyPrimitive[]): OntologyPrimitive[] {
  const byKey = new Map<string, OntologyPrimitive>();
  for (const value of values) {
    byKey.set(`${typeof value}:${String(value)}`, value);
  }
  return Array.from(byKey.values()).sort(compareOntologyPrimitive);
}

function extractPatterns(store: Store, subjectTerm: Term): string[] {
  return store
    .getQuads(subjectTerm, namedNode(SH_PATTERN), null, null)
    .map((quad) => quad.object)
    .filter((term): term is Literal => term.termType === "Literal")
    .map((term) => term.value)
    .filter((value) => value.length > 0)
    .sort((left, right) => left.localeCompare(right));
}

function extractEnumValues(
  store: Store,
  subjectTerm: Term,
): { values?: OntologyPrimitive[]; warnings: string[] } {
  const warnings: string[] = [];
  const inNode = store
    .getQuads(subjectTerm, namedNode(SH_IN), null, null)
    .map((quad) => quad.object)
    .at(0);

  if (!inNode) {
    return { values: undefined, warnings };
  }

  const values: OntologyPrimitive[] = [];
  const visitedNodes = new Set<string>();
  let cursor: Term | undefined = inNode;

  while (cursor && !(cursor.termType === "NamedNode" && cursor.value === RDF_NIL)) {
    const cursorKey = `${cursor.termType}:${cursor.value}`;
    if (visitedNodes.has(cursorKey)) {
      warnings.push("Detected cycle in sh:in RDF list; falling back to z.any().");
      return { values: undefined, warnings };
    }
    visitedNodes.add(cursorKey);

    const first = store
      .getQuads(cursor, namedNode(RDF_FIRST), null, null)
      .map((quad) => quad.object)
      .at(0);

    if (!first) {
      warnings.push("Malformed sh:in RDF list (missing rdf:first); falling back to z.any().");
      return { values: undefined, warnings };
    }

    if (first.termType !== "Literal") {
      warnings.push("Unsupported non-literal value in sh:in; falling back to z.any().");
      return { values: undefined, warnings };
    }

    const parsed = parseLiteralToPrimitive(first);
    if (parsed === undefined) {
      warnings.push(`Unsupported literal in sh:in (${first.value}); falling back to z.any().`);
      return { values: undefined, warnings };
    }
    values.push(parsed);

    const rest = store
      .getQuads(cursor, namedNode(RDF_REST), null, null)
      .map((quad) => quad.object)
      .at(0);

    if (!rest) {
      warnings.push("Malformed sh:in RDF list (missing rdf:rest); falling back to z.any().");
      return { values: undefined, warnings };
    }

    cursor = rest;
  }

  return { values: dedupeAndSortPrimitives(values), warnings };
}

function mergeEnumValues(
  existing: OntologyPrimitive[] | undefined,
  incoming: OntologyPrimitive[] | undefined,
  propertyIri: string,
  warnings: Set<string>,
): OntologyPrimitive[] | undefined {
  if (!existing) {
    return incoming;
  }

  if (!incoming) {
    return existing;
  }

  const incomingKeys = new Set(incoming.map((value) => `${typeof value}:${String(value)}`));
  const intersection = existing.filter((value) => incomingKeys.has(`${typeof value}:${String(value)}`));

  if (intersection.length === 0) {
    warnings.add(`Conflicting sh:in constraints for property ${propertyIri}; falling back to z.any().`);
    return undefined;
  }

  return dedupeAndSortPrimitives(intersection);
}

function mergePropertyConstraints(existing: OntologyProperty, incoming: OntologyProperty): OntologyProperty {
  const warnings = new Set<string>([...existing.warnings, ...incoming.warnings]);

  let datatypeIri = existing.datatypeIri ?? incoming.datatypeIri;
  let classIri = existing.classIri ?? incoming.classIri;
  let enumValues = mergeEnumValues(existing.enumValues, incoming.enumValues, existing.iri, warnings);

  if (existing.datatypeIri && incoming.datatypeIri && existing.datatypeIri !== incoming.datatypeIri) {
    datatypeIri = undefined;
    classIri = undefined;
    warnings.add(
      `Conflicting sh:datatype constraints for property ${existing.iri}; falling back to z.any().`,
    );
  }

  if (existing.classIri && incoming.classIri && existing.classIri !== incoming.classIri) {
    datatypeIri = undefined;
    classIri = undefined;
    warnings.add(`Conflicting sh:class constraints for property ${existing.iri}; falling back to z.any().`);
  }

  if ((existing.datatypeIri || incoming.datatypeIri) && (existing.classIri || incoming.classIri)) {
    datatypeIri = undefined;
    classIri = undefined;
    enumValues = undefined;
    warnings.add(
      `Property ${existing.iri} declares both sh:datatype and sh:class; falling back to z.any().`,
    );
  }

  const minLengthCandidates = [existing.minLength, incoming.minLength].filter(
    (value): value is number => value !== undefined,
  );
  const maxLengthCandidates = [existing.maxLength, incoming.maxLength].filter(
    (value): value is number => value !== undefined,
  );

  const minLength =
    minLengthCandidates.length > 0 ? Math.max(...minLengthCandidates) : undefined;
  const maxLength =
    maxLengthCandidates.length > 0 ? Math.min(...maxLengthCandidates) : undefined;

  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    warnings.add(
      `Conflicting sh:minLength/sh:maxLength for property ${existing.iri}; falling back to z.any().`,
    );
    enumValues = undefined;
  }

  return {
    ...existing,
    label: existing.label ?? incoming.label,
    comment: existing.comment ?? incoming.comment,
    enumValues,
    patterns: Array.from(new Set([...existing.patterns, ...incoming.patterns])).sort((left, right) =>
      left.localeCompare(right),
    ),
    minLength,
    maxLength,
    minCount: Math.max(existing.minCount, incoming.minCount),
    maxCount: mergeMaxCount(existing.maxCount, incoming.maxCount),
    datatypeIri,
    classIri,
    warnings: Array.from(warnings).sort((left, right) => left.localeCompare(right)),
  };
}

function collectClassIris(store: Store): string[] {
  const iris = new Set<string>();

  for (const quad of store.getQuads(null, namedNode(RDF_TYPE), namedNode(OWL_CLASS), null)) {
    if (quad.subject.termType === "NamedNode") {
      iris.add(quad.subject.value);
    }
  }

  for (const quad of store.getQuads(null, namedNode(RDF_TYPE), namedNode(RDFS_CLASS), null)) {
    if (quad.subject.termType === "NamedNode") {
      iris.add(quad.subject.value);
    }
  }

  for (const quad of store.getQuads(null, namedNode(SH_TARGET_CLASS), null, null)) {
    if (quad.object.termType === "NamedNode") {
      iris.add(quad.object.value);
    }
  }

  return Array.from(iris).sort((left, right) => left.localeCompare(right));
}

function collectShapeTargets(store: Store): Map<string, string[]> {
  const shapeTargets = new Map<string, string[]>();

  const shapeIris = store
    .getQuads(null, namedNode(RDF_TYPE), namedNode(SH_NODE_SHAPE), null)
    .map((quad) => quad.subject)
    .filter((term): term is ReturnType<typeof namedNode> => term.termType === "NamedNode")
    .map((term) => term.value)
    .sort((left, right) => left.localeCompare(right));

  for (const shapeIri of shapeIris) {
    const targets = store
      .getQuads(namedNode(shapeIri), namedNode(SH_TARGET_CLASS), null, null)
      .map((quad) => quad.object)
      .filter((term): term is ReturnType<typeof namedNode> => term.termType === "NamedNode")
      .map((term) => term.value)
      .sort((left, right) => left.localeCompare(right));

    for (const classIri of targets) {
      const entries = shapeTargets.get(classIri) ?? [];
      entries.push(shapeIri);
      shapeTargets.set(classIri, entries);
    }
  }

  for (const [classIri, shapeIrisForClass] of shapeTargets.entries()) {
    const deduped = Array.from(new Set(shapeIrisForClass)).sort((left, right) => left.localeCompare(right));
    shapeTargets.set(classIri, deduped);
  }

  return shapeTargets;
}

function hasUnsupportedPropertyChain(store: Store, iri: string): boolean {
  return store.getQuads(namedNode(iri), namedNode(OWL_PROPERTY_CHAIN_AXIOM), null, null).length > 0;
}

function buildPropertyFromShapeNode(
  store: Store,
  propertyNode: Term,
  classIri: string,
): OntologyProperty {
  const warnings: string[] = [];

  const pathTerm = store
    .getQuads(propertyNode, namedNode(SH_PATH), null, null)
    .map((quad) => quad.object)[0];

  let propertyIri: string;
  if (pathTerm?.termType === "NamedNode") {
    propertyIri = pathTerm.value;
  } else {
    propertyIri = `${classIri}#unknownProperty`;
    warnings.push(
      `Unsupported sh:path for property node ${propertyNode.value}; falling back to z.any() for this field.`,
    );
  }

  const datatypeIri = getNamedObject(store, propertyNode, SH_DATATYPE);
  const classRefIri = getNamedObject(store, propertyNode, SH_CLASS);
  const { values: enumValues, warnings: enumWarnings } = extractEnumValues(store, propertyNode);
  warnings.push(...enumWarnings);

  if (datatypeIri && classRefIri) {
    warnings.push(`Property ${propertyIri} defines sh:datatype and sh:class; falling back to z.any().`);
  }

  const minCount = extractIntegerValue(store, propertyNode, SH_MIN_COUNT) ?? 0;
  const maxCount = extractIntegerValue(store, propertyNode, SH_MAX_COUNT);
  const patterns = extractPatterns(store, propertyNode);
  const minLength = extractIntegerValue(store, propertyNode, SH_MIN_LENGTH);
  const maxLength = extractIntegerValue(store, propertyNode, SH_MAX_LENGTH);

  if (maxCount !== undefined && maxCount < minCount) {
    warnings.push(
      `Invalid cardinality for property ${propertyIri}: sh:maxCount (${maxCount}) < sh:minCount (${minCount}).`,
    );
  }

  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    warnings.push(
      `Invalid string length for property ${propertyIri}: sh:minLength (${minLength}) > sh:maxLength (${maxLength}); falling back to z.any().`,
    );
  }

  if (hasUnsupportedPropertyChain(store, propertyIri)) {
    warnings.push(
      `Unsupported owl:propertyChainAxiom on ${propertyIri}; field is downgraded to z.any() / unrestricted JSON Schema.`,
    );
  }

  const pathLocal = splitNamespaceAndLocalName(propertyIri).localName;

  const label =
    extractLiteralValue(store, propertyIri, RDFS_LABEL) ??
    (propertyNode.termType === "NamedNode" ? extractLiteralValue(store, propertyNode.value, RDFS_LABEL) : undefined);

  const comment =
    extractLiteralValue(store, propertyIri, RDFS_COMMENT) ??
    (propertyNode.termType === "NamedNode"
      ? extractLiteralValue(store, propertyNode.value, RDFS_COMMENT)
      : undefined);

  const fieldName = toCamelCase(label ?? pathLocal);

  return {
    iri: propertyIri,
    fieldName,
    label,
    comment,
    datatypeIri,
    classIri: classRefIri,
    enumValues,
    patterns,
    minLength,
    maxLength,
    minCount,
    maxCount,
    warnings: Array.from(new Set(warnings)).sort((left, right) => left.localeCompare(right)),
  };
}

function disambiguateFieldNames(properties: OntologyProperty[]): OntologyProperty[] {
  const grouped = new Map<string, OntologyProperty[]>();

  for (const property of properties) {
    const group = grouped.get(property.fieldName) ?? [];
    group.push(property);
    grouped.set(property.fieldName, group);
  }

  const resolved: OntologyProperty[] = [];

  for (const [fieldName, group] of grouped.entries()) {
    if (group.length === 1) {
      const onlyProperty = group[0];
      if (onlyProperty) {
        resolved.push(onlyProperty);
      }
      continue;
    }

    const sortedGroup = group.slice().sort((left, right) => left.iri.localeCompare(right.iri));
    for (const property of sortedGroup) {
      const namespaceToken = splitNamespaceAndLocalName(property.iri).namespaceIri;
      const fallbackName = toCamelCase(`${namespaceToken} ${fieldName}`);
      resolved.push({ ...property, fieldName: fallbackName });
    }
  }

  return resolved.sort((left, right) => {
    const byField = left.fieldName.localeCompare(right.fieldName);
    if (byField !== 0) {
      return byField;
    }
    return left.iri.localeCompare(right.iri);
  });
}

function collectPropertiesForClass(
  store: Store,
  classIri: string,
  shapeIris: string[],
): OntologyProperty[] {
  const byPropertyIri = new Map<string, OntologyProperty>();

  for (const shapeIri of shapeIris) {
    const propertyNodes = store
      .getQuads(namedNode(shapeIri), namedNode(SH_PROPERTY), null, null)
      .map((quad) => quad.object)
      .sort((left, right) => left.value.localeCompare(right.value));

    for (const propertyNode of propertyNodes) {
      const incoming = buildPropertyFromShapeNode(store, propertyNode, classIri);
      const existing = byPropertyIri.get(incoming.iri);

      if (!existing) {
        byPropertyIri.set(incoming.iri, incoming);
      } else {
        byPropertyIri.set(incoming.iri, mergePropertyConstraints(existing, incoming));
      }
    }
  }

  return disambiguateFieldNames(Array.from(byPropertyIri.values()));
}

export async function loadOntologyModel(ontologyDir: string): Promise<OntologyModel> {
  const absoluteOntologyDir = path.resolve(ontologyDir);
  const turtleFiles = await findTurtleFiles(absoluteOntologyDir);

  if (!turtleFiles.length) {
    throw new Error(`No .ttl files found in ontology directory: ${absoluteOntologyDir}`);
  }

  const store = new Store();
  const prefixesByNamespace = new Map<string, string>();

  for (const filePath of turtleFiles) {
    const content = await fs.readFile(filePath, "utf8");
    const parser = new Parser({ baseIRI: pathToFileURL(filePath).href });
    const quads: Quad[] = parser.parse(content);
    store.addQuads(quads);

    const discoveredPrefixes = parsePrefixDeclarations(content);
    for (const [namespace, prefix] of discoveredPrefixes.entries()) {
      if (!prefixesByNamespace.has(namespace)) {
        prefixesByNamespace.set(namespace, prefix);
      }
    }
  }

  const classIris = collectClassIris(store);
  const shapeTargets = collectShapeTargets(store);
  const entityNamesByIri = resolveEntityNames(classIris, prefixesByNamespace);

  const entities: OntologyEntity[] = classIris.map((classIri) => {
    const { namespaceIri, localName } = splitNamespaceAndLocalName(classIri);
    const name = entityNamesByIri.get(classIri);

    if (!name) {
      throw new Error(`Failed to resolve entity name for class IRI: ${classIri}`);
    }

    const shapeIris = (shapeTargets.get(classIri) ?? []).slice().sort((left, right) =>
      left.localeCompare(right),
    );

    const properties = collectPropertiesForClass(store, classIri, shapeIris);

    const warnings: string[] = [];
    if (hasUnsupportedPropertyChain(store, classIri)) {
      warnings.push(
        `Unsupported owl:propertyChainAxiom on class ${classIri}; affected generated fields may degrade to z.any().`,
      );
    }

    return {
      iri: classIri,
      namespaceIri,
      localName,
      name,
      label: extractLiteralValue(store, classIri, RDFS_LABEL),
      comment: extractLiteralValue(store, classIri, RDFS_COMMENT),
      shapeIris,
      properties,
      warnings,
    };
  });

  entities.sort((left, right) => left.name.localeCompare(right.name));

  const entitiesByName = new Map<string, OntologyEntity>();
  const entitiesByIri = new Map<string, OntologyEntity>();

  for (const entity of entities) {
    entitiesByName.set(entity.name, entity);
    entitiesByIri.set(entity.iri, entity);
  }

  const entityNames = entities.map((entity) => entity.name);

  return {
    ontologyDir: absoluteOntologyDir,
    store,
    prefixesByNamespace,
    entities,
    entitiesByName,
    entitiesByIri,
    entityNames,
  };
}
