import type {
  PublishingPackageV1,
  PublishingPlatformCapabilitiesV1,
  PublishingTargetV1,
  DEFAULT_YOUTUBE_CAPABILITIES,
  ReleasePlanV1,
} from '../../../publishing-contracts/src/index.ts';
import type {
  PublishingConnectionInspectionV1,
  PublishingUploadOperationV1,
  RemotePublicationSnapshotV1,
  RemoteReconciliationInputV1,
  ResolvedPublishingConnection,
} from '../contracts/publishing-run.ts';

export type { PublishingConnectionInspectionV1, ResolvedPublishingConnection };

export type BeginUploadInput = {
  connection: ResolvedPublishingConnection;
  package: PublishingPackageV1;
  video: { sha256: string; byteLength: number; fileName: string; localPath?: string };
  operation: PublishingUploadOperationV1;
};

export type BeginUploadResult = {
  remoteVideoId?: string;
  uploadSessionFingerprint: string;
  status: PublishingUploadOperationV1['status'];
  bytesUploaded?: number;
  totalBytes?: number;
  uncertain?: boolean;
};

export type ResumeUploadInput = BeginUploadInput & {
  sessionFingerprint: string;
  bytesUploaded?: number;
};

export type PublishingPlatformAdapter = {
  platform: 'youtube';
  getCapabilities(): PublishingPlatformCapabilitiesV1;
  inspectConnection(target: PublishingTargetV1): Promise<PublishingConnectionInspectionV1>;
  resolveConnection(target: PublishingTargetV1): Promise<ResolvedPublishingConnection>;
  beginUpload(input: BeginUploadInput): Promise<BeginUploadResult>;
  resumeUpload(input: ResumeUploadInput): Promise<BeginUploadResult>;
  getUploadStatus(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId?: string;
    sessionFingerprint?: string;
  }): Promise<{ status: string; processingStatus?: string; remoteVideoId?: string }>;
  cancelUpload(input: {
    connection: ResolvedPublishingConnection;
    sessionFingerprint?: string;
    remoteVideoId?: string;
  }): Promise<{ attempted: boolean; cancelled: boolean; remoteRetained: boolean }>;
  uploadThumbnail(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId: string;
    thumbnail: { sha256: string; mimeType: string; bytes: Buffer };
  }): Promise<{ applied: boolean }>;
  uploadSubtitle(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId: string;
    language: string;
    format: 'srt' | 'vtt';
    contentSha256: string;
    text: string;
  }): Promise<{ remoteId: string; status: string }>;
  getRemotePublication(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId: string;
  }): Promise<RemotePublicationSnapshotV1>;
  executeRelease(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId: string;
    release: ReleasePlanV1;
  }): Promise<{ visibility: 'private' | 'unlisted' | 'public'; scheduledAt?: string }>;
  validateRelease(input: {
    connection: ResolvedPublishingConnection;
    remoteVideoId: string;
    release: ReleasePlanV1;
  }): Promise<{ valid: boolean; snapshot: RemotePublicationSnapshotV1; errors: string[] }>;
  reconcile(input: {
    connection: ResolvedPublishingConnection;
    reconciliation: RemoteReconciliationInputV1;
  }): Promise<{ accepted: boolean; snapshot?: RemotePublicationSnapshotV1; reason?: string }>;
  /** Test hook: mutate remote state in fake adapter. */
  __testMutateRemote?(remoteVideoId: string, patch: Partial<RemotePublicationSnapshotV1['video']>): void;
};

// keep type import alive
export type YoutubeCapabilitiesAlias = typeof DEFAULT_YOUTUBE_CAPABILITIES;
