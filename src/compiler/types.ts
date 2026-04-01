import type { ErrorObject } from "ajv";

export interface EntitySchemaResult {
  [key: string]: unknown;
  json_schema: Record<string, unknown>;
  zod_code_snippet: string;
  semantic_context: string;
}

export interface CompiledEntityBundle extends EntitySchemaResult {
  entity_name: string;
  warnings: string[];
}

export interface OntologyValidationResult {
  [key: string]: unknown;
  valid: boolean;
  errors: ErrorObject[];
}
