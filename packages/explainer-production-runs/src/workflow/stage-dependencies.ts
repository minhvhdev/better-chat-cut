import type { ProductionStageId, ProductionArtifactType } from '../../../explainer-production-contracts/src/index.ts';
import { PRODUCTION_STAGE_IDS } from '../../../explainer-production-contracts/src/index.ts';

/** Linear dependency chain; optional stages handled by skip rules. */
export const STAGE_DEPENDENCIES: Record<ProductionStageId, ProductionStageId[]> = {
  intake: [],
  research: ['intake'],
  script: ['research'],
  storyboard: ['script'],
  'asset-requirements': ['storyboard'],
  'asset-resolution': ['asset-requirements'],
  'asset-authoring': ['asset-resolution'],
  'scene-composition': ['asset-resolution'],
  'scene-review': ['scene-composition'],
  'video-plan': ['scene-review'],
  'timeline-assembly': ['video-plan'],
  'narration-plan': ['timeline-assembly'],
  'narration-timing': ['narration-plan'],
  'narration-application': ['narration-timing'],
  'timeline-review': ['narration-application'],
  'production-preflight': ['timeline-review'],
  'production-render': ['production-preflight'],
  'delivery-validation': ['production-render'],
  'delivery-review': ['delivery-validation'],
  completion: ['delivery-review'],
};

/** When asset-authoring is skipped, scene-composition depends on asset-resolution only (already). */
export function stagesDependingOn(stageId: ProductionStageId): ProductionStageId[] {
  return PRODUCTION_STAGE_IDS.filter((id) => STAGE_DEPENDENCIES[id].includes(stageId));
}

export function invalidateFromStage(stageId: ProductionStageId): ProductionStageId[] {
  const result: ProductionStageId[] = [];
  const queue = [...stagesDependingOn(stageId)];
  const seen = new Set<ProductionStageId>();
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    queue.push(...stagesDependingOn(next));
  }
  return result;
}

export const ARTIFACT_DOWNSTREAM: Partial<Record<ProductionArtifactType, ProductionArtifactType[]>> = {
  'research-brief': ['explainer-script', 'storyboard', 'asset-requirement-set', 'asset-plan', 'asset-authoring-tasks', 'scene-draft-set', 'scene-review-report', 'video-plan', 'video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  'explainer-script': ['storyboard', 'asset-requirement-set', 'asset-plan', 'asset-authoring-tasks', 'scene-draft-set', 'scene-review-report', 'video-plan', 'video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  storyboard: ['asset-requirement-set', 'asset-plan', 'asset-authoring-tasks', 'scene-draft-set', 'scene-review-report', 'video-plan', 'video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  'asset-plan': ['scene-draft-set', 'scene-review-report', 'video-plan', 'video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  'scene-draft-set': ['scene-review-report', 'video-plan', 'video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  'video-plan': ['video-assembly-report', 'narration-plan', 'narration-timing', 'narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
  'narration-timing': ['narration-application-report', 'production-render-plan', 'production-render-operation', 'delivery-bundle-manifest', 'delivery-validation-report'],
};
