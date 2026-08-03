import type { NarrationPlanV1 } from '../contracts/narration-plan.ts';
import type { NarrationWordV1, NarrationTimingSnapshotV1, NarrationTimedSceneV1 } from '../contracts/narration-timing.ts';
import { narrationDiagnostic, type NarrationDiagnostic } from '../contracts/narration-errors.ts';
import { validateNarrationPlan } from '../schema/narration-validator.ts';
import { deepCloneJson, sha256Hex, stableStringify } from '../schema/narration-serialization.ts';
import { computeNarrationRuntimeRevision } from '../schema/narration-runtime-revision.ts';
import { validateVideoPlan } from '../../../video-plans/src/schema/video-plan-validator.ts';
import { computeVideoPlanHash } from '../../../video-plans/src/schema/video-plan-hash.ts';
import { createVideoPlanSchedule } from '../../../video-plans/src/schedule/sequence-scheduler.ts';
import { sceneDurationToTimelineFrames } from '../../../project-scene-bindings/src/timeline/scene-clip-item-builder.ts';
import { framesToMs, msToTimelineFrames, resolveSceneDurationMs } from './scene-duration-policy.ts';
import { estimateWordTimings } from './estimated-word-timing.ts';

export type SegmentAudioTimingInput = {
  segmentId: string;
  sceneEntryId: string;
  speakerId: string;
  durationMs: number;
  words: NarrationWordV1[];
  timingQuality: string;
  audioArtifactId?: string;
  pauseBeforeMs: number;
  pauseAfterMs: number;
};

export type SceneAudioTimingInput = {
  sceneEntryId: string;
  leadInMs: number;
  tailOutMs: number;
  segments: SegmentAudioTimingInput[];
  sceneAudioDurationMs: number;
  words: NarrationWordV1[];
  wordTimingQuality: string;
};

export function computeNarrationTimingHash(snapshotWithoutHash: Omit<NarrationTimingSnapshotV1, 'timingHash'>): string {
  return sha256Hex(stableStringify({
    ...snapshotWithoutHash,
    narrationRuntimeRevision: computeNarrationRuntimeRevision(),
  }));
}

export function resolveTemporaryTtsTiming(input: {
  narrationPlan: unknown;
  sceneAudios: SceneAudioTimingInput[];
  synthesisManifestHash: string;
}): {
  timingSnapshot: NarrationTimingSnapshotV1 | null;
  missingSegmentIds: string[];
  errors: NarrationDiagnostic[];
  warnings: NarrationDiagnostic[];
} {
  const errors: NarrationDiagnostic[] = [];
  const warnings: NarrationDiagnostic[] = [];
  const validated = validateNarrationPlan(input.narrationPlan);
  errors.push(...validated.errors);
  warnings.push(...validated.warnings);
  if (!validated.valid || !validated.normalizedPlan || !validated.narrationPlanHash) {
    return { timingSnapshot: null, missingSegmentIds: [], errors, warnings };
  }

  const plan = validated.normalizedPlan;
  const planHash = validated.narrationPlanHash;
  const fps = plan.videoPlan.output.fps;
  const baseVideoPlanHash = computeVideoPlanHash(plan.videoPlan);

  const expectedSegments = plan.scenes.flatMap((s) => s.segments.map((seg) => ({
    segmentId: seg.id,
    sceneEntryId: s.sceneEntryId,
  })));
  const provided = new Map(
    input.sceneAudios.flatMap((scene) => scene.segments.map((seg) => [seg.segmentId, seg] as const)),
  );
  const missingSegmentIds = expectedSegments
    .filter((s) => !provided.has(s.segmentId))
    .map((s) => s.segmentId);
  if (missingSegmentIds.length > 0) {
    errors.push(narrationDiagnostic('error', 'NARRATION_TTS_ARTIFACT_MISSING', 'Missing TTS artifacts for segments', {
      details: { missingSegmentIds },
      recovery: 'Run narration_tts_prepare until all segments succeed',
    }));
    return { timingSnapshot: null, missingSegmentIds, errors, warnings };
  }

  const sceneAudioById = new Map(input.sceneAudios.map((s) => [s.sceneEntryId, s]));
  const timedVideoPlan = deepCloneJson(plan.videoPlan);
  const timedScenes: NarrationTimedSceneV1[] = [];
  const captionWords: NarrationWordV1[] = [];
  let absoluteCaptionOffsetMs = 0;

  // Build schedule with original durations first to know visual lengths
  const baseSchedule = createVideoPlanSchedule(plan.videoPlan);
  errors.push(...baseSchedule.errors.map((d) => narrationDiagnostic(d.severity, 'NARRATION_VIDEO_PLAN_INVALID', d.message, {
    details: d.details,
    recovery: d.recovery,
  })));
  if (baseSchedule.errors.length > 0) {
    return { timingSnapshot: null, missingSegmentIds, errors, warnings };
  }

  const baseEntryById = new Map(baseSchedule.schedule.entries.map((e) => [e.entryId, e]));

  for (const sceneEntry of timedVideoPlan.scenes) {
    const narrationScene = plan.scenes.find((s) => s.sceneEntryId === sceneEntry.id);
    const baseEntry = baseEntryById.get(sceneEntry.id)!;
    const visualDurationMs = framesToMs(baseEntry.durationInFrames, fps);

    if (!narrationScene || narrationScene.segments.length === 0) {
      // Preserve original duration mode
      timedScenes.push({
        sceneEntryId: sceneEntry.id,
        relativeStartFrame: 0,
        durationInFrames: baseEntry.durationInFrames,
        relativeEndFrame: baseEntry.durationInFrames,
        narrationStartFrame: 0,
        narrationEndFrame: 0,
        segments: [],
        warnings: [],
      });
      absoluteCaptionOffsetMs += visualDurationMs + framesToMs(baseEntry.gapAfterFrames, fps);
      continue;
    }

    const sceneAudio = sceneAudioById.get(sceneEntry.id);
    if (!sceneAudio) {
      errors.push(narrationDiagnostic('error', 'NARRATION_TTS_ARTIFACT_MISSING', `Missing scene audio for ${sceneEntry.id}`, {
        sceneEntryId: sceneEntry.id,
      }));
      continue;
    }

    const policy = narrationScene.sceneDurationPolicy ?? plan.defaults?.sceneDurationPolicy ?? 'fit-narration';
    const resolved = resolveSceneDurationMs({
      policy,
      visualDurationMs,
      narrationRequiredMs: sceneAudio.sceneAudioDurationMs,
      sceneEntryId: sceneEntry.id,
    });
    errors.push(...resolved.errors);
    warnings.push(...resolved.warnings);
    if (resolved.errors.length > 0) continue;

    const durationInFrames = msToTimelineFrames(resolved.durationMs, fps);
    sceneEntry.duration = { mode: 'timeline-frames', timelineFrames: durationInFrames };

    const sceneWarnings: NarrationDiagnostic[] = [...resolved.warnings];
    let segCursorMs = sceneAudio.leadInMs;
    const timedSegs: NarrationTimedSceneV1['segments'] = [];
    for (const seg of sceneAudio.segments) {
      segCursorMs += seg.pauseBeforeMs;
      const startMs = segCursorMs;
      const endMs = startMs + seg.durationMs;
      timedSegs.push({
        segmentId: seg.segmentId,
        startFrame: msToTimelineFrames(startMs, fps) - 1 > 0 ? msToTimelineFrames(startMs, fps) : Math.floor((startMs / 1000) * fps),
        endFrame: msToTimelineFrames(endMs, fps),
        startMs,
        endMs,
        speakerId: seg.speakerId,
        audioArtifactId: seg.audioArtifactId,
        timingQuality: seg.timingQuality,
      });
      // Offset words into absolute caption timeline (scene start relative)
      for (const w of seg.words) {
        captionWords.push({
          text: w.text,
          start: absoluteCaptionOffsetMs + startMs + w.start,
          end: absoluteCaptionOffsetMs + startMs + w.end,
          speaker: w.speaker,
        });
      }
      segCursorMs = endMs + seg.pauseAfterMs;
    }

    timedScenes.push({
      sceneEntryId: sceneEntry.id,
      relativeStartFrame: 0,
      durationInFrames,
      relativeEndFrame: durationInFrames,
      narrationStartFrame: Math.floor((sceneAudio.leadInMs / 1000) * fps),
      narrationEndFrame: Math.floor(((sceneAudio.sceneAudioDurationMs - sceneAudio.tailOutMs) / 1000) * fps),
      segments: timedSegs,
      warnings: sceneWarnings,
    });

    absoluteCaptionOffsetMs += framesToMs(durationInFrames, fps) + framesToMs(baseEntry.gapAfterFrames, fps);
  }

  if (errors.some((e) => e.severity === 'error')) {
    return { timingSnapshot: null, missingSegmentIds, errors, warnings };
  }

  // Recompute relative frames from timed schedule
  const timedValidation = validateVideoPlan(timedVideoPlan, { includeSchedule: true });
  errors.push(...timedValidation.errors.map((d) => narrationDiagnostic(d.severity, 'NARRATION_VIDEO_PLAN_INVALID', d.message, {
    details: d.details,
    recovery: d.recovery,
  })));
  warnings.push(...timedValidation.warnings.map((d) => narrationDiagnostic(d.severity, 'NARRATION_VIDEO_PLAN_INVALID', d.message)));
  if (!timedValidation.valid || !timedValidation.normalizedPlan || !timedValidation.planHash || !timedValidation.schedule) {
    return { timingSnapshot: null, missingSegmentIds, errors, warnings };
  }

  const scheduleEntries = new Map(timedValidation.schedule.entries.map((e) => [e.entryId, e]));
  for (const scene of timedScenes) {
    const entry = scheduleEntries.get(scene.sceneEntryId);
    if (!entry) continue;
    scene.relativeStartFrame = entry.relativeStartFrame;
    scene.relativeEndFrame = entry.relativeEndFrame;
    scene.durationInFrames = entry.durationInFrames;
    scene.narrationStartFrame = entry.relativeStartFrame + scene.narrationStartFrame;
    scene.narrationEndFrame = entry.relativeStartFrame + Math.min(scene.narrationEndFrame, entry.durationInFrames);
    for (const seg of scene.segments) {
      seg.startFrame = entry.relativeStartFrame + Math.floor((seg.startMs / 1000) * fps);
      seg.endFrame = entry.relativeStartFrame + Math.floor((seg.endMs / 1000) * fps);
    }
  }

  const withoutHash: Omit<NarrationTimingSnapshotV1, 'timingHash'> = {
    schemaVersion: '1.0.0',
    narrationPlanId: plan.id,
    narrationPlanHash: planHash,
    baseVideoPlanId: plan.videoPlan.id,
    baseVideoPlanHash,
    source: { type: 'temporary-tts', synthesisManifestHash: input.synthesisManifestHash },
    timelineFps: fps,
    scenes: timedScenes,
    timedVideoPlan: timedValidation.normalizedPlan,
    timedVideoPlanHash: timedValidation.planHash,
    captionWords,
    errors: [],
    warnings: [...warnings],
  };

  const timingSnapshot: NarrationTimingSnapshotV1 = {
    ...withoutHash,
    timingHash: computeNarrationTimingHash(withoutHash),
  };

  return { timingSnapshot, missingSegmentIds, errors, warnings };
}

/** Build scene audio timing inputs from per-segment durations (no filesystem). */
export function buildSceneAudioTimingFromSegments(input: {
  narrationPlan: NarrationPlanV1;
  segmentArtifacts: Map<string, {
    durationMs: number;
    words: NarrationWordV1[];
    timingQuality: string;
    audioArtifactId?: string;
  }>;
}): SceneAudioTimingInput[] {
  return input.narrationPlan.scenes.map((scene) => {
    const leadInMs = scene.leadInMs ?? input.narrationPlan.defaults?.leadInMs ?? 250;
    const tailOutMs = scene.tailOutMs ?? input.narrationPlan.defaults?.tailOutMs ?? 350;
    let total = leadInMs;
    const segments: SegmentAudioTimingInput[] = [];
    const words: NarrationWordV1[] = [];
    const qualities = new Set<string>();

    for (const seg of scene.segments) {
      const art = input.segmentArtifacts.get(seg.id);
      if (!art) continue;
      const pauseBeforeMs = seg.pauseBeforeMs ?? 0;
      const pauseAfterMs = seg.pauseAfterMs ?? input.narrationPlan.defaults?.pauseBetweenSegmentsMs ?? 120;
      total += pauseBeforeMs;
      const offset = total;
      for (const w of art.words) {
        words.push({ ...w, start: offset + w.start, end: offset + w.end });
      }
      segments.push({
        segmentId: seg.id,
        sceneEntryId: scene.sceneEntryId,
        speakerId: seg.speakerId ?? input.narrationPlan.speakers[0]!.id,
        durationMs: art.durationMs,
        words: art.words,
        timingQuality: art.timingQuality,
        audioArtifactId: art.audioArtifactId,
        pauseBeforeMs,
        pauseAfterMs,
      });
      qualities.add(art.timingQuality);
      total += art.durationMs + pauseAfterMs;
    }
    total += tailOutMs;

    let wordTimingQuality = 'estimated-word';
    if (qualities.size === 1) wordTimingQuality = [...qualities][0]!;
    else if (qualities.size > 1) wordTimingQuality = 'mixed';

    return {
      sceneEntryId: scene.sceneEntryId,
      leadInMs,
      tailOutMs,
      segments,
      sceneAudioDurationMs: total,
      words,
      wordTimingQuality,
    };
  }).filter((s) => s.segments.length > 0);
}

export function estimateSegmentWords(text: string, durationMs: number, language: string): NarrationWordV1[] {
  return estimateWordTimings({ text, durationMs, language });
}

export function visualDurationMsForScene(
  plan: NarrationPlanV1,
  sceneEntryId: string,
): number {
  const entry = plan.videoPlan.scenes.find((s) => s.id === sceneEntryId);
  if (!entry) return 0;
  const frames = entry.duration?.mode === 'timeline-frames' && entry.duration.timelineFrames
    ? entry.duration.timelineFrames
    : sceneDurationToTimelineFrames({
      sceneDurationInFrames: entry.binding.scene.durationInFrames,
      sceneFps: entry.binding.scene.fps,
      timelineFps: plan.videoPlan.output.fps,
    });
  return framesToMs(frames, plan.videoPlan.output.fps);
}
