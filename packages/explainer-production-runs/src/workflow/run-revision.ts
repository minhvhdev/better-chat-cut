import {
  sha256Hex,
  stableStringify,
} from '../../../explainer-production-contracts/src/index.ts';
import type { ProductionStageId, ProductionArtifactType } from '../../../explainer-production-contracts/src/index.ts';

export function computeRunId(requestId: string, requestHash: string): string {
  const tail = requestId.includes('.') ? requestId.slice(requestId.indexOf('.') + 1) : requestId;
  return `production-run.${tail}.${requestHash.slice(0, 8)}`;
}

export function computeReviewId(input: {
  runId: string;
  stageId: ProductionStageId;
  artifactReferences: { artifactType: ProductionArtifactType; artifactHash: string }[];
}): string {
  const payload = {
    runId: input.runId,
    stageId: input.stageId,
    artifacts: input.artifactReferences,
  };
  return `review.${sha256Hex(stableStringify(payload)).slice(0, 16)}`;
}

export function computeEventId(input: {
  runId: string;
  eventType: string;
  nextRevision: number;
  stageId?: string;
  detailKey?: string;
}): string {
  return `evt.${sha256Hex(stableStringify(input)).slice(0, 16)}`;
}
