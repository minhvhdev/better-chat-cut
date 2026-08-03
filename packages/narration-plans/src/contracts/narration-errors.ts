export type NarrationDiagnostic = {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  narrationPlanId?: string;
  sceneEntryId?: string;
  segmentId?: string;
  speakerId?: string;
  path?: string;
  details?: Record<string, unknown>;
  recovery?: string;
};

export function narrationDiagnostic(
  severity: NarrationDiagnostic['severity'],
  code: string,
  message: string,
  extra: Omit<NarrationDiagnostic, 'severity' | 'code' | 'message'> = {},
): NarrationDiagnostic {
  return { severity, code, message, ...extra };
}

export class NarrationError extends Error {
  readonly code: string;
  readonly diagnostics: NarrationDiagnostic[];
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options: {
      diagnostics?: NarrationDiagnostic[];
      details?: Record<string, unknown>;
      recovery?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'NarrationError';
    this.code = code;
    this.diagnostics = options.diagnostics ?? [
      narrationDiagnostic('error', code, message, {
        details: options.details,
        recovery: options.recovery,
      }),
    ];
    this.details = options.details;
    this.recovery = options.recovery;
  }
}

export const NARRATION_ERROR_CODES = [
  'NARRATION_SCHEMA_UNSUPPORTED',
  'NARRATION_INVALID_ID',
  'NARRATION_INVALID_LANGUAGE',
  'NARRATION_PLAN_TOO_LARGE',
  'NARRATION_TOO_MANY_SCENES',
  'NARRATION_TOO_MANY_SEGMENTS',
  'NARRATION_TOO_MANY_SPEAKERS',
  'NARRATION_DUPLICATE_SPEAKER',
  'NARRATION_DUPLICATE_SCENE',
  'NARRATION_DUPLICATE_SEGMENT',
  'NARRATION_MISSING_SPEAKER',
  'NARRATION_MISSING_VIDEO_SCENE',
  'NARRATION_EMPTY_TEXT',
  'NARRATION_TEXT_TOO_LONG',
  'NARRATION_TOTAL_TEXT_TOO_LONG',
  'NARRATION_INVALID_VOICE',
  'NARRATION_INVALID_PROVIDER',
  'NARRATION_INVALID_TIMING',
  'NARRATION_INVALID_CAPTION_POLICY',
  'NARRATION_UNKNOWN_FIELD',
  'NARRATION_NON_SERIALIZABLE',
  'NARRATION_VIDEO_PLAN_INVALID',
  'NARRATION_AUDIO_OVERFLOWS_SCENE',
  'NARRATION_TTS_ARTIFACT_MISSING',
  'NARRATION_TTS_FAILED',
  'NARRATION_REQUEST_ID_REUSE_CONFLICT',
  'NARRATION_TIMING_ALREADY_APPLIED',
  'NARRATION_VIDEO_ASSEMBLY_DRIFTED',
  'NARRATION_VOICEOVER_TRANSCRIPT_MISSING',
  'NARRATION_ALIGNMENT_LOW_CONFIDENCE',
  'NARRATION_ALIGNMENT_FAILED',
  'NARRATION_PATH_TRAVERSAL',
] as const;
