/** Policy constants for production render plans (pure; no Date/Math.random). */
export const PRODUCTION_RENDER_SCHEMA_VERSION = '1.0.0' as const;

/** Bump when plan/profile/QA/manifest semantics change. Deterministic constant. */
export const PRODUCTION_RENDER_REVISION = 'production-render-rev.1.0.0';

export const MAX_OUTPUT_WIDTH = 3840;
export const MAX_OUTPUT_HEIGHT = 2160;
export const MIN_OUTPUT_WIDTH = 320;
export const MIN_OUTPUT_HEIGHT = 180;
