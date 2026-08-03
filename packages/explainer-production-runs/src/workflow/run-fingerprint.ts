import {
  sha256Hex,
  stableStringify,
} from '../../../explainer-production-contracts/src/index.ts';
import type { ProductionRunV1 } from '../contracts/production-run.ts';

/** Semantic fingerprint — excludes timestamps. */
export function computeProductionWorkflowFingerprint(run: ProductionRunV1): string {
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
  const payload = {
    runId: run.runId,
    requestId: run.requestId,
    requestHash: run.requestHash,
    revision: run.revision,
    status: run.status,
    currentStageId: run.currentStageId,
    project: run.project,
    policy: run.policy,
    artifacts: run.artifacts,
    stages,
    delivery: run.delivery,
  };
  return sha256Hex(stableStringify(payload));
}
