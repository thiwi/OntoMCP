import path from "node:path";

import { OntologyCompiler } from "../compiler/compile.js";
import { OntologyPayloadValidator } from "../compiler/validate.js";
import type { EntitySchemaResult, OntologyValidationResult } from "../compiler/types.js";
import type { OntologyEntity, OntologyModel, OntologyProperty } from "../ontology/types.js";

export class UnknownEntityError extends Error {
  constructor(entityName: string) {
    super(`Unknown entity: ${entityName}`);
    this.name = "UnknownEntityError";
  }
}

export interface ListDomainEntitiesResult {
  [key: string]: unknown;
  entities: string[];
}

export interface OntologyPackSummary {
  [key: string]: unknown;
  pack_id: string;
  ontology_dir: string;
  entity_count: number;
  warning_count: number;
  loaded_at: string;
  active: boolean;
}

export interface ListOntologyPacksResult {
  [key: string]: unknown;
  packs: OntologyPackSummary[];
}

export interface EntityRelationSummary {
  [key: string]: unknown;
  direction: "outgoing" | "incoming";
  related_entity: string;
  related_entity_label?: string;
  via_field: string;
  via_label?: string;
  min_count: number;
  max_count?: number;
  cardinality: string;
}

export interface WarningHotspotSummary {
  [key: string]: unknown;
  scope: "entity" | "property";
  entity_name: string;
  property_name?: string;
  warnings: string[];
}

export interface EntityGraphContextResult {
  [key: string]: unknown;
  entity_name: string;
  entity_label?: string;
  entity_comment?: string;
  relation_count: number;
  warning_hotspot_count: number;
  relations: EntityRelationSummary[];
  warning_hotspots: WarningHotspotSummary[];
}

function cardinalityText(minCount: number, maxCount?: number): string {
  if (maxCount === 1 && minCount >= 1) {
    return "exactly one";
  }
  if (maxCount === 1 && minCount === 0) {
    return "at most one";
  }
  if (maxCount === undefined && minCount >= 1) {
    return "one or more";
  }
  if (maxCount === undefined && minCount === 0) {
    return "multiple";
  }
  if (maxCount === 0) {
    return "zero";
  }
  if (maxCount !== undefined && minCount >= 1) {
    return `between ${minCount} and ${maxCount}`;
  }
  if (maxCount !== undefined) {
    return `up to ${maxCount}`;
  }
  return "unspecified";
}

function countWarnings(model: OntologyModel): number {
  let total = 0;
  for (const entity of model.entities) {
    total += entity.warnings.length;
    for (const property of entity.properties) {
      total += property.warnings.length;
    }
  }
  return total;
}

export class OntoMcpToolRuntime {
  private readonly loadedAt: string;
  private readonly packSummary: OntologyPackSummary;

  constructor(
    private readonly model: OntologyModel,
    private readonly ontologyDirectory: string,
    private readonly compiler: OntologyCompiler,
    private readonly validator: OntologyPayloadValidator,
  ) {
    this.loadedAt = new Date().toISOString();
    const packId = path.basename(this.ontologyDirectory) || "ontology";
    this.packSummary = {
      pack_id: packId,
      ontology_dir: this.ontologyDirectory,
      entity_count: this.model.entities.length,
      warning_count: countWarnings(this.model),
      loaded_at: this.loadedAt,
      active: true,
    };
  }

  listDomainEntities(): ListDomainEntitiesResult {
    return {
      entities: this.compiler.listEntityNames(),
    };
  }

  listOntologyPacks(): ListOntologyPacksResult {
    return {
      packs: [this.packSummary],
    };
  }

  getEntitySchema(entityName: string): EntitySchemaResult {
    this.ensureEntityExists(entityName);
    const bundle = this.compiler.compileEntityBundle(entityName);

    return {
      json_schema: bundle.json_schema,
      zod_code_snippet: bundle.zod_code_snippet,
      semantic_context: bundle.semantic_context,
    };
  }

  validatePayload(
    entityName: string,
    payload: Record<string, unknown>,
  ): OntologyValidationResult {
    this.ensureEntityExists(entityName);
    return this.validator.validate(entityName, payload);
  }

  getEntityGraphContext(
    entityName: string,
    maxRelations = 50,
    maxWarningHotspots = 50,
  ): EntityGraphContextResult {
    this.ensureEntityExists(entityName);

    const safeMaxRelations = Math.max(1, Math.min(200, Math.trunc(maxRelations)));
    const safeMaxWarningHotspots = Math.max(1, Math.min(200, Math.trunc(maxWarningHotspots)));

    const rootEntity = this.model.entitiesByName.get(entityName);
    if (!rootEntity) {
      throw new UnknownEntityError(entityName);
    }

    const relations = this.collectRelations(rootEntity)
      .sort((left, right) => {
        const byDirection = left.direction.localeCompare(right.direction);
        if (byDirection !== 0) {
          return byDirection;
        }
        const byEntity = left.related_entity.localeCompare(right.related_entity);
        if (byEntity !== 0) {
          return byEntity;
        }
        return left.via_field.localeCompare(right.via_field);
      })
      .slice(0, safeMaxRelations);

    const warningHotspots = this.collectWarningHotspots(rootEntity)
      .sort((left, right) => {
        const byScope = left.scope.localeCompare(right.scope);
        if (byScope !== 0) {
          return byScope;
        }
        const byEntity = left.entity_name.localeCompare(right.entity_name);
        if (byEntity !== 0) {
          return byEntity;
        }
        return (left.property_name ?? "").localeCompare(right.property_name ?? "");
      })
      .slice(0, safeMaxWarningHotspots);

    return {
      entity_name: rootEntity.name,
      entity_label: rootEntity.label,
      entity_comment: rootEntity.comment,
      relation_count: relations.length,
      warning_hotspot_count: warningHotspots.length,
      relations,
      warning_hotspots: warningHotspots,
    };
  }

  private collectRelations(rootEntity: OntologyEntity): EntityRelationSummary[] {
    const relations: EntityRelationSummary[] = [];

    for (const property of rootEntity.properties) {
      if (!property.classIri) {
        continue;
      }
      const related = this.model.entitiesByIri.get(property.classIri);
      if (!related) {
        continue;
      }

      relations.push(this.relationFromProperty("outgoing", related, property));
    }

    for (const candidate of this.model.entities) {
      if (candidate.iri === rootEntity.iri) {
        continue;
      }
      for (const property of candidate.properties) {
        if (property.classIri !== rootEntity.iri) {
          continue;
        }
        relations.push(this.relationFromProperty("incoming", candidate, property));
      }
    }

    return relations;
  }

  private relationFromProperty(
    direction: "outgoing" | "incoming",
    relatedEntity: OntologyEntity,
    property: OntologyProperty,
  ): EntityRelationSummary {
    return {
      direction,
      related_entity: relatedEntity.name,
      related_entity_label: relatedEntity.label,
      via_field: property.fieldName,
      via_label: property.label,
      min_count: property.minCount,
      max_count: property.maxCount,
      cardinality: cardinalityText(property.minCount, property.maxCount),
    };
  }

  private collectWarningHotspots(rootEntity: OntologyEntity): WarningHotspotSummary[] {
    const hotspots: WarningHotspotSummary[] = [];

    if (rootEntity.warnings.length > 0) {
      hotspots.push({
        scope: "entity",
        entity_name: rootEntity.name,
        warnings: [...rootEntity.warnings].sort((left, right) => left.localeCompare(right)),
      });
    }

    for (const property of rootEntity.properties) {
      if (property.warnings.length === 0) {
        continue;
      }
      hotspots.push({
        scope: "property",
        entity_name: rootEntity.name,
        property_name: property.fieldName,
        warnings: [...property.warnings].sort((left, right) => left.localeCompare(right)),
      });
    }

    return hotspots;
  }

  private ensureEntityExists(entityName: string): void {
    if (!this.compiler.hasEntity(entityName)) {
      throw new UnknownEntityError(entityName);
    }
  }
}
