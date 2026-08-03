import type { SceneDurationPolicy } from '../contracts/narration-policy.ts';
import { narrationDiagnostic, type NarrationDiagnostic } from '../contracts/narration-errors.ts';

export function resolveSceneDurationMs(input: {
  policy: SceneDurationPolicy;
  visualDurationMs: number;
  narrationRequiredMs: number;
  sceneEntryId: string;
}): { durationMs: number; errors: NarrationDiagnostic[]; warnings: NarrationDiagnostic[] } {
  const errors: NarrationDiagnostic[] = [];
  const warnings: NarrationDiagnostic[] = [];
  const visual = Math.max(0, input.visualDurationMs);
  const needed = Math.max(0, input.narrationRequiredMs);

  if (input.policy === 'fit-narration') {
    return { durationMs: Math.max(1, needed), errors, warnings };
  }
  if (input.policy === 'at-least-visual') {
    return { durationMs: Math.max(1, Math.max(visual, needed)), errors, warnings };
  }
  // preserve-video-plan
  if (needed > visual + 0.5) {
    errors.push(narrationDiagnostic('error', 'NARRATION_AUDIO_OVERFLOWS_SCENE', 'Narration overflows preserved VideoPlan scene duration', {
      sceneEntryId: input.sceneEntryId,
      details: { visualDurationMs: visual, narrationRequiredMs: needed },
      recovery: 'Shorten narration, switch policy, or extend the VideoPlan scene',
    }));
  } else if (needed > visual * 0.9) {
    warnings.push(narrationDiagnostic('warning', 'NARRATION_AUDIO_OVERFLOWS_SCENE', 'Narration nearly fills preserved scene duration', {
      sceneEntryId: input.sceneEntryId,
    }));
  }
  return { durationMs: Math.max(1, visual), errors, warnings };
}

export function msToTimelineFrames(durationMs: number, fps: number): number {
  return Math.max(1, Math.ceil((durationMs / 1000) * fps));
}

export function framesToMs(frames: number, fps: number): number {
  return Math.max(0, Math.round((frames / fps) * 1000));
}
