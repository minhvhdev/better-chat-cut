export const NARRATION_PLAN_KNOWN_ROOT_KEYS = new Set([
  'schemaVersion',
  'id',
  'name',
  'description',
  'language',
  'videoPlan',
  'speakers',
  'defaults',
  'scenes',
]);

export const NARRATION_SPEAKER_KNOWN_KEYS = new Set(['id', 'name', 'temporaryVoice']);

export const NARRATION_VOICE_KNOWN_KEYS = new Set([
  'provider',
  'voiceId',
  'modelId',
  'speed',
  'pitch',
  'volume',
  'emotion',
  'emotionScale',
  'languageCode',
  'languageBoost',
  'outputFormat',
  'sampleRate',
  'subtitleTiming',
]);

export const NARRATION_SCENE_KNOWN_KEYS = new Set([
  'sceneEntryId',
  'leadInMs',
  'tailOutMs',
  'sceneDurationPolicy',
  'segments',
]);

export const NARRATION_SEGMENT_KNOWN_KEYS = new Set([
  'id',
  'text',
  'captionText',
  'speakerId',
  'pauseBeforeMs',
  'pauseAfterMs',
  'includeInCaptions',
  'pronunciationHints',
  'alignmentHints',
]);

export const NARRATION_DEFAULTS_KNOWN_KEYS = new Set([
  'speakerId',
  'leadInMs',
  'tailOutMs',
  'pauseBetweenSegmentsMs',
  'sceneDurationPolicy',
  'captions',
]);

export const NARRATION_CAPTION_KNOWN_KEYS = new Set([
  'enabled',
  'template',
  'pacing',
  'language',
  'track',
  'sourceMode',
  'style',
  'layout',
  'export',
]);
