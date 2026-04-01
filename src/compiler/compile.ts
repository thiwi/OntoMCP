import {
  XSD_BOOLEAN,
  XSD_DATE_TIME,
  XSD_DECIMAL,
  XSD_INTEGER,
  XSD_STRING,
} from "../ontology/vocab.js";
import type {
  OntologyEntity,
  OntologyModel,
  OntologyPrimitive,
  OntologyProperty,
} from "../ontology/types.js";
import type { CompiledEntityBundle } from "./types.js";

interface CompiledProperty {
  jsonSchema: Record<string, unknown>;
  zodExpression: string;
  required: boolean;
  warnings: string[];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function escapeSingleLineComment(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function cardinalityText(minCount: number, maxCount?: number): string {
  if (maxCount === 1 && minCount >= 1) {
    return "MUST have exactly one";
  }

  if (maxCount === 1 && minCount === 0) {
    return "MAY have at most one";
  }

  if (maxCount === undefined && minCount >= 1) {
    return "MUST have one or more";
  }

  if (maxCount === undefined && minCount === 0) {
    return "MAY have multiple";
  }

  if (maxCount === 0) {
    return "MUST have zero";
  }

  if (maxCount !== undefined && minCount >= 1) {
    return `MUST have between ${minCount} and ${maxCount}`;
  }

  if (maxCount !== undefined) {
    return `MAY have up to ${maxCount}`;
  }

  return "has unspecified cardinality";
}

function hasPath(
  graph: Map<string, Set<string>>,
  start: string,
  target: string,
  visited: Set<string>,
): boolean {
  if (start === target) {
    return true;
  }

  if (visited.has(start)) {
    return false;
  }

  visited.add(start);

  const neighbors = graph.get(start);
  if (!neighbors) {
    return false;
  }

  for (const neighbor of neighbors) {
    if (hasPath(graph, neighbor, target, visited)) {
      return true;
    }
  }

  return false;
}

function detectCyclicEdges(graph: Map<string, Set<string>>): Set<string> {
  const cyclicEdges = new Set<string>();

  for (const [from, targets] of graph.entries()) {
    for (const to of targets) {
      if (hasPath(graph, to, from, new Set<string>())) {
        cyclicEdges.add(`${from}->${to}`);
      }
    }
  }

  return cyclicEdges;
}

function requiresFallbackToAny(property: OntologyProperty): boolean {
  return property.warnings.some((warning) => warning.toLowerCase().includes("z.any"));
}

function toZodLiteral(value: OntologyPrimitive): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0";
  }

  return value ? "true" : "false";
}

function toRegexLiteral(pattern: string): string {
  return `new RegExp(${JSON.stringify(pattern)})`;
}

function enumToZodExpression(values: OntologyPrimitive[]): string {
  if (values.length === 1) {
    return `z.literal(${toZodLiteral(values[0]!)})`;
  }

  const literals = values.map((value) => `z.literal(${toZodLiteral(value)})`);
  return `z.union([${literals.join(", ")}])`;
}

export class OntologyCompiler {
  private readonly bundleCache = new Map<string, CompiledEntityBundle>();

  constructor(private readonly model: OntologyModel) {}

  listEntityNames(): string[] {
    return [...this.model.entityNames];
  }

  hasEntity(entityName: string): boolean {
    return this.model.entitiesByName.has(entityName);
  }

  compileEntityBundle(entityName: string): CompiledEntityBundle {
    const cached = this.bundleCache.get(entityName);
    if (cached) {
      return cached;
    }

    const rootEntity = this.model.entitiesByName.get(entityName);
    if (!rootEntity) {
      throw new Error(`Unknown entity: ${entityName}`);
    }

    const bundledEntities = this.collectEntityClosure(rootEntity);
    const byName = new Map(bundledEntities.map((entity) => [entity.name, entity]));
    const dependencyGraph = this.buildDependencyGraph(bundledEntities);
    const cyclicEdges = detectCyclicEdges(dependencyGraph);

    const defs: Record<string, Record<string, unknown>> = {};
    const zodBlocks: string[] = [];
    const allWarnings: string[] = [];

    for (const entity of bundledEntities) {
      const propertySchemas: Record<string, unknown> = {};
      const requiredFields: string[] = [];
      const zodPropertyLines: string[] = [];

      for (const property of entity.properties) {
        const compiled = this.compileProperty(
          entity,
          property,
          byName,
          cyclicEdges,
        );

        propertySchemas[property.fieldName] = compiled.jsonSchema;
        if (compiled.required) {
          requiredFields.push(property.fieldName);
        }

        const commentLines = this.propertyCommentLines(property, compiled.warnings);
        for (const line of commentLines) {
          zodPropertyLines.push(`    // ${line}`);
        }

        zodPropertyLines.push(`    ${property.fieldName}: ${compiled.zodExpression},`);

        allWarnings.push(...compiled.warnings);
      }

      const entityJsonSchema: Record<string, unknown> = {
        type: "object",
        additionalProperties: false,
        properties: propertySchemas,
      };

      if (requiredFields.length > 0) {
        entityJsonSchema.required = requiredFields.sort((left, right) => left.localeCompare(right));
      }

      if (entity.label) {
        entityJsonSchema.title = entity.label;
      }

      if (entity.comment) {
        entityJsonSchema.description = entity.comment;
      }

      defs[entity.name] = entityJsonSchema;

      const entityCommentLines: string[] = [];
      if (entity.label) {
        entityCommentLines.push(`${entity.name}: ${escapeSingleLineComment(entity.label)}`);
      }
      if (entity.comment) {
        entityCommentLines.push(escapeSingleLineComment(entity.comment));
      }
      for (const warning of entity.warnings) {
        entityCommentLines.push(`WARNING: ${escapeSingleLineComment(warning)}`);
      }

      if (entityCommentLines.length > 0) {
        for (const line of entityCommentLines) {
          zodBlocks.push(`// ${line}`);
        }
      }

      zodBlocks.push(`export const ${entity.name}Schema: z.ZodTypeAny = z.lazy(() =>`);
      zodBlocks.push(`  z.object({`);
      if (zodPropertyLines.length > 0) {
        zodBlocks.push(...zodPropertyLines);
      }
      zodBlocks.push(`  }).strict(),`);
      zodBlocks.push(`);`);
      zodBlocks.push("");
    }

    const jsonSchema: Record<string, unknown> = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `urn:ontomcp:schema:${rootEntity.name}`,
      $ref: `#/$defs/${rootEntity.name}`,
      $defs: defs,
    };

    const semanticContext = this.buildSemanticContext(rootEntity, byName, uniqueSorted(allWarnings));

    const zodCodeSnippet = [
      'import { z } from "zod";',
      "",
      ...zodBlocks,
      `export const RootSchema = ${rootEntity.name}Schema;`,
    ].join("\n");

    const bundle: CompiledEntityBundle = {
      entity_name: rootEntity.name,
      json_schema: jsonSchema,
      zod_code_snippet: zodCodeSnippet,
      semantic_context: semanticContext,
      warnings: uniqueSorted(allWarnings),
    };

    this.bundleCache.set(entityName, bundle);
    return bundle;
  }

  private collectEntityClosure(rootEntity: OntologyEntity): OntologyEntity[] {
    const visited = new Set<string>();

    const walk = (entity: OntologyEntity): void => {
      if (visited.has(entity.name)) {
        return;
      }

      visited.add(entity.name);

      const dependencyNames = entity.properties
        .map((property) => property.classIri)
        .filter((iri): iri is string => Boolean(iri))
        .map((iri) => this.model.entitiesByIri.get(iri))
        .filter((dependency): dependency is OntologyEntity => Boolean(dependency))
        .map((dependency) => dependency.name)
        .sort((left, right) => left.localeCompare(right));

      for (const dependencyName of dependencyNames) {
        const dependency = this.model.entitiesByName.get(dependencyName);
        if (dependency) {
          walk(dependency);
        }
      }
    };

    walk(rootEntity);

    const sortedNames = Array.from(visited).sort((left, right) => left.localeCompare(right));
    const orderedNames = [rootEntity.name, ...sortedNames.filter((name) => name !== rootEntity.name)];

    return orderedNames
      .map((name) => this.model.entitiesByName.get(name))
      .filter((entity): entity is OntologyEntity => Boolean(entity));
  }

  private buildDependencyGraph(entities: OntologyEntity[]): Map<string, Set<string>> {
    const entityNames = new Set(entities.map((entity) => entity.name));
    const graph = new Map<string, Set<string>>();

    for (const entity of entities) {
      const dependencies = entity.properties
        .map((property) => property.classIri)
        .filter((iri): iri is string => Boolean(iri))
        .map((iri) => this.model.entitiesByIri.get(iri))
        .filter((dependency): dependency is OntologyEntity => Boolean(dependency))
        .map((dependency) => dependency.name)
        .filter((dependencyName) => entityNames.has(dependencyName));

      graph.set(entity.name, new Set(dependencies));
    }

    return graph;
  }

  private compileProperty(
    sourceEntity: OntologyEntity,
    property: OntologyProperty,
    entitiesByName: Map<string, OntologyEntity>,
    cyclicEdges: Set<string>,
  ): CompiledProperty {
    const warnings = [...property.warnings];

    let baseJsonSchema: Record<string, unknown> = {};
    let baseZodExpression = "z.any()";
    let baseKind: "string" | "number" | "integer" | "boolean" | "object" | "any" = "any";

    let shouldFallback = requiresFallbackToAny(property);

    if (!shouldFallback && property.datatypeIri) {
      if (property.datatypeIri === XSD_STRING) {
        baseJsonSchema = { type: "string" };
        baseZodExpression = "z.string()";
        baseKind = "string";
      } else if (property.datatypeIri === XSD_INTEGER) {
        baseJsonSchema = { type: "integer" };
        baseZodExpression = "z.number().int()";
        baseKind = "integer";
      } else if (property.datatypeIri === XSD_BOOLEAN) {
        baseJsonSchema = { type: "boolean" };
        baseZodExpression = "z.boolean()";
        baseKind = "boolean";
      } else if (property.datatypeIri === XSD_DECIMAL) {
        baseJsonSchema = { type: "number" };
        baseZodExpression = "z.number()";
        baseKind = "number";
      } else if (property.datatypeIri === XSD_DATE_TIME) {
        baseJsonSchema = { type: "string", format: "date-time" };
        baseZodExpression = "z.string().datetime()";
        baseKind = "string";
      } else {
        warnings.push(
          `Unsupported datatype ${property.datatypeIri} on ${property.iri}; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      }
    } else if (!shouldFallback && property.classIri) {
      const targetEntity = this.model.entitiesByIri.get(property.classIri);
      if (targetEntity && entitiesByName.has(targetEntity.name)) {
        baseJsonSchema = { $ref: `#/$defs/${targetEntity.name}` };
        baseKind = "object";

        const edgeKey = `${sourceEntity.name}->${targetEntity.name}`;
        if (cyclicEdges.has(edgeKey)) {
          baseZodExpression = `z.lazy(() => ${targetEntity.name}Schema)`;
        } else {
          baseZodExpression = `z.lazy(() => ${targetEntity.name}Schema)`;
        }
      } else {
        warnings.push(
          `Unknown class reference ${property.classIri} on ${property.iri}; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      }
    } else if (!shouldFallback && (!property.enumValues || property.enumValues.length === 0)) {
      warnings.push(
        `Property ${property.iri} has no sh:datatype or sh:class; falling back to z.any() and unrestricted JSON Schema.`,
      );
      shouldFallback = true;
    }

    if (shouldFallback) {
      baseJsonSchema = {};
      baseZodExpression = "z.any()";
      baseKind = "any";
    }

    if (!shouldFallback && property.enumValues && property.enumValues.length > 0) {
      if (baseKind === "object") {
        warnings.push(
          `Property ${property.iri} combines sh:in with sh:class; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      } else {
        baseJsonSchema = {
          ...baseJsonSchema,
          enum: property.enumValues,
        };
        baseZodExpression = enumToZodExpression(property.enumValues);
      }
    }

    if (!shouldFallback && property.patterns.length > 0) {
      if (baseKind !== "string") {
        warnings.push(
          `Property ${property.iri} uses sh:pattern on non-string datatype; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      } else {
        if (property.patterns.length === 1) {
          baseJsonSchema = {
            ...baseJsonSchema,
            pattern: property.patterns[0],
          };
        } else {
          baseJsonSchema = {
            allOf: [
              baseJsonSchema,
              ...property.patterns.map((pattern) => ({ pattern })),
            ],
          };
        }
        for (const pattern of property.patterns) {
          baseZodExpression += `.regex(${toRegexLiteral(pattern)})`;
        }
      }
    }

    if (
      !shouldFallback &&
      (property.minLength !== undefined || property.maxLength !== undefined)
    ) {
      if (baseKind !== "string") {
        warnings.push(
          `Property ${property.iri} uses sh:minLength/sh:maxLength on non-string datatype; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      } else if (
        property.minLength !== undefined &&
        property.maxLength !== undefined &&
        property.minLength > property.maxLength
      ) {
        warnings.push(
          `Property ${property.iri} has invalid sh:minLength/sh:maxLength values; falling back to z.any() and unrestricted JSON Schema.`,
        );
        shouldFallback = true;
      } else {
        if (property.minLength !== undefined) {
          baseJsonSchema = {
            ...baseJsonSchema,
            minLength: property.minLength,
          };
          baseZodExpression += `.min(${property.minLength})`;
        }
        if (property.maxLength !== undefined) {
          baseJsonSchema = {
            ...baseJsonSchema,
            maxLength: property.maxLength,
          };
          baseZodExpression += `.max(${property.maxLength})`;
        }
      }
    }

    if (shouldFallback) {
      baseJsonSchema = {};
      baseZodExpression = "z.any()";
    }

    const isArray = property.maxCount !== 1;
    let jsonSchema = baseJsonSchema;
    let zodExpression = baseZodExpression;

    if (isArray) {
      jsonSchema = {
        type: "array",
        items: baseJsonSchema,
      };

      if (property.minCount > 0) {
        jsonSchema.minItems = property.minCount;
      }

      if (property.maxCount !== undefined) {
        jsonSchema.maxItems = property.maxCount;
      }

      zodExpression = `z.array(${baseZodExpression})`;
      if (property.minCount > 0) {
        zodExpression += `.min(${property.minCount})`;
      }
      if (property.maxCount !== undefined) {
        zodExpression += `.max(${property.maxCount})`;
      }
    }

    const required = property.minCount >= 1;

    if (!required) {
      zodExpression += ".optional()";
    }

    return {
      jsonSchema,
      zodExpression,
      required,
      warnings: uniqueSorted(warnings),
    };
  }

  private propertyCommentLines(property: OntologyProperty, warnings: string[]): string[] {
    const lines: string[] = [];

    if (property.label) {
      lines.push(escapeSingleLineComment(property.label));
    }

    if (property.comment) {
      lines.push(escapeSingleLineComment(property.comment));
    }

    for (const warning of warnings) {
      lines.push(`WARNING: ${escapeSingleLineComment(warning)}`);
    }

    return lines;
  }

  private buildSemanticContext(
    rootEntity: OntologyEntity,
    entitiesByName: Map<string, OntologyEntity>,
    warnings: string[],
  ): string {
    const lines: string[] = [];

    const rootTitle = rootEntity.label ?? rootEntity.name;
    lines.push(`Entity: ${rootTitle} (${rootEntity.name})`);

    if (rootEntity.comment) {
      lines.push(`Definition: ${rootEntity.comment}`);
    }

    const relationStatements: string[] = [];
    for (const property of rootEntity.properties) {
      if (!property.classIri) {
        continue;
      }

      const target = this.model.entitiesByIri.get(property.classIri);
      if (!target || !entitiesByName.has(target.name)) {
        continue;
      }

      const sourceDisplay = rootEntity.label ?? rootEntity.name;
      const targetDisplay = target.label ?? target.name;
      const propertyDisplay = property.label ?? property.fieldName;

      relationStatements.push(
        `A '${sourceDisplay}' ${cardinalityText(property.minCount, property.maxCount)} '${targetDisplay}' via '${propertyDisplay}'.`,
      );
    }

    relationStatements.sort((left, right) => left.localeCompare(right));
    lines.push(...relationStatements);

    if (warnings.length > 0) {
      lines.push(`Warnings: ${warnings.join(" | ")}`);
    }

    return lines.join("\n");
  }
}
