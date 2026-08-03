import { sha256Hex, stableStringify } from '../../../publishing-contracts/src/index.ts';
import type { PublishingRunV1 } from '../contracts/publishing-run.ts';

export function computePublishingWorkflowFingerprint(run: PublishingRunV1): string {
  const stages = run.stages.map((s) => ({
    stageId: s.stageId,
    status: s.status,
    attempt: s.attempt,
    inputArtifacts: s.inputArtifacts,
    outputArtifacts: s.outputArtifacts,
    externalOperation: s.externalOperation
      ? { type: s.externalOperation.type, id: s.externalOperation.id, status: s.externalOperation.status }
      : undefined,
    review: s.review
      ? { reviewId: s.review.reviewId, status: s.review.status }
      : undefined,
    errors: s.errors.map((e) => ({ code: e.code, message: e.message })),
    warnings: s.warnings.map((w) => ({ code: w.code, message: w.message })),
  }));
  return sha256Hex(stableStringify({
    runId: run.runId,
    requestId: run.requestId,
    requestHash: run.requestHash,
    revision: run.revision,
    status: run.status,
    currentStageId: run.currentStageId,
    source: run.source,
    target: run.target,
    artifacts: run.artifacts,
    stages,
    upload: run.upload
      ? {
        operationId: run.upload.operationId,
        remoteVideoId: run.upload.remoteVideoId,
        remoteFingerprint: run.upload.remoteFingerprint,
      }
      : undefined,
    release: run.release,
  }));
}
