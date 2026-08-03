import type { PublishingDiagnostic } from './publishing-diagnostic.ts';
import type { PublishingStageId } from './publishing-stage-id.ts';
import type { PublishingArtifactType } from './publishing-artifact-type.ts';

export type { PublishingDiagnostic };

export function publishingDiagnostic(
  severity: PublishingDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<PublishingDiagnostic, 'severity' | 'code' | 'message'> = {},
): PublishingDiagnostic {
  return { severity, code, message, ...extra };
}

export class PublishingContractError extends Error {
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
      stageId?: PublishingStageId;
      artifactType?: PublishingArtifactType;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'PublishingContractError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      publishingDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
        stageId: options.stageId,
        artifactType: options.artifactType,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export const PUBLISHING_CONTRACT_ERROR_CODES = [
  'PUBLISHING_SCHEMA_UNSUPPORTED',
  'PUBLISHING_REQUEST_INVALID',
  'PUBLISHING_REQUEST_TOO_LARGE',
  'PUBLISHING_INVALID_ID',
  'PUBLISHING_METADATA_INVALID',
  'PUBLISHING_METADATA_PLATFORM_LIMIT_EXCEEDED',
  'PUBLISHING_CHAPTERS_INVALID',
  'PUBLISHING_COMPLIANCE_INCOMPLETE',
  'PUBLISHING_SOURCE_ATTRIBUTION_INVALID',
  'PUBLISHING_THUMBNAIL_PLAN_INVALID',
  'PUBLISHING_PACKAGE_INVALID',
  'PUBLISHING_PACKAGE_HASH_INVALID',
  'PUBLISHING_UNKNOWN_FIELD',
  'PUBLISHING_NON_SERIALIZABLE',
] as const;

export type PublishingContractErrorCode = (typeof PUBLISHING_CONTRACT_ERROR_CODES)[number];
