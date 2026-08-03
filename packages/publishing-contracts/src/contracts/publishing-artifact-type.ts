export const PUBLISHING_ARTIFACT_TYPES = [
  'publishing-request',
  'publishing-metadata',
  'publishing-compliance',
  'thumbnail-plan',
  'thumbnail-artifact',
  'publishing-package',
  'upload-operation',
  'remote-publication-snapshot',
  'release-plan',
  'release-manifest',
] as const;

export type PublishingArtifactType = (typeof PUBLISHING_ARTIFACT_TYPES)[number];
