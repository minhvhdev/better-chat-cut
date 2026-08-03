export type AssetResolverDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  requirementId?: string;
  partId?: string;
  assetId?: string;
  assetVersion?: string;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function diagnostic(
  severity: AssetResolverDiagnostic['severity'],
  code: string,
  message: string,
  extra: Partial<Omit<AssetResolverDiagnostic, 'severity' | 'code' | 'message'>> = {},
): AssetResolverDiagnostic {
  return { severity, code, message, ...extra };
}

export class AssetResolverError extends Error {
  readonly code: string;
  readonly recovery?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options?: { recovery?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AssetResolverError';
    this.code = code;
    this.recovery = options?.recovery;
    this.details = options?.details;
  }
}
