import { sceneDurationToTimelineFrames } from '../../../project-scene-bindings/src/timeline/scene-clip-item-builder.ts';
import type { VideoPlanV1 } from '../contracts/video-plan.ts';
import type {
  VideoPlanScheduleV1,
  VideoPlanScheduledMarkerV1,
  VideoPlanScheduledSceneV1,
  VideoPlanScheduledTransitionV1,
} from '../contracts/video-plan-schedule.ts';
import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../contracts/video-plan-errors.ts';
import { MAX_VIDEO_PLAN_DURATION_FRAMES } from '../contracts/video-plan-policy.ts';
import { computeVideoPlanHash } from '../schema/video-plan-hash.ts';

export function resolveSceneTimelineDuration(
  plan: VideoPlanV1,
  entryIndex: number,
): number {
  const entry = plan.scenes[entryIndex]!;
  if (entry.duration?.mode === 'timeline-frames' && typeof entry.duration.timelineFrames === 'number') {
    return entry.duration.timelineFrames;
  }
  return sceneDurationToTimelineFrames({
    sceneDurationInFrames: entry.binding.scene.durationInFrames,
    sceneFps: entry.binding.scene.fps,
    timelineFps: plan.output.fps,
  });
}

export function buildMarkerNote(
  plan: VideoPlanV1,
  entryIndex: number,
): string {
  const entry = plan.scenes[entryIndex]!;
  const prefix = plan.markers?.notePrefix ?? 'BCC Scene';
  if (entry.marker?.note) return `${prefix}: ${entry.marker.note}`;
  const name = entry.name ?? entry.binding.scene.name ?? entry.id;
  return `${prefix}: ${entry.id} — ${name}`;
}

export function createVideoPlanSchedule(plan: VideoPlanV1): {
  schedule: VideoPlanScheduleV1;
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
} {
  const errors: VideoPlanDiagnostic[] = [];
  const warnings: VideoPlanDiagnostic[] = [];
  const planHash = computeVideoPlanHash(plan);
  const entries: VideoPlanScheduledSceneV1[] = [];
  const transitions: VideoPlanScheduledTransitionV1[] = [];
  const markers: VideoPlanScheduledMarkerV1[] = [];

  let cursor = 0;
  for (let i = 0; i < plan.scenes.length; i += 1) {
    const entry = plan.scenes[i]!;
    const durationInFrames = resolveSceneTimelineDuration(plan, i);
    const gapAfterFrames = entry.gapAfterFrames ?? plan.defaults?.gapAfterFrames ?? 0;
    const relativeStartFrame = cursor;
    const relativeEndFrame = relativeStartFrame + durationInFrames;
    entries.push({
      entryId: entry.id,
      sequenceIndex: i,
      relativeStartFrame,
      durationInFrames,
      relativeEndFrame,
      gapAfterFrames,
      sceneId: entry.binding.scene.id,
      sceneContentHash: entry.binding.sceneContentHash,
      bindingPayloadHash: entry.binding.bindingPayloadHash,
    });

    const color = entry.marker?.color ?? plan.markers?.defaultColor ?? 'blue';
    const note = buildMarkerNote(plan, i);
    const mode = plan.markers?.mode ?? 'boundary';
    if (mode === 'boundary' || mode === 'both') {
      markers.push({
        sceneEntryId: entry.id,
        relativeFromFrame: relativeStartFrame,
        durationFrames: 0,
        note,
        color,
        kind: 'boundary',
      });
    }
    if (mode === 'range' || mode === 'both') {
      markers.push({
        sceneEntryId: entry.id,
        relativeFromFrame: relativeStartFrame,
        durationFrames: durationInFrames,
        note,
        color,
        kind: 'range',
      });
    }

    const next = plan.scenes[i + 1];
    const transition = entry.transitionToNext ?? plan.defaults?.transitionToNext ?? { mode: 'cut' as const };
    if (next && transition.mode === 'timeline-transition') {
      if (gapAfterFrames !== 0) {
        errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_REQUIRES_ADJACENCY', 'Transition requires adjacency', {
          sceneEntryId: entry.id,
        }));
      } else {
        transitions.push({
          outgoingEntryId: entry.id,
          incomingEntryId: next.id,
          relativeCutFrame: relativeEndFrame,
          type: transition.type,
          durationInFrames: transition.durationInFrames,
          direction: transition.direction ?? 'left',
        });
      }
    }

    cursor = relativeEndFrame + gapAfterFrames;
  }

  const totalDurationInFrames = cursor;
  if (totalDurationInFrames > MAX_VIDEO_PLAN_DURATION_FRAMES) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_DURATION_TOO_LONG', `Total duration ${totalDurationInFrames} exceeds ${MAX_VIDEO_PLAN_DURATION_FRAMES}`, {
      planId: plan.id,
      recovery: 'Reduce scenes, durations, or gaps',
    }));
  }

  const schedule: VideoPlanScheduleV1 = {
    schemaVersion: '1.0.0',
    planId: plan.id,
    planHash,
    fps: plan.output.fps,
    relativeStartFrame: 0,
    totalDurationInFrames,
    entries,
    transitions,
    markers,
  };

  return { schedule, errors, warnings };
}

export { resolveSceneTimelineDuration as durationConversion };
