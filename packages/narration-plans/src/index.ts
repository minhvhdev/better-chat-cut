import { validateNarrationPlan } from './schema/narration-validator.ts';
import { computeNarrationPlanHash } from './schema/narration-hash.ts';
import { computeNarrationRuntimeRevision } from './schema/narration-runtime-revision.ts';
import { normalizeNarrationPlan } from './schema/narration-normalization.ts';

export * from './contracts/index.ts';
export * from './schema/index.ts';
export * from './timing/index.ts';

export function createNarrationPlanService() {
  return {
    validate: validateNarrationPlan,
    normalize: normalizeNarrationPlan,
    hash: computeNarrationPlanHash,
    runtimeRevision: computeNarrationRuntimeRevision,
  };
}
