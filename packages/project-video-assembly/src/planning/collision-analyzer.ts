import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type { AssemblyTimelineLike } from './track-resolver.ts';

export function analyzeAssemblyCollisions(input: {
  timeline: AssemblyTimelineLike;
  trackId: string;
  absoluteStartFrame: number;
  totalDurationInFrames: number;
  collisionPolicy: 'require-clear' | 'ripple';
  placementMode: 'append' | 'at-frame';
}): {
  clear: boolean;
  conflictingItemIds: string[];
  conflictingTransitionIds: string[];
  affectedByRippleItemIds: string[];
  errors: VideoPlanDiagnostic[];
  warnings: VideoPlanDiagnostic[];
} {
  const errors: VideoPlanDiagnostic[] = [];
  const warnings: VideoPlanDiagnostic[] = [];
  const start = input.absoluteStartFrame;
  const end = start + input.totalDurationInFrames;
  const conflictingItemIds: string[] = [];
  const conflictingTransitionIds: string[] = [];
  const affectedByRippleItemIds: string[] = [];

  if (input.placementMode === 'append' && input.collisionPolicy === 'ripple') {
    warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_TARGET_RANGE_OCCUPIED', 'collisionPolicy ripple is ignored for append placement', {
      recovery: 'Append uses track end; ripple is only meaningful for at-frame',
    }));
  }

  for (const item of input.timeline.items) {
    if (item.track !== input.trackId) continue;
    const itemEnd = item.startFrame + item.durationInFrames;
    const overlaps = item.startFrame < end && itemEnd > start;
    if (input.collisionPolicy === 'ripple' && input.placementMode === 'at-frame') {
      if (item.startFrame >= start) affectedByRippleItemIds.push(item.id);
    } else if (overlaps) {
      conflictingItemIds.push(item.id);
    }
  }

  const transitions = input.timeline.transitions ?? [];
  for (const transition of transitions) {
    if (transition.trackId !== input.trackId) continue;
    const incoming = input.timeline.items.find((item) => item.id === transition.incomingItemId);
    if (!incoming) continue;
    const cut = incoming.startFrame;
    const half = Math.floor(transition.durationInFrames / 2);
    const tStart = cut - half;
    const tEnd = cut + (transition.durationInFrames - half);
    const crossesStart = tStart < start && tEnd > start;
    const crossesEnd = tStart < end && tEnd > end;
    const overlapsRange = tStart < end && tEnd > start;
    if (input.collisionPolicy !== 'ripple' || input.placementMode !== 'at-frame') {
      if (crossesStart || crossesEnd || overlapsRange) {
        conflictingTransitionIds.push(transition.id);
      }
    }
  }

  const clear = conflictingItemIds.length === 0 && conflictingTransitionIds.length === 0;
  if (!clear && !(input.collisionPolicy === 'ripple' && input.placementMode === 'at-frame')) {
    if (conflictingItemIds.length) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_RANGE_OCCUPIED', 'Assembly range overlaps existing clips', {
        details: { conflictingItemIds },
        recovery: 'Use append, choose a clear range, or use collisionPolicy ripple',
      }));
    }
    if (conflictingTransitionIds.length) {
      errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TARGET_TRANSITION_CONFLICT', 'Existing transition crosses assembly range', {
        details: { conflictingTransitionIds },
        recovery: 'Remove or move the conflicting transition, or choose another range',
      }));
    }
  }

  return {
    clear: clear || (input.collisionPolicy === 'ripple' && input.placementMode === 'at-frame'),
    conflictingItemIds,
    conflictingTransitionIds,
    affectedByRippleItemIds,
    errors,
    warnings,
  };
}
