export type WorkspaceDiagnosticSeverity = 'error' | 'warning' | 'info';

export type WorkspaceDiagnostic = {
  severity: WorkspaceDiagnosticSeverity;
  code: string;
  message: string;
  runType?: 'production' | 'publishing';
  runId?: string;
  stageId?: string;
  artifactType?: string;
  artifactHash?: string;
  operationId?: string;
  reviewId?: string;
  /** Logical schema path — never a filesystem path. */
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function workspaceDiagnostic(
  severity: WorkspaceDiagnosticSeverity,
  code: string,
  message: string,
  extra: Partial<WorkspaceDiagnostic> = {},
): WorkspaceDiagnostic {
  return {
    severity,
    code,
    message,
    ...extra,
  };
}
