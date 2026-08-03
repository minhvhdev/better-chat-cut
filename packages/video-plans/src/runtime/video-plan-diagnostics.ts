import type { VideoPlanDiagnostic } from '../contracts/video-plan-errors.ts';

export function summarizeVideoPlanDiagnostics(diagnostics: VideoPlanDiagnostic[]): {
  errorCount: number;
  warningCount: number;
  codes: string[];
} {
  return {
    errorCount: diagnostics.filter((d) => d.severity === 'error').length,
    warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
    codes: [...new Set(diagnostics.map((d) => d.code))],
  };
}
