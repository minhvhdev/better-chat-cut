export const VIDEO_PLAN_SCHEMA_VERSION = '1.0.0' as const;

export const VIDEO_PLAN_RUNTIME_REVISION = 'video-plan-runtime.1.0.0' as const;

export const MAX_VIDEO_PLAN_SERIALIZED_BYTES = 16 * 1024 * 1024;
export const MAX_VIDEO_PLAN_SCENES = 100;
export const MAX_VIDEO_PLAN_DURATION_FRAMES = 216_000;
export const MAX_GAP_AFTER_FRAMES = 18_000;
export const MAX_TRANSITION_DURATION_FRAMES = 600;
export const MAX_RENDER_VALIDATION_SAMPLE_FRAMES = 60;
export const MAX_MARKER_NOTE_LENGTH = 512;

export const VIDEO_PLAN_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const VIDEO_PLAN_SCENE_ENTRY_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const VIDEO_PLAN_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export const OUTPUT_WIDTH_MIN = 320;
export const OUTPUT_WIDTH_MAX = 3840;
export const OUTPUT_HEIGHT_MIN = 180;
export const OUTPUT_HEIGHT_MAX = 2160;
export const OUTPUT_FPS_MIN = 1;
export const OUTPUT_FPS_MAX = 60;

export const VIDEO_PLAN_VISUAL_TRANSITION_TYPES = [
  'cross-dissolve',
  'dip-to-black',
  'soft-wipe',
  'whip-pan',
  'flash',
  'luma-blend',
  'page-curl',
  'rack-focus',
  'organic-dissolve',
  'impact-shake',
  'anticipation-zoom',
  'clean-line-wipe',
  'circle-wipe',
  'radial-blur',
  'glitch-cut',
  'dip-to-color',
] as const;

export type VideoPlanVisualTransitionType = (typeof VIDEO_PLAN_VISUAL_TRANSITION_TYPES)[number];

export const MARKER_COLORS = [
  'blue',
  'cyan',
  'fuchsia',
  'green',
  'pink',
  'purple',
  'red',
  'yellow',
] as const;

export type VideoPlanMarkerColor = (typeof MARKER_COLORS)[number];
