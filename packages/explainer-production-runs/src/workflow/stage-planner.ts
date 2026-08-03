import type { ProductionRunV1 } from '../contracts/production-run.ts';
import type { ProductionNextActionV1 } from '../contracts/production-run-summary.ts';
import { getStageState, stageRequiresReview, isDependencyComplete } from './stage-registry.ts';
import { PRODUCTION_STAGE_IDS } from '../../../explainer-production-contracts/src/index.ts';

export function planNextAction(run: ProductionRunV1): ProductionNextActionV1 {
  if (run.status === 'completed' && run.delivery) {
    return { type: 'completed', bundleId: run.delivery.bundleId };
  }
  if (run.status === 'cancelled') {
    return {
      type: 'resolve-blocker',
      stageId: run.currentStageId,
      blockers: [{
        severity: 'error',
        code: 'PRODUCTION_RUN_CANCELLED',
        message: 'Production run is cancelled',
        runId: run.runId,
        recovery: 'Create a new production run',
      }],
    };
  }

  // Prefer waiting states on current stage
  const current = getStageState(run, run.currentStageId);
  if (current.status === 'awaiting-review' && current.review) {
    return {
      type: 'review',
      stageId: current.stageId,
      reviewId: current.review.reviewId,
    };
  }
  if (current.status === 'awaiting-project-session' && current.externalOperation) {
    return {
      type: 'wait-external-operation',
      stageId: current.stageId,
      operationType: current.externalOperation.type,
      operationId: current.externalOperation.id,
    };
  }
  if (current.status === 'awaiting-external-operation' && current.externalOperation) {
    return {
      type: 'wait-external-operation',
      stageId: current.stageId,
      operationType: current.externalOperation.type,
      operationId: current.externalOperation.id,
    };
  }
  if (current.status === 'awaiting-input') {
    if (current.stageId === 'research') {
      return {
        type: 'put-artifact',
        stageId: 'research',
        artifactType: 'research-brief',
        requirements: ['ResearchBriefV1 with sources and claims'],
      };
    }
    if (current.stageId === 'script') {
      return {
        type: 'put-artifact',
        stageId: 'script',
        artifactType: 'explainer-script',
        requirements: ['ExplainerScriptV1 with claim lineage'],
      };
    }
    if (current.stageId === 'storyboard') {
      return {
        type: 'put-artifact',
        stageId: 'storyboard',
        artifactType: 'storyboard',
        requirements: ['StoryboardV1 with explicit placements'],
      };
    }
    if (current.stageId === 'asset-authoring') {
      return {
        type: 'resolve-blocker',
        stageId: 'asset-authoring',
        blockers: current.errors.length ? current.errors : [{
          severity: 'error',
          code: 'PRODUCTION_RUN_ASSET_AUTHORING_REQUIRED',
          message: 'Author missing motion assets via motion_asset_* tools, then resume',
          runId: run.runId,
          stageId: 'asset-authoring',
          recovery: 'Create/staging assets, then production_run_resume / execute asset-authoring',
        }],
      };
    }
    if (current.stageId === 'narration-plan') {
      return {
        type: 'execute-stage',
        stageId: 'narration-plan',
      };
    }
  }
  if (current.status === 'blocked' || current.status === 'failed') {
    return {
      type: 'resolve-blocker',
      stageId: current.stageId,
      blockers: current.errors.length
        ? current.errors
        : [{ severity: 'error', code: 'PRODUCTION_RUN_STAGE_NOT_READY', message: `Stage ${current.stageId} is ${current.status}`, runId: run.runId }],
    };
  }

  // Find next executable stage
  for (const stageId of PRODUCTION_STAGE_IDS) {
    const stage = getStageState(run, stageId);
    if (stage.status === 'completed' || stage.status === 'skipped') continue;
    if (!isDependencyComplete(run, stageId)) continue;

    if (stage.status === 'awaiting-review' && stage.review) {
      return { type: 'review', stageId, reviewId: stage.review.reviewId };
    }
    if (stage.status === 'awaiting-input') {
      if (stageId === 'research' || stageId === 'script' || stageId === 'storyboard') {
        const artifactType = stageId === 'research'
          ? 'research-brief' as const
          : stageId === 'script'
            ? 'explainer-script' as const
            : 'storyboard' as const;
        return {
          type: 'put-artifact',
          stageId,
          artifactType,
          requirements: [`Provide ${artifactType}`],
        };
      }
    }
    if (
      stage.status === 'awaiting-project-session'
      || stage.status === 'awaiting-external-operation'
    ) {
      if (stage.externalOperation) {
        return {
          type: 'wait-external-operation',
          stageId,
          operationType: stage.externalOperation.type,
          operationId: stage.externalOperation.id,
        };
      }
    }

    if (stage.status === 'ready' || stage.status === 'pending' || stage.status === 'running') {
      if (stageId === 'timeline-assembly' || stageId === 'narration-application') {
        if (!stage.externalOperation) {
          return {
            type: 'open-edit-session',
            stageId,
            approvalMode: run.policy.projectMutationApproval,
          };
        }
      }
      return { type: 'execute-stage', stageId };
    }

    if (stage.status === 'awaiting-review' && stageRequiresReview(run, stageId) && stage.review) {
      return { type: 'review', stageId, reviewId: stage.review.reviewId };
    }
  }

  if (run.delivery) {
    return { type: 'completed', bundleId: run.delivery.bundleId };
  }

  return {
    type: 'resolve-blocker',
    stageId: run.currentStageId,
    blockers: [{
      severity: 'error',
      code: 'PRODUCTION_RUN_STAGE_NOT_READY',
      message: 'No executable stage found',
      runId: run.runId,
      recovery: 'Inspect run with production_run_get and production_run_validate',
    }],
  };
}
