import {
  productionDiagnostic,
  type ProductionDiagnostic,
  type ProductionStageId,
  type ProductionArtifactType,
} from '../../../explainer-production-contracts/src/index.ts';

export class ProductionRunError extends Error {
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
      runId?: string;
      stageId?: ProductionStageId;
      artifactType?: ProductionArtifactType;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ProductionRunError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      productionDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
        runId: options.runId,
        stageId: options.stageId,
        artifactType: options.artifactType,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export { productionDiagnostic };

export const PRODUCTION_RUN_ERROR_CODES = [
  'PRODUCTION_RUN_NOT_FOUND',
  'PRODUCTION_RUN_ALREADY_EXISTS',
  'PRODUCTION_RUN_INVALID_ID',
  'PRODUCTION_RUN_REVISION_CONFLICT',
  'PRODUCTION_RUN_FINGERPRINT_CONFLICT',
  'PRODUCTION_RUN_REQUEST_ID_REUSE_CONFLICT',
  'PRODUCTION_RUN_LOCK_TIMEOUT',
  'PRODUCTION_RUN_ATOMIC_WRITE_FAILED',
  'PRODUCTION_RUN_ARTIFACT_MISSING',
  'PRODUCTION_RUN_ARTIFACT_HASH_INVALID',
  'PRODUCTION_RUN_STAGE_DEPENDENCY_INCOMPLETE',
  'PRODUCTION_RUN_STAGE_NOT_READY',
  'PRODUCTION_RUN_STAGE_RETRY_LIMIT',
  'PRODUCTION_RUN_CANCELLED',
  'PRODUCTION_RUN_PROJECT_NOT_TARGETED',
  'PRODUCTION_RUN_PROJECT_MISMATCH',
  'PRODUCTION_RUN_EDIT_SESSION_REQUIRED',
  'PRODUCTION_RUN_EDIT_SESSION_REJECTED',
  'PRODUCTION_RUN_EDIT_SESSION_DISCARDED',
  'PRODUCTION_RUN_EDIT_SESSION_STALE',
  'PRODUCTION_RUN_ASSET_REQUIREMENTS_INVALID',
  'PRODUCTION_RUN_ASSET_PLAN_INCOMPLETE',
  'PRODUCTION_RUN_ASSET_DUPLICATE_REVIEW_REQUIRED',
  'PRODUCTION_RUN_ASSET_AUTHORING_REQUIRED',
  'PRODUCTION_RUN_ASSET_AUTHORING_INCOMPLETE',
  'PRODUCTION_RUN_SCENE_COMPOSITION_FAILED',
  'PRODUCTION_RUN_SCENE_VALIDATION_FAILED',
  'PRODUCTION_RUN_SCENE_REVIEW_REQUIRED',
  'PRODUCTION_RUN_SCENE_REVISION_CHANGED',
  'PRODUCTION_RUN_VIDEO_PLAN_INVALID',
  'PRODUCTION_RUN_VIDEO_ASSEMBLY_FAILED',
  'PRODUCTION_RUN_VIDEO_ASSEMBLY_DRIFTED',
  'PRODUCTION_RUN_NARRATION_CONFIG_MISSING',
  'PRODUCTION_RUN_TTS_OPERATION_FAILED',
  'PRODUCTION_RUN_TTS_INCOMPLETE',
  'PRODUCTION_RUN_VOICEOVER_ALIGNMENT_LOW_CONFIDENCE',
  'PRODUCTION_RUN_NARRATION_APPLICATION_FAILED',
  'PRODUCTION_RUN_TIMELINE_REVIEW_REQUIRED',
  'PRODUCTION_RUN_RENDER_PREFLIGHT_FAILED',
  'PRODUCTION_RUN_RENDER_OPERATION_FAILED',
  'PRODUCTION_RUN_DELIVERY_INVALID',
  'PRODUCTION_RUN_DELIVERY_REVIEW_REQUIRED',
  'PRODUCTION_RUN_REVIEW_NOT_FOUND',
  'PRODUCTION_RUN_REVIEW_ARTIFACT_CHANGED',
  'PRODUCTION_RUN_REVIEW_REJECTED',
  'PRODUCTION_RUN_DOWNSTREAM_INVALIDATED',
  'PRODUCTION_RUN_RECEIPT_WRITE_FAILED',
  'PRODUCTION_RUN_EVENT_WRITE_FAILED',
] as const;
