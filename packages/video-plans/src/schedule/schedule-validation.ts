import type { VideoPlanScheduleV1 } from '../contracts/video-plan-schedule.ts';
import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../contracts/video-plan-errors.ts';
import { MAX_VIDEO_PLAN_DURATION_FRAMES } from '../contracts/video-plan-policy.ts';

export function validateVideoPlanSchedule(schedule: VideoPlanScheduleV1): VideoPlanDiagnostic[] {
  const errors: VideoPlanDiagnostic[] = [];
  if (schedule.totalDurationInFrames > MAX_VIDEO_PLAN_DURATION_FRAMES) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_DURATION_TOO_LONG', 'Schedule total duration exceeds limit', {
      planId: schedule.planId,
    }));
  }
  let expected = 0;
  for (const entry of schedule.entries) {
    if (entry.relativeStartFrame !== expected) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_ASSEMBLY_DRIFTED', 'Schedule cursor drift detected', {
        sceneEntryId: entry.entryId,
        frame: entry.relativeStartFrame,
        details: { expected },
      }));
    }
    if (!Number.isInteger(entry.relativeStartFrame) || !Number.isInteger(entry.durationInFrames)
      || !Number.isFinite(entry.relativeStartFrame) || !Number.isFinite(entry.durationInFrames)) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_DURATION_INVALID', 'Non-finite schedule frames', {
        sceneEntryId: entry.entryId,
      }));
    }
    expected = entry.relativeEndFrame + entry.gapAfterFrames;
  }
  if (expected !== schedule.totalDurationInFrames) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_DURATION_TOO_LONG', 'totalDurationInFrames mismatch', {
      planId: schedule.planId,
      details: { expected, total: schedule.totalDurationInFrames },
    }));
  }
  return errors;
}
