import { publishingDiagnostic, type PublishingDiagnostic } from '../../../publishing-contracts/src/index.ts';

export class PublishingOperationError extends Error {
  readonly code: string;
  readonly diagnostics: PublishingDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: PublishingDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PublishingOperationError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      publishingDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}
