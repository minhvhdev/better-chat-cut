import type { PublishingDiagnostic } from '../../../publishing-contracts/src/index.ts';
import type { PublishingStageId } from '../../../publishing-contracts/src/index.ts';
import type { PublishingArtifactType } from '../../../publishing-contracts/src/index.ts';
import type { PublishingTargetV1 } from '../../../publishing-contracts/src/index.ts';

export type PublishingStageStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'awaiting-input'
  | 'awaiting-review'
  | 'awaiting-external-operation'
  | 'reconciliation-required'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type PublishingStageStateV1 = {
  stageId: PublishingStageId;
  status: PublishingStageStatus;
  attempt: number;
  inputArtifacts: { artifactType: PublishingArtifactType; artifactHash: string }[];
  outputArtifacts: { artifactType: PublishingArtifactType; artifactHash: string }[];
  externalOperation?: {
    type: 'upload' | 'remote-processing' | 'release';
    id: string;
    status: string;
  };
  review?: { reviewId: string; status: 'pending' | 'approved' | 'rejected' };
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
};

export type PublishingRunV1 = {
  schemaVersion: '1.0.0';
  runId: string;
  requestId: string;
  requestHash: string;
  revision: number;
  status:
    | 'active'
    | 'awaiting-input'
    | 'awaiting-review'
    | 'awaiting-external-operation'
    | 'reconciliation-required'
    | 'blocked'
    | 'failed'
    | 'cancelled'
    | 'completed';
  currentStageId: PublishingStageId;
  source: {
    productionRunId: string;
    bundleId: string;
    deliveryManifestHash: string;
  };
  target: PublishingTargetV1;
  artifacts: { artifactType: PublishingArtifactType; artifactHash: string }[];
  stages: PublishingStageStateV1[];
  workflow: {
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
  upload?: {
    operationId: string;
    remoteVideoId?: string;
    remoteFingerprint?: string;
  };
  release?: {
    operationId: string;
    releaseManifestHash?: string;
  };
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type PublishingArtifactEnvelopeV1<T = unknown> = {
  schemaVersion: '1.0.0';
  artifactType: PublishingArtifactType;
  artifactHash: string;
  stageId: PublishingStageId;
  content: T;
  inputs: { artifactType: PublishingArtifactType; artifactHash: string }[];
  createdAt: string;
};

export type PublishingReviewV1 = {
  schemaVersion: '1.0.0';
  reviewId: string;
  publishingRunId: string;
  stageId: 'metadata' | 'thumbnail' | 'package-review' | 'release-review';
  artifactReferences: { artifactType: PublishingArtifactType; artifactHash: string }[];
  remote?: { videoId: string; remoteFingerprint: string };
  status: 'pending' | 'approved' | 'rejected';
  decision?: { notes?: string; requestedChanges?: string[] };
  createdAt: string;
  decidedAt?: string;
};

export type PublishingUploadOperationV1 = {
  schemaVersion: '1.0.0';
  operationId: string;
  publishingRunId: string;
  packageHash: string;
  connectionId: string;
  status:
    | 'queued'
    | 'validating'
    | 'creating-upload-session'
    | 'uploading-video'
    | 'video-uploaded'
    | 'remote-processing'
    | 'uploading-thumbnail'
    | 'uploading-captions'
    | 'verifying'
    | 'awaiting-release-review'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'reconciliation-required';
  progress: {
    phase: string;
    bytesUploaded?: number;
    totalBytes?: number;
    percent?: number;
  };
  remote?: {
    videoId?: string;
    uploadSessionFingerprint?: string;
  };
  attempts: number;
  simulateUncertainOutcome?: boolean;
  error?: PublishingDiagnostic;
  createdAt: string;
  updatedAt: string;
};

export type RemotePublicationSnapshotV1 = {
  schemaVersion: '1.0.0';
  platform: 'youtube';
  connectionId: string;
  channel: { id: string; displayName?: string };
  video: {
    id: string;
    processingStatus: string;
    visibility: 'private' | 'unlisted' | 'public';
    title: string;
    description: string;
    tags: string[];
    durationMs?: number;
    thumbnailApplied?: boolean;
    scheduledAt?: string;
    subtitles: {
      language: string;
      format?: 'srt' | 'vtt';
      status: string;
      remoteId?: string;
    }[];
  };
  remoteFingerprint: string;
  fetchedAt: string;
};

export type ReleaseManifestV1 = {
  schemaVersion: '1.0.0';
  publishingRunId: string;
  publishingPackage: { packageId: string; packageHash: string };
  source: {
    productionRunId: string;
    bundleId: string;
    deliveryManifestHash: string;
    videoSha256: string;
    thumbnailSha256?: string;
    subtitleSha256: string[];
  };
  target: {
    platform: 'youtube';
    connectionId: string;
    channelId: string;
    remoteVideoId: string;
  };
  release: {
    desiredVisibility: 'private' | 'unlisted' | 'public';
    mode: 'manual' | 'immediate' | 'scheduled';
    scheduledAt?: string;
    verifiedRemoteState: RemotePublicationSnapshotV1;
  };
  releaseManifestHash: string;
  createdAt: string;
};

export type PublishingReceiptV1 = {
  requestId: string;
  inputHash: string;
  operation: 'create-run' | 'put-artifact' | 'execute-stage' | 'review' | 'resume' | 'cancel' | 'reconcile';
  publishingRunId: string;
  previousRevision?: number;
  resultingRevision: number;
  previousWorkflowFingerprint?: string;
  resultingWorkflowFingerprint: string;
  completedAt: string;
};

export type PublishingEventType =
  | 'publishing-run.created'
  | 'metadata.added'
  | 'thumbnail.rendered'
  | 'review.created'
  | 'review.approved'
  | 'review.rejected'
  | 'package.created'
  | 'connection.verified'
  | 'upload.started'
  | 'upload.progress'
  | 'upload.remote-id-recorded'
  | 'upload.processing'
  | 'thumbnail.uploaded'
  | 'caption.uploaded'
  | 'remote.verified'
  | 'release.review-created'
  | 'release.executed'
  | 'release.verified'
  | 'reconciliation.required'
  | 'publishing-run.cancelled'
  | 'publishing-run.completed'
  | 'publishing-run.failed';

export type PublishingEventV1 = {
  eventId: string;
  type: PublishingEventType;
  publishingRunId: string;
  occurredAt: string;
  details?: Record<string, unknown>;
};

export type PublishingRunSummaryV1 = {
  runId: string;
  requestId: string;
  status: PublishingRunV1['status'];
  currentStageId: PublishingStageId;
  revision: number;
  workflowFingerprint: string;
  createdAt: string;
  updatedAt: string;
  remoteVideoId?: string;
  releaseManifestHash?: string;
};

export type PublishingNextActionV1 =
  | {
    type: 'put-artifact';
    stageId: PublishingStageId;
    artifactType: PublishingArtifactType;
    requirements: string[];
  }
  | { type: 'execute-stage'; stageId: PublishingStageId }
  | { type: 'review'; stageId: PublishingStageId; reviewId: string }
  | {
    type: 'wait-external-operation';
    stageId: PublishingStageId;
    operationId: string;
    operationType: 'upload' | 'remote-processing' | 'release';
  }
  | {
    type: 'reconcile';
    stageId: PublishingStageId;
    operationId: string;
    recovery: string[];
  }
  | {
    type: 'resolve-blocker';
    stageId: PublishingStageId;
    blockers: PublishingDiagnostic[];
  }
  | { type: 'completed'; releaseManifestHash: string };

export type PublishingReleaseSummaryV1 = {
  publishingRunId: string;
  platform: 'youtube';
  channelId: string;
  remoteVideoId: string;
  visibility: 'private' | 'unlisted' | 'public';
  scheduledAt?: string;
  releaseManifestHash: string;
  localArtifacts: { role: string; sha256: string; downloadUrl?: string }[];
};

export type PublishingRunValidationResultV1 = {
  valid: boolean;
  runId: string;
  revision: number;
  workflowFingerprintValid: boolean;
  source: {
    productionRunComplete: boolean;
    deliveryBundleValid: boolean;
    manifestHashValid: boolean;
  };
  artifacts: {
    artifactType: PublishingArtifactType;
    artifactHash: string;
    exists: boolean;
    hashValid: boolean;
    schemaValid: boolean;
  }[];
  reviews: { reviewId: string; valid: boolean; status: string }[];
  operations: { operationId: string; type: 'upload' | 'release'; status: string }[];
  remote?: { videoId?: string; fingerprintValid?: boolean };
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
};

export type PublishingConnectionInspectionV1 = {
  platform: 'youtube';
  connectionId: string;
  configured: boolean;
  authenticated: boolean;
  channel?: { id: string; displayName?: string };
  capabilities: import('../../../publishing-contracts/src/index.ts').PublishingPlatformCapabilitiesV1;
  errors: PublishingDiagnostic[];
  warnings: PublishingDiagnostic[];
};

export type ResolvedPublishingConnection = {
  platform: 'youtube';
  connectionId: string;
  channelId: string;
  channelDisplayName?: string;
  /** In-memory only; never serialized. */
  credentialHandle: symbol;
};

export type RemoteReconciliationInputV1 = {
  remoteVideoId: string;
  expectedPackageHash: string;
  expectedVideoSha256: string;
};
