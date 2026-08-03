import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';

export type AssemblyTimelineLike = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  fit?: 'contain' | 'cover';
  items: Array<{
    id: string;
    track: string;
    startFrame: number;
    durationInFrames: number;
    kind?: string;
    props?: Record<string, unknown>;
  }>;
  transitions?: Array<{
    id: string;
    outgoingItemId: string;
    incomingItemId: string;
    trackId: string;
    type: string;
    durationInFrames: number;
    direction?: string;
  }>;
  markers?: Array<{
    id: string;
    scope: string;
    fromFrame: number;
    durationFrames: number;
    note: string;
    color: string;
  }>;
  tracks?: Record<string, { kind?: string; locked?: boolean; name?: string }>;
};

export function resolveTargetVideoTrack(input: {
  timeline: AssemblyTimelineLike;
  requestedTrack?: string;
}): {
  trackId?: string;
  needsCreateTrack: boolean;
  createTrackId?: string;
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
} {
  const errors: VideoPlanDiagnostic[] = [];
  const warnings: VideoPlanDiagnostic[] = [];
  const tracks = input.timeline.tracks ?? {};
  const requested = input.requestedTrack?.trim();

  const resolveAlias = (alias: string): string | undefined => {
    if (tracks[alias]) return alias;
    const upper = alias.toUpperCase();
    if (upper === 'V1' || upper === 'VIDEO' || upper === 'DEFAULT') {
      const firstVideo = Object.entries(tracks).find(([, t]) => t.kind === 'video');
      return firstVideo?.[0];
    }
    for (const [id, track] of Object.entries(tracks)) {
      if (track.name === alias) return id;
    }
    return undefined;
  };

  if (requested) {
    const trackId = resolveAlias(requested) ?? (tracks[requested] ? requested : undefined);
    if (!trackId) {
      return {
        needsCreateTrack: false,
        errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_TRACK_NOT_FOUND', `Target track ${requested} not found`, {
          recovery: 'Pass an existing video track id/alias or omit to create default V1',
        })],
        warnings,
      };
    }
    const track = tracks[trackId]!;
    if (track.kind !== 'video') {
      return {
        trackId,
        needsCreateTrack: false,
        errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_TRACK_NOT_VIDEO', `Track ${trackId} is not a video track`, {
          recovery: 'Pass a video track id/alias',
        })],
        warnings,
      };
    }
    if (track.locked) {
      return {
        trackId,
        needsCreateTrack: false,
        errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_TRACK_LOCKED', `Track ${trackId} is locked`, {
          recovery: 'Unlock the track or choose another',
        })],
        warnings,
      };
    }
    return { trackId, needsCreateTrack: false, errors, warnings };
  }

  const existingVideo = Object.entries(tracks).find(([, t]) => t.kind === 'video' && !t.locked);
  if (existingVideo) {
    return { trackId: existingVideo[0], needsCreateTrack: false, errors, warnings };
  }
  const lockedVideo = Object.entries(tracks).find(([, t]) => t.kind === 'video' && t.locked);
  if (lockedVideo) {
    return {
      trackId: lockedVideo[0],
      needsCreateTrack: false,
      errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_TRACK_LOCKED', `Track ${lockedVideo[0]} is locked`, {
        recovery: 'Unlock the track',
      })],
      warnings,
    };
  }
  return {
    needsCreateTrack: true,
    createTrackId: 'track_v1',
    trackId: 'track_v1',
    errors,
    warnings,
  };
}

export function trackEndFrame(timeline: AssemblyTimelineLike, trackId: string): number {
  let end = 0;
  for (const item of timeline.items) {
    if (item.track !== trackId) continue;
    end = Math.max(end, item.startFrame + item.durationInFrames);
  }
  return end;
}
