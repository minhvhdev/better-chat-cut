export type QualificationErrorCode =
  | 'QUALIFICATION_VALIDATION_FAILED'
  | 'QUALIFICATION_PLAN_INVALID'
  | 'QUALIFICATION_REQUIRED_FAILED'
  | 'QUALIFICATION_TARGET_SKIPPED'
  | 'QUALIFICATION_FORBIDDEN';

export class QualificationError extends Error {
  readonly code: QualificationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: QualificationErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'QualificationError';
    this.code = code;
    this.details = details;
  }
}
