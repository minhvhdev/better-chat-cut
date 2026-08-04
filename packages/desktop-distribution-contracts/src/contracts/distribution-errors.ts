export type DistributionErrorCode =
  | 'DISTRIBUTION_VALIDATION_FAILED'
  | 'DISTRIBUTION_PLAN_INVALID'
  | 'DISTRIBUTION_PLAN_HASH_MISMATCH'
  | 'DISTRIBUTION_TARGET_UNSUPPORTED'
  | 'DISTRIBUTION_SOURCE_DIRTY'
  | 'DISTRIBUTION_SOURCE_MISMATCH'
  | 'DISTRIBUTION_BUILD_FAILED'
  | 'DISTRIBUTION_SIGNING_FAILED'
  | 'DISTRIBUTION_ARTIFACT_MISSING'
  | 'DISTRIBUTION_OPERATION_NOT_FOUND'
  | 'DISTRIBUTION_FORBIDDEN'
  | 'DISTRIBUTION_CANCELLED';

export class DistributionError extends Error {
  readonly code: DistributionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DistributionErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DistributionError';
    this.code = code;
    this.details = details;
  }
}
