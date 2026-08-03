import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { VideoPlanScheduleV1 } from '../../../video-plans/src/contracts/video-plan-schedule.ts';
import { validateVideoPlan } from '../../../video-plans/src/schema/video-plan-validator.ts';
import { videoPlanDiagnostic, VideoPlanError, type VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import type { VideoPlanAssemblyPreviewV1 } from '../contracts/assembly-preview.ts';
import type { VideoPlanAssemblyResultV1 } from '../contracts/assembly-result.ts';
import { computeSceneClipItemFingerprint } from '../../../project-scene-bindings/src/timeline/scene-clip-fingerprint.ts';
import { analyzeAssemblyCollisions } from './collision-analyzer.ts';
import { buildAssemblySceneClip } from './clip-action-builder.ts';
import { buildTransitionActions } from './transition-action-builder.ts';
import { buildMarkerActions } from './marker-action-builder.ts';
import {
  assertAssemblyRequestId,
  computeAssemblyId,
  computeAssemblyInputHash,
  findExistingAssemblyByPlan,
  findIdempotentAssemblyReplay,
  readVideoPlanClipMetadata,
} from './idempotency.ts';
import {
  resolveTargetVideoTrack,
  trackEndFrame,
  type AssemblyTimelineLike,
} from './track-resolver.ts';
import type { VideoPlanMarkerColor } from '../../../video-plans/src/contracts/video-plan-policy.ts';

export type AssemblyAtomicAction =
  | { type: 'track.create'; track: { id: string; kind: 'video'; name?: string } }
  | { type: 'add'; item: Omit<ReturnType<typeof buildAssemblySceneClip>, 'startFrame'>; startFrame?: number; ripple?: boolean }
  | { type: 'retime'; id: string; durationInFrames: number; ripple?: boolean }
  | { type: 'addTransition'; id: string; incomingItemId: string; transType: string; durationInFrames?: number }
  | { type: 'setTransition'; id: string; patch: { direction?: string } }
  | { type: 'addMarker'; marker: {
    id: string;
    scope: 'project';
    fromFrame: number;
    durationFrames: number;
    note: string;
    color: VideoPlanMarkerColor;
  } };

function validateTimelineOutput(plan: VideoPlanV1, timeline: AssemblyTimelineLike): VideoPlanDiagnostic[] {
  const errors: VideoPlanDiagnostic[] = [];
  if (timeline.fps !== plan.output.fps
    || timeline.width !== plan.output.width
    || timeline.height !== plan.output.height) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TIMELINE_OUTPUT_MISMATCH', 'Active timeline output does not match VideoPlan output', {
      planId: plan.id,
      details: {
        planOutput: plan.output,
        timeline: { width: timeline.width, height: timeline.height, fps: timeline.fps, fit: timeline.fit },
      },
      recovery: 'Create/select a timeline matching plan output, or create a matching VideoPlan',
    }));
  }
  const planFit = plan.output.fit ?? 'contain';
  const timelineFit = timeline.fit ?? 'contain';
  if (planFit !== timelineFit) {
    errors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TIMELINE_OUTPUT_MISMATCH', 'Timeline fit does not match plan fit', {
      planId: plan.id,
      details: { planFit, timelineFit },
      recovery: 'Align timeline fit with the VideoPlan',
    }));
  }
  return errors;
}

export function previewVideoPlanAssembly(input: {
  plan: unknown;
  timeline: AssemblyTimelineLike;
}): VideoPlanAssemblyPreviewV1 {
  const validated = validateVideoPlan(input.plan, { includeSchedule: true });
  const errors = [...validated.errors];
  const warnings = [...validated.warnings];
  if (!validated.valid || !validated.normalizedPlan || !validated.schedule || !validated.planHash) {
    return {
      planId: typeof (input.plan as { id?: string })?.id === 'string' ? (input.plan as { id: string }).id : 'invalid',
      planHash: validated.planHash ?? '',
      timelineId: input.timeline.id,
      timelineName: input.timeline.name,
      targetTrackId: '',
      absoluteStartFrame: 0,
      absoluteEndFrame: 0,
      totalDurationInFrames: 0,
      placementMode: 'append',
      collisionPolicy: 'require-clear',
      scenes: [],
      transitions: [],
      markers: [],
      collisionAnalysis: {
        clear: false,
        conflictingItemIds: [],
        conflictingTransitionIds: [],
        affectedByRippleItemIds: [],
      },
      errors,
      warnings,
    };
  }

  const plan = validated.normalizedPlan;
  const schedule = validated.schedule;
  errors.push(...validateTimelineOutput(plan, input.timeline));

  const trackResolved = resolveTargetVideoTrack({
    timeline: input.timeline,
    requestedTrack: plan.placement.targetTrack,
  });
  errors.push(...trackResolved.errors);
  warnings.push(...trackResolved.warnings);

  const trackId = trackResolved.trackId ?? '';
  const placementMode = plan.placement.mode;
  let collisionPolicy = plan.placement.collisionPolicy ?? 'require-clear';
  let absoluteStartFrame = 0;
  if (placementMode === 'append') {
    absoluteStartFrame = trackId ? trackEndFrame(input.timeline, trackId) : 0;
    if (collisionPolicy === 'ripple') {
      warnings.push(videoPlanDiagnostic('warning', 'VIDEO_PLAN_TARGET_RANGE_OCCUPIED', 'collisionPolicy ripple ignored for append', {
        recovery: 'Append places at track end',
      }));
      collisionPolicy = 'require-clear';
    }
  } else {
    absoluteStartFrame = plan.placement.startFrame ?? 0;
  }

  const collision = trackId
    ? analyzeAssemblyCollisions({
      timeline: input.timeline,
      trackId,
      absoluteStartFrame,
      totalDurationInFrames: schedule.totalDurationInFrames,
      collisionPolicy,
      placementMode,
    })
    : {
      clear: false,
      conflictingItemIds: [],
      conflictingTransitionIds: [],
      affectedByRippleItemIds: [],
      errors: [],
      warnings: [],
    };
  errors.push(...collision.errors);
  warnings.push(...collision.warnings);

  return {
    planId: plan.id,
    planHash: validated.planHash,
    timelineId: input.timeline.id,
    timelineName: input.timeline.name,
    targetTrackId: trackId,
    absoluteStartFrame,
    absoluteEndFrame: absoluteStartFrame + schedule.totalDurationInFrames,
    totalDurationInFrames: schedule.totalDurationInFrames,
    placementMode,
    collisionPolicy,
    scenes: schedule.entries.map((entry) => ({
      entryId: entry.entryId,
      sequenceIndex: entry.sequenceIndex,
      absoluteStartFrame: absoluteStartFrame + entry.relativeStartFrame,
      durationInFrames: entry.durationInFrames,
      absoluteEndFrame: absoluteStartFrame + entry.relativeEndFrame,
      sceneId: entry.sceneId,
      sceneContentHash: entry.sceneContentHash,
      warnings: [],
    })),
    transitions: schedule.transitions.map((tr) => ({
      outgoingEntryId: tr.outgoingEntryId,
      incomingEntryId: tr.incomingEntryId,
      cutFrame: absoluteStartFrame + tr.relativeCutFrame,
      type: tr.type,
      durationInFrames: tr.durationInFrames,
      direction: tr.direction,
    })),
    markers: schedule.markers.map((mk) => ({
      sceneEntryId: mk.sceneEntryId,
      fromFrame: absoluteStartFrame + mk.relativeFromFrame,
      durationFrames: mk.durationFrames,
      note: mk.note,
      color: mk.color as VideoPlanMarkerColor,
    })),
    collisionAnalysis: {
      clear: collision.clear,
      conflictingItemIds: collision.conflictingItemIds,
      conflictingTransitionIds: collision.conflictingTransitionIds,
      affectedByRippleItemIds: collision.affectedByRippleItemIds,
    },
    errors,
    warnings,
  };
}

export function planVideoPlanAssembly(input: {
  plan: unknown;
  timeline: AssemblyTimelineLike;
  requestId: string;
  uid: (prefix: string) => string;
}): {
  preview: VideoPlanAssemblyPreviewV1;
  result: VideoPlanAssemblyResultV1;
  actions: AssemblyAtomicAction[];
} {
  assertAssemblyRequestId(input.requestId);
  const preview = previewVideoPlanAssembly({ plan: input.plan, timeline: input.timeline });
  if (preview.errors.some((e) => e.severity === 'error')) {
    throw new VideoPlanError(preview.errors[0]!.code, preview.errors[0]!.message, {
      diagnostics: preview.errors,
      recovery: preview.errors[0]!.recovery,
    });
  }

  const validated = validateVideoPlan(input.plan, { includeSchedule: true });
  const plan = validated.normalizedPlan!;
  const schedule = validated.schedule!;
  const planHash = validated.planHash!;
  const assemblyId = computeAssemblyId(plan.id, planHash);

  const trackResolved = resolveTargetVideoTrack({
    timeline: input.timeline,
    requestedTrack: plan.placement.targetTrack,
  });
  const trackId = trackResolved.trackId!;
  const absoluteStartFrame = preview.absoluteStartFrame;
  const collisionPolicy = preview.collisionPolicy;

  const assemblyInputHash = computeAssemblyInputHash({
    plan,
    timelineId: input.timeline.id,
    targetTrackId: trackId,
    placementMode: preview.placementMode,
    placementStartFrame: preview.placementMode === 'at-frame' ? absoluteStartFrame : undefined,
    collisionPolicy,
  });

  const replay = findIdempotentAssemblyReplay(input.timeline.items, input.requestId, assemblyInputHash);
  if (replay) {
    const sceneItems = replay.items
      .map((item) => {
        const meta = readVideoPlanClipMetadata(item)!;
        const timelineItem = input.timeline.items.find((candidate) => candidate.id === item.id)!;
        return {
          entryId: meta.sceneEntryId,
          sequenceIndex: meta.sequenceIndex,
          itemId: item.id,
          startFrame: timelineItem.startFrame,
          durationInFrames: timelineItem.durationInFrames,
          bindingPayloadHash: meta.planHash,
          itemFingerprint: computeSceneClipItemFingerprint(timelineItem as never),
        };
      })
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    // Fix binding hash from actual binding if present
    for (const sceneItem of sceneItems) {
      const item = input.timeline.items.find((candidate) => candidate.id === sceneItem.itemId);
      const binding = item?.props?.__betterChatCutScene as { bindingPayloadHash?: string } | undefined;
      if (binding?.bindingPayloadHash) sceneItem.bindingPayloadHash = binding.bindingPayloadHash;
    }
    return {
      preview,
      actions: [],
      result: {
        planId: plan.id,
        planHash,
        assemblyId,
        replayed: true,
        timelineId: input.timeline.id,
        targetTrackId: trackId,
        absoluteStartFrame,
        absoluteEndFrame: absoluteStartFrame + schedule.totalDurationInFrames,
        totalDurationInFrames: schedule.totalDurationInFrames,
        sceneItems,
        transitionIds: [],
        markerIds: [],
        actionSummary: 'Replayed identical video_plan_assemble request',
        errors: [],
        warnings: preview.warnings,
      },
    };
  }

  const existing = findExistingAssemblyByPlan(input.timeline.items, plan.id, planHash);
  if (existing && existing.assemblyRequestId !== input.requestId) {
    throw new VideoPlanError('VIDEO_PLAN_ALREADY_ASSEMBLED', 'This VideoPlan is already assembled on the timeline', {
      details: { assemblyId: existing.assemblyId, previousRequestId: existing.assemblyRequestId },
      recovery: 'Inspect the existing assembly or create a revised VideoPlan',
    });
  }

  const actions: AssemblyAtomicAction[] = [];
  if (trackResolved.needsCreateTrack && trackResolved.createTrackId) {
    actions.push({
      type: 'track.create',
      track: { id: trackResolved.createTrackId, kind: 'video', name: 'V1' },
    });
  }

  const entryIdToItemId = new Map<string, string>();
  const sceneItems: VideoPlanAssemblyResultV1['sceneItems'] = [];
  const useRipple = collisionPolicy === 'ripple' && preview.placementMode === 'at-frame';

  // Build clip specs
  const clipSpecs = schedule.entries.map((entry, index) => {
    const itemId = input.uid('item');
    entryIdToItemId.set(entry.entryId, itemId);
    const absoluteStart = absoluteStartFrame + entry.relativeStartFrame;
    const item = buildAssemblySceneClip({
      itemId,
      trackId,
      startFrame: absoluteStart,
      durationInFrames: entry.durationInFrames,
      projectFps: plan.output.fps,
      plan,
      scheduleEntryIndex: index,
      schedule,
      assemblyId,
      assemblyRequestId: input.requestId,
      assemblyInputHash,
    });
    sceneItems.push({
      entryId: entry.entryId,
      sequenceIndex: entry.sequenceIndex,
      itemId,
      startFrame: absoluteStart,
      durationInFrames: entry.durationInFrames,
      bindingPayloadHash: entry.bindingPayloadHash,
      itemFingerprint: computeSceneClipItemFingerprint(item),
    });
    return { entry, item, absoluteStart, index };
  });

  if (useRipple) {
    // Reverse packed insert at absoluteStartFrame, then open gaps via inflate/deflate retime.
    for (let i = clipSpecs.length - 1; i >= 0; i -= 1) {
      const spec = clipSpecs[i]!;
      const { startFrame: _sf, ...itemWithoutStart } = spec.item;
      actions.push({
        type: 'add',
        item: itemWithoutStart,
        startFrame: absoluteStartFrame,
        ripple: true,
      });
    }
    // Open gaps from last to first (including trailing gap)
    for (let i = clipSpecs.length - 1; i >= 0; i -= 1) {
      const gap = schedule.entries[i]!.gapAfterFrames;
      if (gap <= 0) continue;
      const itemId = clipSpecs[i]!.item.id;
      const baseDuration = schedule.entries[i]!.durationInFrames;
      actions.push({ type: 'retime', id: itemId, durationInFrames: baseDuration + gap, ripple: true });
      actions.push({ type: 'retime', id: itemId, durationInFrames: baseDuration, ripple: false });
    }
  } else {
    for (const spec of clipSpecs) {
      const { startFrame: _sf, ...itemWithoutStart } = spec.item;
      actions.push({
        type: 'add',
        item: itemWithoutStart,
        startFrame: spec.absoluteStart,
        ripple: false,
      });
    }
  }

  const transitionBuilt = buildTransitionActions({
    schedule,
    entryIdToItemId,
    uid: input.uid,
  });
  for (const action of transitionBuilt.actions) {
    actions.push({
      type: 'addTransition',
      id: action.id,
      incomingItemId: action.incomingItemId,
      transType: action.transType,
      durationInFrames: action.durationInFrames,
    });
    if (action.direction) {
      actions.push({
        type: 'setTransition',
        id: action.id,
        patch: { direction: action.direction },
      });
    }
  }

  const markerBuilt = buildMarkerActions({
    schedule,
    absoluteStartFrame,
    uid: input.uid,
  });
  actions.push(...markerBuilt.actions);

  return {
    preview,
    actions,
    result: {
      planId: plan.id,
      planHash,
      assemblyId,
      replayed: false,
      timelineId: input.timeline.id,
      targetTrackId: trackId,
      absoluteStartFrame,
      absoluteEndFrame: absoluteStartFrame + schedule.totalDurationInFrames,
      totalDurationInFrames: schedule.totalDurationInFrames,
      sceneItems,
      transitionIds: transitionBuilt.transitionIds,
      markerIds: markerBuilt.markerIds,
      actionSummary: `Assemble VideoPlan "${plan.name}" (${schedule.entries.length} scenes) at frame ${absoluteStartFrame}`,
      errors: [],
      warnings: preview.warnings,
    },
  };
}

export type { VideoPlanScheduleV1 };
