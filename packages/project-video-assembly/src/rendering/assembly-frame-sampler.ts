import { MAX_RENDER_VALIDATION_SAMPLE_FRAMES } from '../../../video-plans/src/contracts/video-plan-policy.ts';
import type { VideoPlanScheduleV1 } from '../../../video-plans/src/contracts/video-plan-schedule.ts';

export type SampleFrameReason = {
  frame: number;
  reasons: string[];
};

export function selectAssemblySampleFrames(input: {
  absoluteStartFrame: number;
  totalDurationInFrames: number;
  schedule: VideoPlanScheduleV1;
  includeTransitionSamples?: boolean;
  maxFrames?: number;
}): { frames: SampleFrameReason[]; truncated: boolean } {
  const includeTransitions = input.includeTransitionSamples !== false;
  const maxFrames = input.maxFrames ?? MAX_RENDER_VALIDATION_SAMPLE_FRAMES;
  const start = input.absoluteStartFrame;
  const endExclusive = start + input.totalDurationInFrames;
  const last = Math.max(start, endExclusive - 1);
  const byFrame = new Map<number, Set<string>>();

  const add = (frame: number, reason: string) => {
    const clamped = Math.max(start, Math.min(last, frame));
    if (!Number.isInteger(clamped)) return;
    const reasons = byFrame.get(clamped) ?? new Set<string>();
    reasons.add(reason);
    byFrame.set(clamped, reasons);
  };

  add(start, 'assembly-first');
  add(last, 'assembly-last');

  for (const entry of input.schedule.entries) {
    const absStart = start + entry.relativeStartFrame;
    const absLast = Math.max(absStart, start + entry.relativeEndFrame - 1);
    const mid = absStart + Math.floor(entry.durationInFrames / 2);
    add(absStart, `scene:${entry.entryId}:first`);
    add(mid, `scene:${entry.entryId}:middle`);
    add(absLast, `scene:${entry.entryId}:last`);
  }

  if (includeTransitions) {
    for (const tr of input.schedule.transitions) {
      const cut = start + tr.relativeCutFrame;
      const half = Math.floor(tr.durationInFrames / 2);
      add(cut - half, `transition:${tr.outgoingEntryId}->${tr.incomingEntryId}:pre`);
      add(cut, `transition:${tr.outgoingEntryId}->${tr.incomingEntryId}:cut`);
      add(cut + half - 1, `transition:${tr.outgoingEntryId}->${tr.incomingEntryId}:post`);
    }
  }

  let frames = [...byFrame.entries()]
    .map(([frame, reasons]) => ({ frame, reasons: [...reasons].sort() }))
    .sort((a, b) => a.frame - b.frame);

  let truncated = false;
  if (frames.length > maxFrames) {
    truncated = true;
    const keep = new Set<number>();
    keep.add(start);
    keep.add(last);
    for (const entry of input.schedule.entries) {
      const absStart = start + entry.relativeStartFrame;
      const absLast = Math.max(absStart, start + entry.relativeEndFrame - 1);
      keep.add(absStart);
      keep.add(absStart + Math.floor(entry.durationInFrames / 2));
      keep.add(absLast);
    }
    if (includeTransitions && input.schedule.transitions.length) {
      const step = Math.max(1, Math.floor(input.schedule.transitions.length / Math.max(1, Math.floor(maxFrames / 4))));
      for (let i = 0; i < input.schedule.transitions.length; i += step) {
        const tr = input.schedule.transitions[i]!;
        keep.add(start + tr.relativeCutFrame);
      }
    }
    // Stratified fill
    const all = frames.map((f) => f.frame);
    for (let i = 0; i < maxFrames && keep.size < maxFrames; i += 1) {
      const idx = Math.floor((i * (all.length - 1)) / Math.max(1, maxFrames - 1));
      keep.add(all[idx]!);
    }
    frames = frames.filter((f) => keep.has(f.frame)).slice(0, maxFrames);
  }

  return { frames, truncated };
}
