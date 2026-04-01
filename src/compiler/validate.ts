import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

import { OntologyCompiler } from "./compile.js";
import type { OntologyValidationResult } from "./types.js";

export class OntologyPayloadValidator {
  private readonly ajv: Ajv2020;
  private readonly validators = new Map<string, ValidateFunction>();

  constructor(private readonly compiler: OntologyCompiler) {
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: false,
    });
    (addFormats as unknown as (ajv: Ajv2020) => void)(this.ajv);
  }

  validate(entityName: string, payload: unknown): OntologyValidationResult {
    const bundle = this.compiler.compileEntityBundle(entityName);
    const validate = this.getOrCreateValidator(entityName, bundle.json_schema);
    const valid = Boolean(validate(payload));

    return {
      valid,
      errors: this.copyErrors(validate.errors ?? []),
    };
  }

  private getOrCreateValidator(
    entityName: string,
    schema: Record<string, unknown>,
  ): ValidateFunction {
    const existing = this.validators.get(entityName);
    if (existing) {
      return existing;
    }

    const compiled = this.ajv.compile(schema);
    this.validators.set(entityName, compiled);
    return compiled;
  }

  private copyErrors(errors: ErrorObject[]): ErrorObject[] {
    return errors.map((error) => ({
      ...error,
      params: { ...error.params },
    }));
  }
}
