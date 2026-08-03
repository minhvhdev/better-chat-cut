import {
  DEFAULT_YOUTUBE_CAPABILITIES,
  publishingDiagnostic,
  sha256Hex,
  stableStringify,
  type PublishingTargetV1,
} from '../../../../publishing-contracts/src/index.ts';
import type {
  RemotePublicationSnapshotV1,
  ResolvedPublishingConnection,
} from '../../contracts/publishing-run.ts';
import type {
  BeginUploadInput,
  BeginUploadResult,
  PublishingPlatformAdapter,
  ResumeUploadInput,
} from '../publishing-platform-adapter.ts';
import { computeRemoteFingerprint } from '../remote-fingerprint.ts';

type FakeVideo = {
  id: string;
  channelId: string;
  connectionId: string;
  title: string;
  description: string;
  tags: string[];
  visibility: 'private' | 'unlisted' | 'public';
  processingStatus: 'processing' | 'succeeded' | 'failed';
  processingTicks: number;
  durationMs: number;
  videoSha256: string;
  packageHash: string;
  thumbnailApplied: boolean;
  scheduledAt?: string;
  subtitles: { language: string; format?: 'srt' | 'vtt'; status: string; remoteId?: string }[];
  sessionFingerprint?: string;
  bytesUploaded: number;
  totalBytes: number;
  cancelled: boolean;
};

export type FakePublishingAdapterOptions = {
  connectionId?: string;
  channelId?: string;
  channelDisplayName?: string;
  configured?: boolean;
  authenticated?: boolean;
  /** Force first beginUpload to produce uncertain outcome. */
  uncertainOnFirstUpload?: boolean;
  supportsCancellation?: boolean;
  persistDir?: string;
};

export function createFakePublishingAdapter(options: FakePublishingAdapterOptions = {}): PublishingPlatformAdapter {
  const connectionId = options.connectionId ?? 'conn.youtube.fake';
  const channelId = options.channelId ?? 'UCTESTCHANNEL';
  const channelDisplayName = options.channelDisplayName ?? 'Test Channel';
  const configured = options.configured !== false;
  const authenticated = options.authenticated !== false;
  const supportsCancellation = options.supportsCancellation !== false;
  const videos = new Map<string, FakeVideo>();
  const sessions = new Map<string, string>(); // fingerprint -> videoId
  let uncertainArmed = options.uncertainOnFirstUpload === true;
  let videoSeq = 0;

  function snapshot(v: FakeVideo): RemotePublicationSnapshotV1 {
    const base = {
      schemaVersion: '1.0.0' as const,
      platform: 'youtube' as const,
      connectionId: v.connectionId,
      channel: { id: v.channelId, displayName: channelDisplayName },
      video: {
        id: v.id,
        processingStatus: v.processingStatus,
        visibility: v.visibility,
        title: v.title,
        description: v.description,
        tags: [...v.tags],
        durationMs: v.durationMs,
        thumbnailApplied: v.thumbnailApplied,
        scheduledAt: v.scheduledAt,
        subtitles: v.subtitles.map((s) => ({ ...s })),
      },
      remoteFingerprint: '',
      fetchedAt: new Date().toISOString(),
    };
    base.remoteFingerprint = computeRemoteFingerprint(base);
    return base;
  }

  async function inspectConnection(target: PublishingTargetV1) {
    const errors = [];
    if (!configured) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CONNECTION_NOT_CONFIGURED', 'Connection not configured'));
    } else if (!authenticated) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CONNECTION_AUTH_REQUIRED', 'Authentication required'));
    }
    if (target.expectedChannelId && target.expectedChannelId !== channelId && configured && authenticated) {
      errors.push(publishingDiagnostic('error', 'PUBLISHING_CONNECTION_CHANNEL_MISMATCH', 'Channel mismatch', {
        details: { expected: target.expectedChannelId, actual: channelId },
      }));
    }
    return {
      platform: 'youtube' as const,
      connectionId: target.connectionId || connectionId,
      configured,
      authenticated,
      channel: configured && authenticated ? { id: channelId, displayName: channelDisplayName } : undefined,
      capabilities: {
        ...DEFAULT_YOUTUBE_CAPABILITIES,
        upload: {
          ...DEFAULT_YOUTUBE_CAPABILITIES.upload,
          supportsCancellation,
        },
      },
      errors,
      warnings: [],
    };
  }

  async function resolveConnection(target: PublishingTargetV1): Promise<ResolvedPublishingConnection> {
    const inspection = await inspectConnection(target);
    if (!inspection.configured) {
      throw Object.assign(new Error('not configured'), { code: 'PUBLISHING_CONNECTION_NOT_CONFIGURED' });
    }
    if (!inspection.authenticated) {
      throw Object.assign(new Error('auth required'), { code: 'PUBLISHING_CONNECTION_AUTH_REQUIRED' });
    }
    if (target.expectedChannelId && target.expectedChannelId !== channelId) {
      throw Object.assign(new Error('channel mismatch'), { code: 'PUBLISHING_CONNECTION_CHANNEL_MISMATCH' });
    }
    return {
      platform: 'youtube',
      connectionId: target.connectionId,
      channelId,
      channelDisplayName,
      credentialHandle: Symbol('fake-credential'),
    };
  }

  async function beginUpload(input: BeginUploadInput): Promise<BeginUploadResult> {
    if (uncertainArmed) {
      uncertainArmed = false;
      const fingerprint = `sess.uncertain.${sha256Hex(input.package.packageHash).slice(0, 8)}`;
      // Simulate accepted remote without returning/localizing ID
      videoSeq += 1;
      const id = `fakeVideo${videoSeq}`;
      const v: FakeVideo = {
        id,
        channelId,
        connectionId: input.connection.connectionId,
        title: input.package.metadata.title,
        description: input.package.metadata.description,
        tags: [...input.package.metadata.tags],
        visibility: 'private',
        processingStatus: 'processing',
        processingTicks: 0,
        durationMs: 70_000,
        videoSha256: input.video.sha256,
        packageHash: input.package.packageHash,
        thumbnailApplied: false,
        subtitles: [],
        sessionFingerprint: fingerprint,
        bytesUploaded: input.video.byteLength,
        totalBytes: input.video.byteLength,
        cancelled: false,
      };
      videos.set(id, v);
      sessions.set(fingerprint, id);
      return {
        uploadSessionFingerprint: fingerprint,
        status: 'reconciliation-required',
        uncertain: true,
        bytesUploaded: input.video.byteLength,
        totalBytes: input.video.byteLength,
      };
    }

    const fingerprint = `sess.${sha256Hex(stableStringify({
      packageHash: input.package.packageHash,
      video: input.video.sha256,
    })).slice(0, 16)}`;
    videoSeq += 1;
    const id = `fakeVideo${videoSeq}`;
    const half = Math.floor(input.video.byteLength / 2);
    const v: FakeVideo = {
      id,
      channelId,
      connectionId: input.connection.connectionId,
      title: input.package.metadata.title,
      description: input.package.metadata.description,
      tags: [...input.package.metadata.tags],
      visibility: 'private',
      processingStatus: 'processing',
      processingTicks: 0,
      durationMs: 70_000,
      videoSha256: input.video.sha256,
      packageHash: input.package.packageHash,
      thumbnailApplied: false,
      subtitles: [],
      sessionFingerprint: fingerprint,
      bytesUploaded: half,
      totalBytes: input.video.byteLength,
      cancelled: false,
    };
    videos.set(id, v);
    sessions.set(fingerprint, id);
    return {
      remoteVideoId: id,
      uploadSessionFingerprint: fingerprint,
      status: 'uploading-video',
      bytesUploaded: half,
      totalBytes: input.video.byteLength,
    };
  }

  async function resumeUpload(input: ResumeUploadInput): Promise<BeginUploadResult> {
    const videoId = sessions.get(input.sessionFingerprint);
    if (!videoId) {
      return {
        uploadSessionFingerprint: input.sessionFingerprint,
        status: 'failed',
      };
    }
    const v = videos.get(videoId)!;
    if (v.cancelled) {
      return {
        remoteVideoId: videoId,
        uploadSessionFingerprint: input.sessionFingerprint,
        status: 'cancelled',
        bytesUploaded: v.bytesUploaded,
        totalBytes: v.totalBytes,
      };
    }
    v.bytesUploaded = v.totalBytes;
    return {
      remoteVideoId: videoId,
      uploadSessionFingerprint: input.sessionFingerprint,
      status: 'video-uploaded',
      bytesUploaded: v.totalBytes,
      totalBytes: v.totalBytes,
    };
  }

  const adapter: PublishingPlatformAdapter = {
    platform: 'youtube',
    getCapabilities: () => DEFAULT_YOUTUBE_CAPABILITIES,
    inspectConnection,
    resolveConnection,
    beginUpload,
    resumeUpload,
    async getUploadStatus({ remoteVideoId }) {
      if (!remoteVideoId) return { status: 'unknown' };
      const v = videos.get(remoteVideoId);
      if (!v) return { status: 'unknown' };
      if (v.processingStatus === 'processing') {
        v.processingTicks += 1;
        if (v.processingTicks >= 1) v.processingStatus = 'succeeded';
      }
      return {
        status: v.processingStatus,
        processingStatus: v.processingStatus,
        remoteVideoId: v.id,
      };
    },
    async cancelUpload({ remoteVideoId, sessionFingerprint }) {
      if (!supportsCancellation) {
        return { attempted: true, cancelled: false, remoteRetained: Boolean(remoteVideoId || sessionFingerprint) };
      }
      const id = remoteVideoId ?? (sessionFingerprint ? sessions.get(sessionFingerprint) : undefined);
      if (!id) return { attempted: true, cancelled: true, remoteRetained: false };
      const v = videos.get(id);
      if (v) v.cancelled = true;
      return { attempted: true, cancelled: true, remoteRetained: true };
    },
    async uploadThumbnail({ remoteVideoId }) {
      const v = videos.get(remoteVideoId);
      if (!v) return { applied: false };
      v.thumbnailApplied = true;
      return { applied: true };
    },
    async uploadSubtitle({ remoteVideoId, language, format }) {
      const v = videos.get(remoteVideoId);
      if (!v) throw new Error('missing video');
      const remoteId = `cap.${remoteVideoId}.${language}.${format}`;
      v.subtitles.push({ language, format, status: 'active', remoteId });
      return { remoteId, status: 'active' };
    },
    async getRemotePublication({ remoteVideoId }) {
      const v = videos.get(remoteVideoId);
      if (!v) throw new Error('missing video');
      return snapshot(v);
    },
    async executeRelease({ remoteVideoId, release }) {
      const v = videos.get(remoteVideoId);
      if (!v) throw new Error('missing video');
      if (release.mode === 'scheduled') {
        v.scheduledAt = release.scheduledAt;
        v.visibility = 'private';
        return { visibility: 'private', scheduledAt: release.scheduledAt };
      }
      v.visibility = release.desiredVisibility;
      v.scheduledAt = undefined;
      return { visibility: v.visibility };
    },
    async validateRelease({ remoteVideoId, release }) {
      const snap = await adapter.getRemotePublication({
        connection: { platform: 'youtube', connectionId, channelId, credentialHandle: Symbol('x') },
        remoteVideoId,
      });
      const errors: string[] = [];
      if (release.mode === 'scheduled') {
        if (snap.video.scheduledAt !== release.scheduledAt) errors.push('schedule mismatch');
      } else if (snap.video.visibility !== release.desiredVisibility) {
        errors.push('visibility mismatch');
      }
      return { valid: errors.length === 0, snapshot: snap, errors };
    },
    async reconcile({ connection, reconciliation }) {
      const v = videos.get(reconciliation.remoteVideoId);
      if (!v) return { accepted: false, reason: 'remote video not found' };
      if (v.channelId !== connection.channelId) return { accepted: false, reason: 'channel mismatch' };
      if (v.packageHash !== reconciliation.expectedPackageHash) return { accepted: false, reason: 'package hash mismatch' };
      if (v.videoSha256 !== reconciliation.expectedVideoSha256) return { accepted: false, reason: 'video hash mismatch' };
      return { accepted: true, snapshot: snapshot(v) };
    },
    __testMutateRemote(remoteVideoId, patch) {
      const v = videos.get(remoteVideoId);
      if (!v) return;
      if (patch.title !== undefined) v.title = patch.title;
      if (patch.description !== undefined) v.description = patch.description;
      if (patch.tags !== undefined) v.tags = [...patch.tags];
      if (patch.visibility !== undefined) v.visibility = patch.visibility;
      if (patch.processingStatus !== undefined) {
        v.processingStatus = patch.processingStatus as FakeVideo['processingStatus'];
      }
    },
  };

  return adapter;
}
