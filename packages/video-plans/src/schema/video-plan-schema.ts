export const VIDEO_PLAN_KNOWN_ROOT_KEYS = new Set([
  'schemaVersion',
  'id',
  'name',
  'description',
  'output',
  'sceneCanvasPolicy',
  'placement',
  'markers',
  'defaults',
  'scenes',
]);

export const VIDEO_PLAN_SCENE_KNOWN_KEYS = new Set([
  'id',
  'name',
  'description',
  'binding',
  'duration',
  'gapAfterFrames',
  'transitionToNext',
  'marker',
]);
