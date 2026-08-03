export const PRODUCTION_STAGE_IDS = [
  'intake',
  'research',
  'script',
  'storyboard',
  'asset-requirements',
  'asset-resolution',
  'asset-authoring',
  'scene-composition',
  'scene-review',
  'video-plan',
  'timeline-assembly',
  'narration-plan',
  'narration-timing',
  'narration-application',
  'timeline-review',
  'production-preflight',
  'production-render',
  'delivery-validation',
  'delivery-review',
  'completion',
] as const;

export type ProductionStageId = (typeof PRODUCTION_STAGE_IDS)[number];
