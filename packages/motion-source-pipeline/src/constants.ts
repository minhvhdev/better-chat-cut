export const MOTION_SOURCE_PIPELINE_VERSION = '1.0.0';
export const MOTION_COMPILER_VERSION = '1.0.0';
export const MOTION_SANDBOX_CONTRACT_VERSION = '1.0.0';
export const MOTION_RUNTIME_CONTRACT_VERSION = '1.0.0';
export const MOTION_SDK_VERSION = '1.0.0';

export const MAX_SOURCE_BYTES = 128 * 1024;
export const MAX_BUNDLE_BYTES = 512 * 1024;
export const BUILD_TIMEOUT_MS = 30_000;
export const PREVIEW_TIMEOUT_MS = 120_000;

export const ALLOWED_IMPORTS = ['@better-chat-cut/motion-sdk'] as const;

export const ALLOWED_SDK_EXPORTS = [
  'defineMotionComponent',
  'useMotionFrame',
  'useMotionVideoConfig',
  'interpolate',
  'spring',
  'clamp',
  'mapRange',
  'mix',
  'resolveThemeColor',
] as const;

export const BLOCKED_JSX_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'foreignObject',
  'audio',
  'video',
  'link',
  'base',
  'meta',
  'portal',
]);

export const SOURCE_FILE_NAME = 'index.tsx';
