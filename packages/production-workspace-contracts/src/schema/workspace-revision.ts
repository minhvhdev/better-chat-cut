import { sha256Hex, stableStringify } from './serialization.ts';

/** Timestamp-free revision hash for workspace overview / detail / plans. */
export function computeWorkspaceEntityHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function computeWorkspaceRevisionToken(input: {
  runId: string;
  revision: number;
  workflowFingerprint: string;
}): string {
  return computeWorkspaceEntityHash({
    runId: input.runId,
    revision: input.revision,
    workflowFingerprint: input.workflowFingerprint,
  });
}
