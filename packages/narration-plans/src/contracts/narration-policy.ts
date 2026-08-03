export const NARRATION_PLAN_SCHEMA_VERSION = '1.0.0' as const;

export const NARRATION_RUNTIME_REVISION = 'narration-runtime.1.0.0' as const;

export const DEFAULT_NARRATION_LEAD_IN_MS = 250;
export const DEFAULT_NARRATION_TAIL_OUT_MS = 350;
export const DEFAULT_SEGMENT_GAP_MS = 120;

export const MAX_NARRATION_PLAN_SERIALIZED_BYTES = 20 * 1024 * 1024;
export const MAX_NARRATION_SCENES = 100;
export const MAX_NARRATION_SEGMENTS = 1000;
export const MAX_NARRATION_SPEAKERS = 20;
export const MAX_SEGMENT_TEXT_LENGTH = 5000;
export const MAX_TOTAL_TEXT_LENGTH = 250_000;
export const MAX_GENERATED_AUDIO_DURATION_MS = 4 * 60 * 60 * 1000;
export const MAX_SUBTITLE_CUES = 20_000;
export const MAX_TTS_CONCURRENT_REQUESTS = 3;

export const MAX_TIMING_MS = 10_000;

export const NARRATION_PLAN_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const NARRATION_SPEAKER_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const NARRATION_SEGMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const NARRATION_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
export const LANGUAGE_TAG_PATTERN = /^[A-Za-z0-9-]{1,35}$/;

export const NARRATION_TTS_PROVIDERS = ['elevenlabs', 'doubao', 'minimax'] as const;
export type NarrationTtsProvider = (typeof NARRATION_TTS_PROVIDERS)[number];

export const SCENE_DURATION_POLICIES = [
  'fit-narration',
  'at-least-visual',
  'preserve-video-plan',
] as const;
export type SceneDurationPolicy = (typeof SCENE_DURATION_POLICIES)[number];

export const SUBTITLE_TIMING_MODES = ['none', 'sentence', 'word'] as const;
export type SubtitleTimingMode = (typeof SUBTITLE_TIMING_MODES)[number];

export const CAPTION_PACING_MODES = ['word', 'phrase'] as const;
export type NarrationCaptionPacing = (typeof CAPTION_PACING_MODES)[number];

export const WORD_TIMING_QUALITIES = [
  'provider-word',
  'provider-sentence',
  'estimated-word',
  'segment-only',
  'mixed',
] as const;
export type WordTimingQuality = (typeof WORD_TIMING_QUALITIES)[number];
