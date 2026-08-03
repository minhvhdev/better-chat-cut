import type { ProductionDiagnostic } from './production-diagnostic.ts';
import type { ProductionStageId } from './production-stage-id.ts';
import type { ProductionArtifactType } from './production-artifact-type.ts';

export type { ProductionDiagnostic };

export function productionDiagnostic(
  severity: ProductionDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<ProductionDiagnostic, 'severity' | 'code' | 'message'> = {},
): ProductionDiagnostic {
  return { severity, code, message, ...extra };
}

export class ProductionContractError extends Error {
  readonly code: string;
  readonly diagnostics: ProductionDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: ProductionDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
      stageId?: ProductionStageId;
      artifactType?: ProductionArtifactType;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ProductionContractError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      productionDiagnostic('error', code, message, {
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

export const PRODUCTION_CONTRACT_ERROR_CODES = [
  'PRODUCTION_CONTRACT_SCHEMA_UNSUPPORTED',
  'PRODUCTION_REQUEST_INVALID',
  'PRODUCTION_REQUEST_TOO_LARGE',
  'PRODUCTION_RESEARCH_INVALID',
  'PRODUCTION_SOURCE_REFERENCE_MISSING',
  'PRODUCTION_CLAIM_SOURCE_MISSING',
  'PRODUCTION_CLAIM_REJECTED',
  'PRODUCTION_SCRIPT_INVALID',
  'PRODUCTION_SCRIPT_CLAIM_INVALID',
  'PRODUCTION_STORYBOARD_INVALID',
  'PRODUCTION_STORYBOARD_LAYOUT_INCOMPLETE',
  'PRODUCTION_UNKNOWN_FIELD',
  'PRODUCTION_NON_SERIALIZABLE',
] as const;

export type ProductionContractErrorCode = (typeof PRODUCTION_CONTRACT_ERROR_CODES)[number];
