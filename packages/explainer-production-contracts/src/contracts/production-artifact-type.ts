export const PRODUCTION_ARTIFACT_TYPES = [
  'production-request',
  'research-brief',
  'explainer-script',
  'storyboard',
  'asset-requirement-set',
  'asset-plan',
  'asset-authoring-tasks',
  'scene-draft-set',
  'scene-review-report',
  'video-plan',
  'video-assembly-report',
  'narration-plan',
  'narration-timing',
  'narration-application-report',
  'production-render-plan',
  'production-render-operation',
  'delivery-bundle-manifest',
  'delivery-validation-report',
] as const;

export type ProductionArtifactType = (typeof PRODUCTION_ARTIFACT_TYPES)[number];
