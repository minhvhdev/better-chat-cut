import { sha256Hex, stableStringify } from '../../../publishing-contracts/src/index.ts';
import type { RemotePublicationSnapshotV1 } from '../contracts/publishing-run.ts';

export function computeRemoteFingerprint(snapshot: Omit<RemotePublicationSnapshotV1, 'remoteFingerprint' | 'fetchedAt'> & {
  remoteFingerprint?: string;
  fetchedAt?: string;
}): string {
  const payload = {
    platform: snapshot.platform,
    connectionId: snapshot.connectionId,
    channelId: snapshot.channel.id,
    videoId: snapshot.video.id,
    processingStatus: snapshot.video.processingStatus,
    visibility: snapshot.video.visibility,
    title: snapshot.video.title,
    description: snapshot.video.description,
    tags: snapshot.video.tags,
    thumbnailApplied: snapshot.video.thumbnailApplied ?? false,
    scheduledAt: snapshot.video.scheduledAt,
    subtitles: snapshot.video.subtitles.map((s) => ({
      language: s.language,
      format: s.format,
      status: s.status,
      remoteId: s.remoteId,
    })),
  };
  return sha256Hex(stableStringify(payload));
}
