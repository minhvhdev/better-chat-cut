import type { NarrationTimingSnapshotV1 } from '../../../narration-plans/src/contracts/narration-timing.ts';
import { narrationDiagnostic, type NarrationDiagnostic } from '../../../narration-plans/src/contracts/narration-errors.ts';
import { sha256Hex, stableStringify } from '../../../narration-plans/src/schema/narration-serialization.ts';
import { BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY } from '../../../project-video-assembly/src/contracts/assembly-metadata.ts';
import { msToTimelineFrames } from '../../../narration-plans/src/timing/scene-duration-policy.ts';
import { buildSubtitleCues } from '../subtitles/subtitle-cues.ts';
import {
  BETTER_CHAT_CUT_NARRATION_PROPS_KEY,
  type NarrationTimelineMetadataV1,
  type NarrationTimingConflictPolicy,
} from '../contracts/narration-timeline-metadata.ts';
import type {
  NarrationTimelineApplyPreviewV1,
  NarrationTimelineApplyResultV1,
} from '../contracts/narration-apply-preview.ts';

export type NarrationTimelineLike = {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  fit?: string;
  items: Array<{
    id: string;
    track: string;
    startFrame: number;
    durationInFrames: number;
    kind?: string;
    src?: string;
    name?: string;
    props?: Record<string, unknown>;
    transcript?: Array<{ text: string; start: number; end: number }>;
    sourceRevision?: string;
  }>;
  tracks?: Record<string, { kind?: string; locked?: boolean; name?: string }>;
  transitions: Array<{ id: string; incomingItemId: string; durationInFrames?: number; type?: string }>;
  markers: Array<{ id: string; fromFrame: number; durationFrames: number; note?: string; color?: string }>;
  captions?: unknown;
};

export type NarrationAtomicAction =
  | { type: 'track.create'; track: { id: string; kind: 'audio' | 'caption'; name?: string } }
  | { type: 'remove'; id: string }
  | {
    type: 'add';
    item: Record<string, unknown>;
    startFrame?: number;
    ripple?: boolean;
  }
  | { type: 'move'; id: string; startFrame: number; ripple?: boolean }
  | { type: 'retime'; id: string; durationInFrames: number; ripple?: boolean }
  | { type: 'patchItem'; id: string; patch: Record<string, unknown> }
  | { type: 'setCaptions'; captions: Record<string, unknown> }
  | { type: 'setTransition'; id: string; patch: Record<string, unknown> }
  | { type: 'addMarker'; marker: Record<string, unknown> }
  | { type: 'removeMarker'; id: string };

function readVideoPlanMeta(item: NarrationTimelineLike['items'][number]): {
  planId?: string;
  planHash?: string;
  sceneEntryId?: string;
  assemblyId?: string;
} | null {
  const raw = item.props?.[BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as { planId?: string; planHash?: string; sceneEntryId?: string; assemblyId?: string };
}

function readNarrationMeta(item: NarrationTimelineLike['items'][number]): NarrationTimelineMetadataV1 | null {
  const raw = item.props?.[BETTER_CHAT_CUT_NARRATION_PROPS_KEY];
  if (!raw || typeof raw !== 'object') return null;
  return raw as NarrationTimelineMetadataV1;
}

export function computeNarrationAssemblyId(planId: string, timingHash: string): string {
  const tail = planId.includes('.') ? planId.slice(planId.indexOf('.') + 1) : planId;
  return `narration-assembly.${tail}.${timingHash.slice(0, 8)}`;
}

export function computeNarrationApplyInputHash(input: {
  timingHash: string;
  timelineId: string;
  audioTrack: string;
  captionTrack?: string;
  sourceType: string;
  conflictPolicy: string;
  replaceTemporaryTts: boolean;
}): string {
  return sha256Hex(stableStringify(input));
}

function listTracks(timeline: NarrationTimelineLike): Array<{ id: string; kind?: string; locked?: boolean; name?: string }> {
  const tracks = timeline.tracks ?? {};
  return Object.entries(tracks).map(([id, flags]) => ({ id, ...flags }));
}

function resolveAudioTrack(timeline: NarrationTimelineLike, requested?: string): { trackId: string; create: boolean; errors: NarrationDiagnostic[] } {
  const errors: NarrationDiagnostic[] = [];
  const tracks = listTracks(timeline);
  if (requested) {
    const existing = tracks.find((t) => t.id === requested || t.name === requested);
    if (!existing) {
      return { trackId: requested, create: true, errors };
    }
    if (existing.kind !== 'audio') {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', `Track ${requested} is not audio`, {
        recovery: 'Pass an audio track id/alias',
      }));
    }
    if (existing.locked) {
      errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', `Audio track ${requested} is locked`));
    }
    return { trackId: existing.id, create: false, errors };
  }
  const a1 = tracks.find((t) => t.id === 'A1' || t.name === 'A1');
  if (a1 && a1.kind === 'audio') {
    if (a1.locked) errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', 'A1 is locked'));
    return { trackId: a1.id, create: false, errors };
  }
  const anyAudio = tracks.find((t) => t.kind === 'audio' && !t.locked);
  if (anyAudio) return { trackId: anyAudio.id, create: false, errors };
  return { trackId: 'A1', create: true, errors };
}

function resolveCaptionTrack(timeline: NarrationTimelineLike, requested?: string): { trackId: string; create: boolean } {
  const tracks = listTracks(timeline);
  if (requested) {
    const existing = tracks.find((t) => t.id === requested || t.name === requested);
    if (existing) return { trackId: existing.id, create: false };
    return { trackId: requested, create: true };
  }
  const c1 = tracks.find((t) => t.id === 'C1' || t.name === 'C1' || t.kind === 'caption');
  if (c1) return { trackId: c1.id, create: false };
  return { trackId: 'C1', create: true };
}

export function previewNarrationTimelineApply(input: {
  timingSnapshot: NarrationTimingSnapshotV1;
  timeline: NarrationTimelineLike;
  audioTrack?: string;
  captionTrack?: string;
  timingConflictPolicy?: NarrationTimingConflictPolicy;
  replaceTemporaryTts?: boolean;
}): NarrationTimelineApplyPreviewV1 {
  const errors: NarrationDiagnostic[] = [];
  const warnings: NarrationDiagnostic[] = [];
  const snap = input.timingSnapshot;
  const policy = input.timingConflictPolicy ?? 'require-clear';
  const replaceTemporaryTts = input.replaceTemporaryTts === true || snap.source.type === 'voiceover';

  const audioTrack = resolveAudioTrack(input.timeline, input.audioTrack);
  errors.push(...audioTrack.errors);
  const captionsEnabled = true;
  const captionTrack = captionsEnabled
    ? resolveCaptionTrack(input.timeline, input.captionTrack)
    : undefined;

  const sceneItems = input.timeline.items
    .map((item) => ({ item, meta: readVideoPlanMeta(item) }))
    .filter((x) => x.meta?.planId === snap.baseVideoPlanId || x.meta?.planHash === snap.baseVideoPlanHash || x.meta?.sceneEntryId);

  const visualChanges = [];
  for (const timed of snap.scenes) {
    const found = sceneItems.find((x) => x.meta?.sceneEntryId === timed.sceneEntryId);
    if (!found) {
      if (timed.segments.length > 0) {
        errors.push(narrationDiagnostic('error', 'NARRATION_VIDEO_ASSEMBLY_DRIFTED', `Missing assembled scene clip for ${timed.sceneEntryId}`, {
          sceneEntryId: timed.sceneEntryId,
          recovery: 'Assemble the base/timed VideoPlan before applying narration',
        }));
      }
      continue;
    }
    // Absolute start = assembly start + relative
    const assemblyStart = Math.min(...sceneItems.map((x) => x.item.startFrame));
    const nextStart = assemblyStart + timed.relativeStartFrame;
    visualChanges.push({
      sceneEntryId: timed.sceneEntryId,
      itemId: found.item.id,
      previousStartFrame: found.item.startFrame,
      nextStartFrame: nextStart,
      previousDurationInFrames: found.item.durationInFrames,
      nextDurationInFrames: timed.durationInFrames,
    });
  }

  const assemblyStart = sceneItems.length
    ? Math.min(...sceneItems.map((x) => x.item.startFrame))
    : 0;
  const assemblyEnd = visualChanges.length
    ? Math.max(...visualChanges.map((v) => v.nextStartFrame + v.nextDurationInFrames))
    : assemblyStart;

  const audioItems = [];
  if (snap.source.type === 'temporary-tts') {
    for (const scene of snap.scenes) {
      if (!scene.segments.length) continue;
      audioItems.push({
        sourceType: 'temporary-tts' as const,
        sceneEntryIds: [scene.sceneEntryId],
        startFrame: assemblyStart + scene.relativeStartFrame,
        durationInFrames: scene.durationInFrames,
        transcriptWordCount: snap.captionWords.filter((w) =>
          w.start >= 0).length,
        timingQuality: scene.segments[0]?.timingQuality ?? 'estimated-word',
      });
    }
  } else {
    const totalFrames = Math.max(
      1,
      ...snap.scenes.map((s) => s.relativeEndFrame),
      msToTimelineFrames(
        Math.max(...snap.captionWords.map((w) => w.end), 1),
        snap.timelineFps,
      ),
    );
    audioItems.push({
      sourceType: 'voiceover' as const,
      sceneEntryIds: snap.scenes.map((s) => s.sceneEntryId),
      startFrame: assemblyStart,
      durationInFrames: totalFrames,
      transcriptWordCount: snap.captionWords.length,
      timingQuality: 'voiceover-transcript',
    });
  }

  const conflictingItemIds: string[] = [];
  const rippleAffectedItemIds: string[] = [];
  for (const item of input.timeline.items) {
    if (item.track !== audioTrack.trackId) {
      // Check video track collisions past previous assembly end when expanding
      const meta = readVideoPlanMeta(item);
      if (meta?.sceneEntryId) continue;
      if (item.startFrame >= assemblyEnd) {
        if (policy === 'ripple-after-assembly') rippleAffectedItemIds.push(item.id);
      }
      continue;
    }
    const narrMeta = readNarrationMeta(item);
    if (narrMeta && narrMeta.timingHash === snap.timingHash) continue;
    if (narrMeta && replaceTemporaryTts && narrMeta.sourceType === 'temporary-tts') continue;
    if (item.startFrame < assemblyEnd && item.startFrame + item.durationInFrames > assemblyStart) {
      if (!narrMeta || narrMeta.timingHash !== snap.timingHash) {
        conflictingItemIds.push(item.id);
      }
    }
  }

  if (policy === 'require-clear' && conflictingItemIds.length) {
    errors.push(narrationDiagnostic('error', 'NARRATION_INVALID_TIMING', 'Narration audio range is not clear', {
      details: { conflictingItemIds },
      recovery: 'Clear the audio track range or use ripple-after-assembly',
    }));
  }

  const cues = buildSubtitleCues({ words: snap.captionWords, pacing: 'phrase' });

  return {
    narrationPlanId: snap.narrationPlanId,
    narrationPlanHash: snap.narrationPlanHash,
    timingHash: snap.timingHash,
    timelineId: input.timeline.id,
    videoAssembly: {
      planId: snap.baseVideoPlanId,
      currentPlanHash: snap.baseVideoPlanHash,
      resultingPlanHash: snap.timedVideoPlanHash,
      retimeRequired: visualChanges.some((v) =>
        v.previousStartFrame !== v.nextStartFrame || v.previousDurationInFrames !== v.nextDurationInFrames),
    },
    audioTrack: { trackId: audioTrack.trackId, create: audioTrack.create },
    captionTrack: captionTrack ? { trackId: captionTrack.trackId, create: captionTrack.create } : undefined,
    visualChanges,
    audioItems,
    captions: {
      enabled: true,
      cueCount: cues.length,
      timingQuality: snap.source.type === 'voiceover' ? 'voiceover-transcript' : 'estimated-word',
    },
    collisionAnalysis: {
      clear: conflictingItemIds.length === 0,
      conflictingItemIds,
      rippleAffectedItemIds,
    },
    errors,
    warnings,
  };
}

export function planNarrationTimelineApply(input: {
  timingSnapshot: NarrationTimingSnapshotV1;
  timeline: NarrationTimelineLike;
  requestId: string;
  audioTrack?: string;
  captionTrack?: string;
  timingConflictPolicy?: NarrationTimingConflictPolicy;
  replaceTemporaryTts?: boolean;
  uid: (prefix: string) => string;
  sceneAudioMedia?: Map<string, { src: string; durationInFrames: number; transcript: Array<{ text: string; start: number; end: number }>; sourceRevision: string }>;
  voiceoverMedia?: { src: string; durationInFrames: number; transcript: Array<{ text: string; start: number; end: number }>; sourceRevision: string; mediaAssetId?: string };
}): { preview: NarrationTimelineApplyPreviewV1; actions: NarrationAtomicAction[]; result: NarrationTimelineApplyResultV1 } {
  const preview = previewNarrationTimelineApply(input);
  const actions: NarrationAtomicAction[] = [];
  const snap = input.timingSnapshot;
  const replaceTemporaryTts = input.replaceTemporaryTts === true || snap.source.type === 'voiceover';
  const applyInputHash = computeNarrationApplyInputHash({
    timingHash: snap.timingHash,
    timelineId: input.timeline.id,
    audioTrack: preview.audioTrack.trackId,
    captionTrack: preview.captionTrack?.trackId,
    sourceType: snap.source.type,
    conflictPolicy: input.timingConflictPolicy ?? 'require-clear',
    replaceTemporaryTts,
  });
  const assemblyId = computeNarrationAssemblyId(snap.narrationPlanId, snap.timingHash);

  // Idempotent replay
  const existing = input.timeline.items
    .map(readNarrationMeta)
    .filter((m): m is NarrationTimelineMetadataV1 => !!m)
    .find((m) => m.applyRequestId === input.requestId);
  if (existing) {
    if (existing.applyInputHash !== applyInputHash) {
      return {
        preview: {
          ...preview,
          errors: [
            ...preview.errors,
            narrationDiagnostic('error', 'NARRATION_REQUEST_ID_REUSE_CONFLICT', 'requestId reused with different narration apply input'),
          ],
        },
        actions: [],
        result: {
          ok: false,
          replayed: false,
          narrationAssemblyId: assemblyId,
          timingHash: snap.timingHash,
          actionSummary: 'Narration apply blocked (request conflict)',
          appliedActionCount: 0,
          errors: preview.errors,
          warnings: preview.warnings,
        },
      };
    }
    return {
      preview,
      actions: [],
      result: {
        ok: true,
        replayed: true,
        narrationAssemblyId: existing.narrationAssemblyId,
        timingHash: existing.timingHash,
        actionSummary: 'Narration apply replayed (idempotent)',
        appliedActionCount: 0,
        errors: [],
        warnings: preview.warnings,
      },
    };
  }

  const already = input.timeline.items
    .map(readNarrationMeta)
    .filter((m): m is NarrationTimelineMetadataV1 => !!m)
    .find((m) => m.timingHash === snap.timingHash && m.sourceType === snap.source.type);
  if (already && !(replaceTemporaryTts && already.sourceType === 'temporary-tts' && snap.source.type === 'voiceover')) {
    return {
      preview,
      actions: [],
      result: {
        ok: true,
        replayed: true,
        narrationAssemblyId: already.narrationAssemblyId,
        timingHash: already.timingHash,
        actionSummary: 'Narration timing already applied',
        appliedActionCount: 0,
        errors: [],
        warnings: [
          ...preview.warnings,
          narrationDiagnostic('info', 'NARRATION_TIMING_ALREADY_APPLIED', 'Same timing already on timeline'),
        ],
      },
    };
  }

  if (preview.errors.some((e) => e.severity === 'error')) {
    return {
      preview,
      actions: [],
      result: {
        ok: false,
        replayed: false,
        narrationAssemblyId: assemblyId,
        timingHash: snap.timingHash,
        actionSummary: 'Narration apply blocked',
        appliedActionCount: 0,
        errors: preview.errors,
        warnings: preview.warnings,
      },
    };
  }

  if (preview.audioTrack.create) {
    actions.push({ type: 'track.create', track: { id: preview.audioTrack.trackId, kind: 'audio', name: preview.audioTrack.trackId } });
  }
  if (preview.captionTrack?.create) {
    actions.push({ type: 'track.create', track: { id: preview.captionTrack.trackId, kind: 'caption', name: preview.captionTrack.trackId } });
  }

  if (replaceTemporaryTts) {
    for (const item of input.timeline.items) {
      const meta = readNarrationMeta(item);
      if (meta?.sourceType === 'temporary-tts'
        && meta.narrationPlanId === snap.narrationPlanId) {
        actions.push({ type: 'remove', id: item.id });
      }
    }
  }

  for (const change of preview.visualChanges) {
    if (change.previousStartFrame !== change.nextStartFrame) {
      actions.push({ type: 'move', id: change.itemId, startFrame: change.nextStartFrame });
    }
    if (change.previousDurationInFrames !== change.nextDurationInFrames) {
      actions.push({ type: 'retime', id: change.itemId, durationInFrames: change.nextDurationInFrames });
    }
    actions.push({
      type: 'patchItem',
      id: change.itemId,
      patch: {
        props: {
          ...(input.timeline.items.find((i) => i.id === change.itemId)?.props ?? {}),
          [BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY]: {
            ...(readVideoPlanMeta(input.timeline.items.find((i) => i.id === change.itemId)!) ?? {}),
            planHash: snap.timedVideoPlanHash,
            planId: snap.timedVideoPlan.id,
          },
        },
      },
    });
  }

  const metaBase: Omit<NarrationTimelineMetadataV1, 'sceneEntryIds' | 'segmentIds'> = {
    schemaVersion: '1.0.0',
    narrationAssemblyId: assemblyId,
    narrationPlanId: snap.narrationPlanId,
    narrationPlanHash: snap.narrationPlanHash,
    timingHash: snap.timingHash,
    timedVideoPlanHash: snap.timedVideoPlanHash,
    sourceType: snap.source.type === 'voiceover' ? 'voiceover' : 'temporary-tts',
    applyRequestId: input.requestId,
    applyInputHash,
  };

  if (snap.source.type === 'temporary-tts') {
    for (const scene of snap.scenes) {
      if (!scene.segments.length) continue;
      const media = input.sceneAudioMedia?.get(scene.sceneEntryId);
      const itemId = input.uid('narration');
      const assemblyStart = preview.visualChanges[0]
        ? Math.min(...preview.visualChanges.map((v) => v.nextStartFrame))
        : 0;
      actions.push({
        type: 'add',
        startFrame: assemblyStart + scene.relativeStartFrame,
        item: {
          id: itemId,
          track: preview.audioTrack.trackId,
          kind: 'audio',
          name: `Narration — ${scene.sceneEntryId}`,
          src: media?.src ?? `narration://${scene.sceneEntryId}`,
          durationInFrames: media?.durationInFrames ?? scene.durationInFrames,
          sourceRevision: media?.sourceRevision ?? snap.timingHash.slice(0, 16),
          transcript: media?.transcript ?? snap.captionWords,
          props: {
            [BETTER_CHAT_CUT_NARRATION_PROPS_KEY]: {
              ...metaBase,
              sceneEntryIds: [scene.sceneEntryId],
              segmentIds: scene.segments.map((s) => s.segmentId),
            } satisfies NarrationTimelineMetadataV1,
          },
        },
      });
    }
  } else if (input.voiceoverMedia) {
    const itemId = input.uid('narration');
    const assemblyStart = preview.visualChanges.length
      ? Math.min(...preview.visualChanges.map((v) => v.nextStartFrame))
      : 0;
    actions.push({
      type: 'add',
      startFrame: assemblyStart,
      item: {
        id: itemId,
        track: preview.audioTrack.trackId,
        kind: 'audio',
        name: 'Narration — voiceover',
        src: input.voiceoverMedia.src,
        durationInFrames: input.voiceoverMedia.durationInFrames,
        sourceRevision: input.voiceoverMedia.sourceRevision,
        transcript: input.voiceoverMedia.transcript,
        props: {
          [BETTER_CHAT_CUT_NARRATION_PROPS_KEY]: {
            ...metaBase,
            sceneEntryIds: snap.scenes.map((s) => s.sceneEntryId),
            segmentIds: snap.scenes.flatMap((s) => s.segments.map((seg) => seg.segmentId)),
          } satisfies NarrationTimelineMetadataV1,
        },
      },
    });
  }

  // Caption data referencing narration audio items (track-level)
  const cues = buildSubtitleCues({ words: snap.captionWords, pacing: 'phrase' });
  actions.push({
    type: 'setCaptions',
    captions: {
      enabled: true,
      template: 'black-bar',
      pacing: 'phrase',
      sourceMode: 'narration-items',
      words: snap.captionWords,
      cueCount: cues.length,
      timingQuality: snap.source.type === 'voiceover' ? 'voiceover-transcript' : 'estimated-word',
      narrationAssemblyId: assemblyId,
      timingHash: snap.timingHash,
    },
  });

  return {
    preview,
    actions,
    result: {
      ok: true,
      replayed: false,
      narrationAssemblyId: assemblyId,
      timingHash: snap.timingHash,
      actionSummary: `Apply narration (${snap.source.type})`,
      appliedActionCount: actions.length,
      errors: [],
      warnings: preview.warnings,
    },
  };
}

export { readNarrationMeta, readVideoPlanMeta, BETTER_CHAT_CUT_NARRATION_PROPS_KEY };
