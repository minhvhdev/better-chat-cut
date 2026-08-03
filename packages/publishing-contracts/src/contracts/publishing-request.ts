import type { PublishingTargetV1 } from './publishing-target.ts';

export const PUBLISHING_SCHEMA_VERSION = '1.0.0' as const;
export const PUBLISHING_REQUEST_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

export type PublishingWorkflowPolicyV1 = {
  metadataReview: 'manual' | 'auto';
  thumbnailReview: 'manual' | 'auto';
  packageReview: 'manual' | 'auto';
  releaseReview: 'manual';
  initialUploadVisibility: 'private';
  allowUnlistedRelease: boolean;
  allowPublicRelease: boolean;
  allowScheduledRelease: boolean;
  uploadCaptions: boolean;
  uploadThumbnail: boolean;
  maximumOperationRetries: number;
  stopOnWarnings: boolean;
};

export const DEFAULT_PUBLISHING_WORKFLOW_POLICY: PublishingWorkflowPolicyV1 = {
  metadataReview: 'manual',
  thumbnailReview: 'manual',
  packageReview: 'manual',
  releaseReview: 'manual',
  initialUploadVisibility: 'private',
  allowUnlistedRelease: true,
  allowPublicRelease: true,
  allowScheduledRelease: true,
  uploadCaptions: true,
  uploadThumbnail: true,
  maximumOperationRetries: 3,
  stopOnWarnings: false,
};

export type PublishingRequestV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  source: {
    productionRunId: string;
    bundleId: string;
    deliveryManifestHash: string;
  };
  target: PublishingTargetV1;
  release: {
    desiredVisibility: 'private' | 'unlisted' | 'public';
    mode: 'manual' | 'immediate' | 'scheduled';
    scheduledAt?: string;
  };
  subtitles: {
    uploadSrt: boolean;
    uploadVtt: boolean;
    language: string;
    name?: string;
  };
  workflow?: Partial<PublishingWorkflowPolicyV1>;
};

export const PUBLISHING_REQUEST_LIMITS = {
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_SERIALIZED_BYTES: 256_000,
} as const;
