import { validateProductionRenderRequest } from './schema/production-render-validator.ts';
import {
  computeProductionRenderRequestHash,
  computeProductionRenderPlanHash,
  computeProductionRenderRevision,
  computeProductionProjectFingerprint,
  computeProductionTimelineFingerprint,
  computeBundleId,
} from './schema/production-render-hash.ts';
import { prepareProductionRender } from './preparation/prepare-production-render.ts';

export * from './contracts/index.ts';
export * from './schema/index.ts';
export * from './preparation/index.ts';

export function createProductionRenderPlanService() {
  return {
    validateRequest: validateProductionRenderRequest,
    requestHash: computeProductionRenderRequestHash,
    planHash: computeProductionRenderPlanHash,
    revision: computeProductionRenderRevision,
    projectFingerprint: computeProductionProjectFingerprint,
    timelineFingerprint: computeProductionTimelineFingerprint,
    bundleId: computeBundleId,
    prepare: prepareProductionRender,
  };
}
