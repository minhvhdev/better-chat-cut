import { deepCloneJson } from '../../../production-render-plans/src/schema/production-render-serialization.ts';
import type { ProductionProjectLike } from '../../../production-render-plans/src/preparation/prepare-production-render.ts';
import {
  computeProductionProjectFingerprint,
  computeProductionTimelineFingerprint,
} from '../../../production-render-plans/src/schema/production-render-hash.ts';
import type { ProductionRenderPlanV1 } from '../../../production-render-plans/src/contracts/production-render-plan.ts';
import { ProductionRenderError } from '../../../production-render-plans/src/contracts/production-render-errors.ts';

export function createImmutableProjectSnapshot(project: ProductionProjectLike): ProductionProjectLike {
  return deepCloneJson(project);
}

export function assertPlanMatchesLiveProject(input: {
  plan: ProductionRenderPlanV1;
  project: ProductionProjectLike;
  projectId: string;
}): void {
  if (input.plan.source.projectId !== input.projectId) {
    throw new ProductionRenderError('PRODUCTION_RENDER_PROJECT_FINGERPRINT_CONFLICT', 'Plan projectId mismatch', {
      recovery: 'Re-prepare against the targeted project',
    });
  }
  const projectFingerprint = computeProductionProjectFingerprint(input.project);
  if (projectFingerprint !== input.plan.source.projectFingerprint) {
    throw new ProductionRenderError('PRODUCTION_RENDER_PROJECT_FINGERPRINT_CONFLICT', 'Project changed after prepare', {
      recovery: 'Call production_render_prepare again on the current project',
    });
  }
  const timeline = input.project.timelines.find((t) => t.id === input.plan.source.timelineId);
  if (!timeline) {
    throw new ProductionRenderError('PRODUCTION_RENDER_TIMELINE_NOT_FOUND', 'Timeline missing at submit', {
      recovery: 'Restore the timeline or re-prepare',
    });
  }
  const timelineFingerprint = computeProductionTimelineFingerprint(timeline);
  if (timelineFingerprint !== input.plan.source.timelineFingerprint) {
    throw new ProductionRenderError('PRODUCTION_RENDER_TIMELINE_FINGERPRINT_CONFLICT', 'Timeline changed after prepare', {
      recovery: 'Call production_render_prepare again on the current timeline',
    });
  }
}
