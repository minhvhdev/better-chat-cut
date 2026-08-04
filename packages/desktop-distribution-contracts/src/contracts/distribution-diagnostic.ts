export type DistributionDiagnosticSeverity = 'info' | 'warning' | 'error';

export type DistributionDiagnostic = {
  severity: DistributionDiagnosticSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function distributionDiagnostic(
  severity: DistributionDiagnosticSeverity,
  code: string,
  message: string,
  opts?: { details?: Record<string, unknown>; recovery?: string },
): DistributionDiagnostic {
  return {
    severity,
    code,
    message,
    details: opts?.details,
    recovery: opts?.recovery,
  };
}
