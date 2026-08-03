export type SceneClipDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  itemId?: string;
  draftId?: string;
  sceneId?: string;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function sceneClipDiagnostic(
  severity: SceneClipDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<SceneClipDiagnostic, 'severity' | 'code' | 'message'> = {},
): SceneClipDiagnostic {
  return { severity, code, message, ...extra };
}

export class SceneClipError extends Error {
  readonly code: string;
  readonly diagnostics: SceneClipDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: SceneClipDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SceneClipError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      sceneClipDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export const SCENE_CLIP_ERROR_CODES = [
  'SCENE_BINDING_DRAFT_NOT_FOUND',
  'SCENE_BINDING_HISTORY_ENTRY_NOT_FOUND',
  'SCENE_BINDING_SCENE_INVALID',
  'SCENE_BINDING_DEPENDENCY_INVALID',
  'SCENE_BINDING_PAYLOAD_HASH_FAILED',
  'SCENE_CLIP_NOT_FOUND',
  'SCENE_CLIP_WRONG_ITEM_KIND',
  'SCENE_CLIP_WRONG_TEMPLATE_ID',
  'SCENE_CLIP_RESERVED_PROPS_MISSING',
  'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED',
  'SCENE_CLIP_BINDING_HASH_INVALID',
  'SCENE_CLIP_SCENE_HASH_INVALID',
  'SCENE_CLIP_DEPENDENCY_FINGERPRINT_INVALID',
  'SCENE_CLIP_RUNTIME_UNAVAILABLE',
  'SCENE_CLIP_DRAFT_RUNTIME_NOT_ALLOWED',
  'SCENE_CLIP_DEPENDENCY_CONTENT_CHANGED',
  'SCENE_CLIP_SOURCE_DRAFT_MISMATCH',
  'SCENE_CLIP_ITEM_FINGERPRINT_CONFLICT',
  'SCENE_CLIP_BINDING_HASH_CONFLICT',
  'SCENE_CLIP_REQUEST_ID_REUSE_CONFLICT',
  'SCENE_CLIP_TRACK_NOT_FOUND',
  'SCENE_CLIP_TRACK_NOT_VIDEO',
  'SCENE_CLIP_INVALID_START_FRAME',
  'SCENE_CLIP_INVALID_DURATION',
  'SCENE_CLIP_SRC_IN_OUT_OF_RANGE',
  'SCENE_CLIP_RENDER_FAILED',
  'SCENE_CLIP_EXPORT_NOT_READY',
  'SCENE_CLIP_GENERIC_PROPS_EDIT_BLOCKED',
] as const;

export type SceneClipErrorCode = (typeof SCENE_CLIP_ERROR_CODES)[number];
