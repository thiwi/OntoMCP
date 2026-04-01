import type { Store } from "n3";

export type OntologyPrimitive = string | number | boolean;

export interface OntologyProperty {
  iri: string;
  fieldName: string;
  label?: string;
  comment?: string;
  datatypeIri?: string;
  classIri?: string;
  enumValues?: OntologyPrimitive[];
  patterns: string[];
  minLength?: number;
  maxLength?: number;
  minCount: number;
  maxCount?: number;
  warnings: string[];
}

export interface OntologyEntity {
  iri: string;
  namespaceIri: string;
  localName: string;
  name: string;
  label?: string;
  comment?: string;
  shapeIris: string[];
  properties: OntologyProperty[];
  warnings: string[];
}

export interface OntologyModel {
  ontologyDir: string;
  store: Store;
  prefixesByNamespace: Map<string, string>;
  entities: OntologyEntity[];
  entitiesByName: Map<string, OntologyEntity>;
  entitiesByIri: Map<string, OntologyEntity>;
  entityNames: string[];
}
