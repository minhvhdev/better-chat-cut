import { normalizeProductionRenderRequest } from './production-render-normalization.ts';
import { computeProductionRenderRequestHash, computeProductionRenderRevision } from './production-render-hash.ts';
import type { ProductionRenderRequestV1 } from '../contracts/production-render-request.ts';
import type { ProductionRenderDiagnostic } from '../contracts/production-render-errors.ts';

export type ProductionRenderRequestValidationResult = {
  valid: boolean;
  normalizedRequest?: ProductionRenderRequestV1;
  requestHash?: string;
  productionRenderRevision: string;
  errors: ProductionRenderDiagnostic[];
  warnings: ProductionRenderDiagnostic[];
};

export function validateProductionRenderRequest(input: unknown): ProductionRenderRequestValidationResult {
  const revision = computeProductionRenderRevision();
  const normalized = normalizeProductionRenderRequest(input);
  if (!normalized.ok || !normalized.request) {
    return {
      valid: false,
      productionRenderRevision: revision,
      errors: normalized.errors,
      warnings: normalized.warnings,
    };
  }
  return {
    valid: true,
    normalizedRequest: normalized.request,
    requestHash: computeProductionRenderRequestHash(normalized.request),
    productionRenderRevision: revision,
    errors: [],
    warnings: normalized.warnings,
  };
}
