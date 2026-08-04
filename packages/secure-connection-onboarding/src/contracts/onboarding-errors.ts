export type OnboardingErrorCode =
  | 'ONBOARDING_VALIDATION_FAILED'
  | 'ONBOARDING_SESSION_NOT_FOUND'
  | 'ONBOARDING_SESSION_EXPIRED'
  | 'ONBOARDING_STATE_MISMATCH'
  | 'ONBOARDING_STATE_REPLAY'
  | 'ONBOARDING_PROVIDER_UNSUPPORTED'
  | 'ONBOARDING_SCOPE_FORBIDDEN'
  | 'ONBOARDING_TOKEN_EXCHANGE_FAILED'
  | 'ONBOARDING_VAULT_UNAVAILABLE'
  | 'ONBOARDING_CONNECTION_NOT_FOUND'
  | 'ONBOARDING_FORBIDDEN';

export class OnboardingError extends Error {
  readonly code: OnboardingErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: OnboardingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
    this.details = details;
  }
}

export type OnboardingDiagnostic = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
};
