export const PUBLISHING_STAGE_IDS = [
  'intake',
  'metadata',
  'thumbnail',
  'package',
  'package-review',
  'connection-preflight',
  'upload',
  'remote-processing',
  'remote-assets',
  'remote-verification',
  'release-review',
  'release',
  'post-release-validation',
  'completion',
] as const;

export type PublishingStageId = (typeof PUBLISHING_STAGE_IDS)[number];
