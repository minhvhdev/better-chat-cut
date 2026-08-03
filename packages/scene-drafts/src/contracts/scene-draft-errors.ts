export type SceneDraftDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  draftId?: string;
  operationId?: string;
  nodeId?: string;
  requirementId?: string;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export class SceneDraftError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;
  readonly diagnostics: SceneDraftDiagnostic[];

  constructor(
    code: string,
    message: string,
    options?: {
      details?: Record<string, unknown>;
      recovery?: string;
      diagnostics?: SceneDraftDiagnostic[];
      cause?: unknown;
      draftId?: string;
      operationId?: string;
      nodeId?: string;
      requirementId?: string;
      path?: string;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SceneDraftError';
    this.code = code;
    this.details = options?.details;
    this.recovery = options?.recovery;
    this.diagnostics = options?.diagnostics ?? [
      {
        severity: 'error',
        code,
        message,
        details: options?.details,
        recovery: options?.recovery,
        draftId: options?.draftId,
        operationId: options?.operationId,
        nodeId: options?.nodeId,
        requirementId: options?.requirementId,
        path: options?.path,
      },
    ];
  }
}

export function draftDiagnostic(
  severity: SceneDraftDiagnostic['severity'],
  code: string,
  message: string,
  extra?: Omit<SceneDraftDiagnostic, 'severity' | 'code' | 'message'>,
): SceneDraftDiagnostic {
  return { severity, code, message, ...extra };
}
