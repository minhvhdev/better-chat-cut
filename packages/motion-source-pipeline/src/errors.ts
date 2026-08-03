export class MotionSourceError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly recovery?: string;

  constructor(
    code: string,
    message: string,
    options?: { details?: Record<string, unknown>; recovery?: string },
  ) {
    super(message);
    this.name = 'MotionSourceError';
    this.code = code;
    this.details = options?.details;
    this.recovery = options?.recovery;
  }

  toJSON(): {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    recovery?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      recovery: this.recovery,
    };
  }
}
