export type WorkspaceErrorCode =
  | 'WORKSPACE_VALIDATION_FAILED'
  | 'WORKSPACE_COMMAND_UNSUPPORTED'
  | 'WORKSPACE_COMMAND_INVALID'
  | 'WORKSPACE_RUN_NOT_FOUND'
  | 'WORKSPACE_CONFLICT'
  | 'WORKSPACE_HEALTH_FAILED'
  | 'WORKSPACE_MIGRATION_FAILED'
  | 'WORKSPACE_MIGRATION_DRIFT'
  | 'WORKSPACE_MIGRATION_UNSUPPORTED'
  | 'WORKSPACE_DIAGNOSTIC_FAILED'
  | 'WORKSPACE_FORBIDDEN'
  | 'WORKSPACE_DEGRADED';

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: WorkspaceErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
    this.details = details;
  }
}
