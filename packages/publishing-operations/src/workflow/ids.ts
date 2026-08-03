import { sha256Hex, shortHash, stableStringify } from '../../../publishing-contracts/src/index.ts';

export function computePublishingRunId(requestId: string, requestHash: string): string {
  const tail = requestId.replace(/^publish\./, '');
  return `publishing-run.${tail}.${shortHash(requestHash, 8)}`;
}

export function computeReviewId(input: {
  publishingRunId: string;
  stageId: string;
  artifactHashes: string[];
  remoteFingerprint?: string;
}): string {
  return `review.${shortHash(sha256Hex(stableStringify(input)), 12)}`;
}

export function computeEventId(input: {
  publishingRunId: string;
  type: string;
  details?: unknown;
  sequenceHint: number;
}): string {
  return `event.${shortHash(sha256Hex(stableStringify(input)), 12)}`;
}

export function computeOperationId(input: {
  publishingRunId: string;
  packageHash: string;
  kind: 'upload' | 'release';
}): string {
  return `op.${input.kind}.${shortHash(sha256Hex(stableStringify(input)), 12)}`;
}
