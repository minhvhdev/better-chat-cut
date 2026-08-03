import type { NarrationPlanValidationResultV1 } from '../contracts/narration-timing.ts';
import { normalizeNarrationPlan } from './narration-normalization.ts';
import { computeNarrationPlanHash } from './narration-hash.ts';
import { computeNarrationRuntimeRevision } from './narration-runtime-revision.ts';

export function validateNarrationPlan(input: unknown): NarrationPlanValidationResultV1 {
  const revision = computeNarrationRuntimeRevision();
  const normalized = normalizeNarrationPlan(input);
  if (!normalized.ok || !normalized.plan) {
    return {
      valid: false,
      narrationRuntimeRevision: revision,
      errors: normalized.errors,
      warnings: normalized.warnings,
    };
  }
  const narrationPlanHash = computeNarrationPlanHash(normalized.plan);
  return {
    valid: normalized.errors.length === 0,
    normalizedPlan: normalized.plan,
    narrationPlanHash: normalized.errors.length === 0 ? narrationPlanHash : undefined,
    narrationRuntimeRevision: revision,
    errors: normalized.errors,
    warnings: normalized.warnings,
  };
}
