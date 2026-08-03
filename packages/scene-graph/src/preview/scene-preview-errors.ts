export class ScenePreviewError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(code: string, message: string, opts?: { details?: Record<string, unknown>; recovery?: string }) {
    super(message);
    this.name = 'ScenePreviewError';
    this.code = code;
    this.details = opts?.details;
    this.recovery = opts?.recovery;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      recovery: this.recovery,
    };
  }
}
