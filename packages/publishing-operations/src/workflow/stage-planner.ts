import type { PublishingNextActionV1, PublishingRunV1 } from '../contracts/publishing-run.ts';
import { getStageState, stageRequiresReview } from './publishing-stage-registry.ts';

export function planNextAction(run: PublishingRunV1): PublishingNextActionV1 {
  if (run.status === 'cancelled') {
    return {
      type: 'resolve-blocker',
      stageId: run.currentStageId,
      blockers: [{ severity: 'error', code: 'PUBLISHING_RUN_CANCELLED', message: 'Run cancelled' }],
    };
  }
  if (run.status === 'completed' && run.release?.releaseManifestHash) {
    return { type: 'completed', releaseManifestHash: run.release.releaseManifestHash };
  }
  if (run.status === 'reconciliation-required' && run.upload?.operationId) {
    return {
      type: 'reconcile',
      stageId: 'upload',
      operationId: run.upload.operationId,
      recovery: [
        'Inspect adapter channel upload history',
        'Provide remoteVideoId via execute_stage reconciliation input',
        'Verify package hash and video fingerprint before adopt',
      ],
    };
  }

  for (const stage of run.stages) {
    if (stage.status === 'reconciliation-required' && stage.externalOperation) {
      return {
        type: 'reconcile',
        stageId: stage.stageId,
        operationId: stage.externalOperation.id,
        recovery: ['Do not start a new upload', 'Reconcile remote video id'],
      };
    }
    if (stage.status === 'awaiting-external-operation' && stage.externalOperation) {
      return {
        type: 'wait-external-operation',
        stageId: stage.stageId,
        operationId: stage.externalOperation.id,
        operationType: stage.externalOperation.type,
      };
    }
    if (stage.status === 'awaiting-review' && stage.review) {
      return { type: 'review', stageId: stage.stageId, reviewId: stage.review.reviewId };
    }
    if (stage.status === 'awaiting-input') {
      if (stage.stageId === 'metadata') {
        return {
          type: 'put-artifact',
          stageId: 'metadata',
          artifactType: 'publishing-metadata',
          requirements: ['publishing-metadata', 'publishing-compliance'],
        };
      }
      if (stage.stageId === 'thumbnail') {
        return {
          type: 'put-artifact',
          stageId: 'thumbnail',
          artifactType: 'thumbnail-plan',
          requirements: ['thumbnail-plan'],
        };
      }
    }
    if (stage.status === 'blocked' || stage.status === 'failed') {
      return {
        type: 'resolve-blocker',
        stageId: stage.stageId,
        blockers: stage.errors.length
          ? stage.errors
          : [{ severity: 'error', code: 'PUBLISHING_RUN_STAGE_NOT_READY', message: `Stage ${stage.stageId} blocked` }],
      };
    }
    if (stage.status === 'ready' || stage.status === 'running') {
      return { type: 'execute-stage', stageId: stage.stageId };
    }
  }

  // fallback: first incomplete
  const incomplete = run.stages.find((s) => s.status !== 'completed' && s.status !== 'skipped');
  if (incomplete) {
    return { type: 'execute-stage', stageId: incomplete.stageId };
  }
  if (run.release?.releaseManifestHash) {
    return { type: 'completed', releaseManifestHash: run.release.releaseManifestHash };
  }
  void stageRequiresReview;
  void getStageState;
  return {
    type: 'resolve-blocker',
    stageId: run.currentStageId,
    blockers: [{ severity: 'error', code: 'PUBLISHING_RUN_STAGE_NOT_READY', message: 'No planned next action' }],
  };
}
