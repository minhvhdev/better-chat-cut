export type BackupErrorCode =
  | 'BACKUP_VALIDATION_FAILED'
  | 'BACKUP_PLAN_INVALID'
  | 'BACKUP_OPERATION_NOT_FOUND'
  | 'BACKUP_AREA_MISSING'
  | 'BACKUP_CONFLICT'
  | 'RESTORE_VALIDATION_FAILED'
  | 'RESTORE_CONFLICT_UNRESOLVED'
  | 'RESTORE_OPERATION_NOT_FOUND'
  | 'RESTORE_FORBIDDEN'
  | 'BACKUP_FORBIDDEN';

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: BackupErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.details = details;
  }
}
