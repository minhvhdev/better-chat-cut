export type ProductionRenderDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  requestId?: string;
  operationId?: string;
  bundleId?: string;
  projectId?: string;
  timelineId?: string;
  artifactRole?: string;
  frame?: number;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function productionRenderDiagnostic(
  severity: ProductionRenderDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<ProductionRenderDiagnostic, 'severity' | 'code' | 'message'> = {},
): ProductionRenderDiagnostic {
  return { severity, code, message, ...extra };
}

export class ProductionRenderError extends Error {
  readonly code: string;
  readonly diagnostics: ProductionRenderDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: ProductionRenderDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ProductionRenderError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      productionRenderDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export const PRODUCTION_RENDER_ERROR_CODES = [
  'PRODUCTION_RENDER_SCHEMA_UNSUPPORTED',
  'PRODUCTION_RENDER_INVALID_ID',
  'PRODUCTION_RENDER_REQUEST_TOO_LARGE',
  'PRODUCTION_RENDER_PROFILE_INVALID',
  'PRODUCTION_RENDER_RANGE_INVALID',
  'PRODUCTION_RENDER_TIMELINE_NOT_FOUND',
  'PRODUCTION_RENDER_TIMELINE_EMPTY',
  'PRODUCTION_RENDER_SOURCE_MODE_INVALID',
  'PRODUCTION_RENDER_PROJECT_FINGERPRINT_CONFLICT',
  'PRODUCTION_RENDER_TIMELINE_FINGERPRINT_CONFLICT',
  'PRODUCTION_RENDER_PLAN_HASH_INVALID',
  'PRODUCTION_RENDER_REQUEST_ID_REUSE_CONFLICT',
  'PRODUCTION_RENDER_VIDEO_ASSEMBLY_NOT_FOUND',
  'PRODUCTION_RENDER_VIDEO_ASSEMBLY_DRIFTED',
  'PRODUCTION_RENDER_NARRATION_NOT_FOUND',
  'PRODUCTION_RENDER_NARRATION_DRIFTED',
  'PRODUCTION_RENDER_CAPTION_SOURCE_INVALID',
  'PRODUCTION_RENDER_SCENE_CLIP_NOT_READY',
  'PRODUCTION_RENDER_MEDIA_MISSING',
  'PRODUCTION_RENDER_RUNTIME_MISSING',
  'PRODUCTION_RENDER_DRAFT_DEPENDENCY_NOT_ALLOWED',
  'PRODUCTION_RENDER_STAGING_DEPENDENCY_NOT_ALLOWED',
  'PRODUCTION_RENDER_DRAFT_SOURCE_NOT_ALLOWED',
  'PRODUCTION_RENDER_PREFLIGHT_FAILED',
  'PRODUCTION_RENDER_OPERATION_NOT_FOUND',
  'PRODUCTION_RENDER_ALREADY_COMPLETED',
  'PRODUCTION_RENDER_CANCEL_UNSUPPORTED',
  'PRODUCTION_RENDER_CANCELLED',
  'PRODUCTION_RENDER_FAILED',
  'PRODUCTION_RENDER_VIDEO_STREAM_MISSING',
  'PRODUCTION_RENDER_AUDIO_STREAM_MISSING',
  'PRODUCTION_RENDER_DECODE_FAILED',
  'PRODUCTION_RENDER_DIMENSIONS_MISMATCH',
  'PRODUCTION_RENDER_FPS_MISMATCH',
  'PRODUCTION_RENDER_DURATION_MISMATCH',
  'PRODUCTION_RENDER_UNEXPECTED_BLACK_RANGE',
  'PRODUCTION_RENDER_UNEXPECTED_FROZEN_RANGE',
  'PRODUCTION_RENDER_UNEXPECTED_SILENCE',
  'PRODUCTION_RENDER_AUDIO_TOO_QUIET',
  'PRODUCTION_RENDER_AUDIO_TOO_LOUD',
  'PRODUCTION_RENDER_AUDIO_PEAK_EXCEEDED',
  'PRODUCTION_RENDER_SUBTITLE_MISSING',
  'PRODUCTION_RENDER_SUBTITLE_INVALID',
  'PRODUCTION_RENDER_SUBTITLE_OUT_OF_RANGE',
  'PRODUCTION_RENDER_SUBTITLE_TIMING_MISMATCH',
  'PRODUCTION_RENDER_QA_FAILED',
  'PRODUCTION_RENDER_CONTACT_SHEET_FAILED',
  'PRODUCTION_RENDER_BUNDLE_ALREADY_EXISTS',
  'PRODUCTION_RENDER_BUNDLE_NOT_FOUND',
  'PRODUCTION_RENDER_BUNDLE_CORRUPT',
  'PRODUCTION_RENDER_MANIFEST_INVALID',
  'PRODUCTION_RENDER_ARTIFACT_MISSING',
  'PRODUCTION_RENDER_ARTIFACT_HASH_MISMATCH',
  'PRODUCTION_RENDER_ATOMIC_FINALIZE_FAILED',
  'PRODUCTION_RENDER_DOWNLOAD_NOT_ALLOWED',
  'PRODUCTION_RENDER_UNKNOWN_FIELD',
  'PRODUCTION_RENDER_NON_SERIALIZABLE',
  'PRODUCTION_RENDER_PATH_TRAVERSAL',
] as const;

export type ProductionRenderErrorCode = (typeof PRODUCTION_RENDER_ERROR_CODES)[number];
