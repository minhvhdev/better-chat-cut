export type VideoPlanDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  planId?: string;
  sceneEntryId?: string;
  itemId?: string;
  path?: string;
  frame?: number;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function videoPlanDiagnostic(
  severity: VideoPlanDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<VideoPlanDiagnostic, 'severity' | 'code' | 'message'> = {},
): VideoPlanDiagnostic {
  return { severity, code, message, ...extra };
}

export class VideoPlanError extends Error {
  readonly code: string;
  readonly diagnostics: VideoPlanDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: VideoPlanDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'VideoPlanError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      videoPlanDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export const VIDEO_PLAN_ERROR_CODES = [
  'VIDEO_PLAN_SCHEMA_UNSUPPORTED',
  'VIDEO_PLAN_INVALID_ID',
  'VIDEO_PLAN_EMPTY',
  'VIDEO_PLAN_TOO_LARGE',
  'VIDEO_PLAN_TOO_MANY_SCENES',
  'VIDEO_PLAN_DURATION_TOO_LONG',
  'VIDEO_PLAN_DUPLICATE_SCENE_ENTRY_ID',
  'VIDEO_PLAN_SCENE_BINDING_INVALID',
  'VIDEO_PLAN_SCENE_CANVAS_MISMATCH',
  'VIDEO_PLAN_SCENE_DURATION_INVALID',
  'VIDEO_PLAN_GAP_INVALID',
  'VIDEO_PLAN_TRANSITION_INVALID',
  'VIDEO_PLAN_TRANSITION_ON_LAST_SCENE',
  'VIDEO_PLAN_TRANSITION_REQUIRES_ADJACENCY',
  'VIDEO_PLAN_MARKER_INVALID',
  'VIDEO_PLAN_TIMELINE_OUTPUT_MISMATCH',
  'VIDEO_PLAN_TARGET_TRACK_NOT_FOUND',
  'VIDEO_PLAN_TARGET_TRACK_NOT_VIDEO',
  'VIDEO_PLAN_TARGET_TRACK_LOCKED',
  'VIDEO_PLAN_TARGET_RANGE_OCCUPIED',
  'VIDEO_PLAN_TARGET_TRANSITION_CONFLICT',
  'VIDEO_PLAN_ALREADY_ASSEMBLED',
  'VIDEO_PLAN_REQUEST_ID_REUSE_CONFLICT',
  'VIDEO_PLAN_ASSEMBLY_PARTIAL',
  'VIDEO_PLAN_ASSEMBLY_NOT_FOUND',
  'VIDEO_PLAN_ASSEMBLY_INCOMPLETE',
  'VIDEO_PLAN_ASSEMBLY_DRIFTED',
  'VIDEO_PLAN_ASSEMBLY_DUPLICATE_ENTRY',
  'VIDEO_PLAN_SCENE_ITEM_MISSING',
  'VIDEO_PLAN_SCENE_ITEM_POSITION_CHANGED',
  'VIDEO_PLAN_SCENE_ITEM_DURATION_CHANGED',
  'VIDEO_PLAN_SCENE_BINDING_CHANGED',
  'VIDEO_PLAN_TRANSITION_MISSING',
  'VIDEO_PLAN_TRANSITION_CHANGED',
  'VIDEO_PLAN_MARKER_MISSING',
  'VIDEO_PLAN_MARKER_CHANGED',
  'VIDEO_PLAN_RENDER_NOT_READY',
  'VIDEO_PLAN_RENDER_SAMPLE_FAILED',
  'VIDEO_PLAN_RENDER_CONTACT_SHEET_FAILED',
  'VIDEO_PLAN_EXPORT_READINESS_FAILED',
] as const;
