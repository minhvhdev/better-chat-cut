import { validateVideoPlan } from '../../../video-plans/src/schema/video-plan-validator.ts';
import { videoPlanDiagnostic, type VideoPlanDiagnostic } from '../../../video-plans/src/contracts/video-plan-errors.ts';
import { parseSceneClipBinding } from '../../../project-scene-bindings/src/schema/scene-clip-props-validator.ts';
import { computeSceneClipItemFingerprint } from '../../../project-scene-bindings/src/timeline/scene-clip-fingerprint.ts';
import type { VideoPlanAssemblyInspectionV1 } from '../contracts/assembly-inspection.ts';
import type { VideoPlanAssemblyStatus } from '../contracts/assembly-metadata.ts';
import { computeAssemblyId, readVideoPlanClipMetadata } from '../planning/idempotency.ts';
import { previewVideoPlanAssembly } from '../planning/project-assembly-planner.ts';
import type { AssemblyTimelineLike } from '../planning/track-resolver.ts';
import { discoverVideoPlanClips } from './assembly-discovery.ts';

export function inspectVideoPlanAssembly(input: {
  plan: unknown;
  timeline: AssemblyTimelineLike;
}): VideoPlanAssemblyInspectionV1 {
  const validated = validateVideoPlan(input.plan, { includeSchedule: true });
  const errors: VideoPlanDiagnostic[] = [...validated.errors];
  const warnings: VideoPlanDiagnostic[] = [...validated.warnings];
  const planId = validated.normalizedPlan?.id
    ?? (typeof (input.plan as { id?: string })?.id === 'string' ? (input.plan as { id: string }).id : 'invalid');
  const planHash = validated.planHash ?? '';

  if (!validated.valid || !validated.normalizedPlan || !validated.schedule) {
    return {
      status: 'invalid',
      planId,
      planHash,
      timelineId: input.timeline.id,
      expectedSceneCount: 0,
      foundSceneCount: 0,
      expectedTransitionCount: 0,
      foundTransitionCount: 0,
      expectedMarkerCount: 0,
      foundMarkerCount: 0,
      sceneChecks: [],
      transitionChecks: [],
      markerChecks: [],
      errors,
      warnings,
    };
  }

  const plan = validated.normalizedPlan;
  const schedule = validated.schedule;
  const assemblyId = computeAssemblyId(plan.id, planHash);
  const clips = discoverVideoPlanClips(input.timeline, plan.id, planHash);
  const preview = previewVideoPlanAssembly({ plan, timeline: input.timeline });

  if (clips.length === 0) {
    return {
      status: 'not-assembled',
      planId: plan.id,
      planHash,
      timelineId: input.timeline.id,
      assemblyId,
      expectedSceneCount: schedule.entries.length,
      foundSceneCount: 0,
      expectedTransitionCount: schedule.transitions.length,
      foundTransitionCount: 0,
      expectedMarkerCount: schedule.markers.length,
      foundMarkerCount: 0,
      sceneChecks: schedule.entries.map((entry) => ({
        entryId: entry.entryId,
        status: 'missing' as const,
        itemIds: [],
        errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_ITEM_MISSING', `Scene entry ${entry.entryId} not assembled`, {
          sceneEntryId: entry.entryId,
          recovery: 'Call video_plan_assemble',
        })],
        warnings: [],
      })),
      transitionChecks: [],
      markerChecks: [],
      errors: [videoPlanDiagnostic('error', 'VIDEO_PLAN_ASSEMBLY_NOT_FOUND', 'VideoPlan is not assembled on this timeline', {
        planId: plan.id,
        recovery: 'Call video_plan_assemble in an edit session',
      })],
      warnings,
    };
  }

  // Infer absolute start from lowest sequence clip
  const byEntry = new Map<string, typeof clips>();
  for (const clip of clips) {
    const meta = readVideoPlanClipMetadata(clip)!;
    const list = byEntry.get(meta.sceneEntryId) ?? [];
    list.push(clip);
    byEntry.set(meta.sceneEntryId, list);
  }

  const sceneChecks = schedule.entries.map((entry) => {
    const found = byEntry.get(entry.entryId) ?? [];
    const checkErrors: VideoPlanDiagnostic[] = [];
    const checkWarnings: VideoPlanDiagnostic[] = [];
    if (found.length === 0) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_ITEM_MISSING', `Missing scene clip for ${entry.entryId}`, {
        sceneEntryId: entry.entryId,
      }));
      return { entryId: entry.entryId, status: 'missing' as const, itemIds: [], errors: checkErrors, warnings: checkWarnings };
    }
    if (found.length > 1) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_ASSEMBLY_DUPLICATE_ENTRY', `Duplicate clips for ${entry.entryId}`, {
        sceneEntryId: entry.entryId,
        details: { itemIds: found.map((item) => item.id) },
      }));
      return {
        entryId: entry.entryId,
        status: 'duplicate' as const,
        itemIds: found.map((item) => item.id),
        errors: checkErrors,
        warnings: checkWarnings,
      };
    }
    const item = found[0]!;
    const meta = readVideoPlanClipMetadata(item)!;
    const expectedStart = preview.scenes.find((scene) => scene.entryId === entry.entryId)?.absoluteStartFrame
      ?? (item.startFrame);
    // When already assembled, preferred absolute positions come from first clip of sequence 0
    const firstClip = clips
      .map((candidate) => ({ candidate, meta: readVideoPlanClipMetadata(candidate)! }))
      .sort((a, b) => a.meta.sequenceIndex - b.meta.sequenceIndex)[0]!;
    const assembledStart = firstClip.candidate.startFrame;
    const expectedAbs = assembledStart + entry.relativeStartFrame;

    if (item.track !== preview.targetTrackId && preview.targetTrackId) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_ASSEMBLY_DRIFTED', 'Scene clip is on the wrong track', {
        sceneEntryId: entry.entryId,
        itemId: item.id,
      }));
    }
    if (item.startFrame !== expectedAbs) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_ITEM_POSITION_CHANGED', 'Scene clip start frame drifted', {
        sceneEntryId: entry.entryId,
        itemId: item.id,
        frame: item.startFrame,
        details: { expected: expectedAbs, expectedStart },
      }));
    }
    if (item.durationInFrames !== entry.durationInFrames) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_ITEM_DURATION_CHANGED', 'Scene clip duration drifted', {
        sceneEntryId: entry.entryId,
        itemId: item.id,
        details: { expected: entry.durationInFrames, actual: item.durationInFrames },
      }));
    }
    const parsed = parseSceneClipBinding(item as never);
    if (!parsed.binding || parsed.binding.bindingPayloadHash !== entry.bindingPayloadHash) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_SCENE_BINDING_CHANGED', 'Scene binding no longer matches VideoPlan snapshot', {
        sceneEntryId: entry.entryId,
        itemId: item.id,
        recovery: 'Create a new VideoPlan from updated bindings; scene_clip_sync keeps plan metadata and marks drift',
      }));
    }
    if (meta.planHash !== planHash || meta.sequenceIndex !== entry.sequenceIndex) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_ASSEMBLY_DRIFTED', 'VideoPlan metadata mismatch', {
        sceneEntryId: entry.entryId,
        itemId: item.id,
      }));
    }
    void computeSceneClipItemFingerprint(item as never);
    return {
      entryId: entry.entryId,
      status: checkErrors.length ? 'drifted' as const : 'ok' as const,
      itemIds: [item.id],
      errors: checkErrors,
      warnings: checkWarnings,
    };
  });

  const itemIdByEntry = new Map<string, string>();
  for (const check of sceneChecks) {
    if (check.itemIds[0]) itemIdByEntry.set(check.entryId, check.itemIds[0]);
  }

  const transitions = input.timeline.transitions ?? [];
  const transitionChecks = schedule.transitions.map((tr) => {
    const outId = itemIdByEntry.get(tr.outgoingEntryId);
    const inId = itemIdByEntry.get(tr.incomingEntryId);
    const found = transitions.filter((candidate) => candidate.outgoingItemId === outId && candidate.incomingItemId === inId);
    const checkErrors: VideoPlanDiagnostic[] = [];
    if (!found.length) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_MISSING', 'Expected transition missing', {
        details: { outgoingEntryId: tr.outgoingEntryId, incomingEntryId: tr.incomingEntryId },
      }));
      return {
        outgoingEntryId: tr.outgoingEntryId,
        incomingEntryId: tr.incomingEntryId,
        status: 'missing' as const,
        transitionIds: [],
        errors: checkErrors,
        warnings: [],
      };
    }
    const match = found[0]!;
    if (match.type !== tr.type || match.durationInFrames !== Math.max(2, tr.durationInFrames)) {
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_TRANSITION_CHANGED', 'Transition type/duration changed', {
        details: { expected: tr, actual: match },
      }));
    }
    return {
      outgoingEntryId: tr.outgoingEntryId,
      incomingEntryId: tr.incomingEntryId,
      status: checkErrors.length ? 'changed' as const : 'ok' as const,
      transitionIds: found.map((item) => item.id),
      errors: checkErrors,
      warnings: [],
    };
  });

  const markers = input.timeline.markers ?? [];
  const markerChecks = schedule.markers.map((mk) => {
    const firstClip = clips
      .map((candidate) => ({ candidate, meta: readVideoPlanClipMetadata(candidate)! }))
      .sort((a, b) => a.meta.sequenceIndex - b.meta.sequenceIndex)[0]!;
    const assembledStart = firstClip.candidate.startFrame;
    const expectedFrom = assembledStart + mk.relativeFromFrame;
    const found = markers.filter((candidate) => (
      candidate.scope === 'project'
      && candidate.note === mk.note
      && candidate.fromFrame === expectedFrom
      && candidate.durationFrames === mk.durationFrames
    ));
    const checkErrors: VideoPlanDiagnostic[] = [];
    if (!found.length) {
      // also detect shifted marker with same note
      const shifted = markers.filter((candidate) => candidate.scope === 'project' && candidate.note === mk.note);
      if (shifted.length) {
        checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_CHANGED', 'Marker frame/duration changed', {
          sceneEntryId: mk.sceneEntryId,
          details: { expectedFrom, expectedDuration: mk.durationFrames },
        }));
        return {
          sceneEntryId: mk.sceneEntryId,
          kind: mk.kind,
          status: 'changed' as const,
          markerIds: shifted.map((item) => item.id),
          errors: checkErrors,
          warnings: [],
        };
      }
      checkErrors.push(videoPlanDiagnostic('error', 'VIDEO_PLAN_MARKER_MISSING', 'Expected marker missing', {
        sceneEntryId: mk.sceneEntryId,
      }));
      return {
        sceneEntryId: mk.sceneEntryId,
        kind: mk.kind,
        status: 'missing' as const,
        markerIds: [],
        errors: checkErrors,
        warnings: [],
      };
    }
    return {
      sceneEntryId: mk.sceneEntryId,
      kind: mk.kind,
      status: 'ok' as const,
      markerIds: found.map((item) => item.id),
      errors: [],
      warnings: [],
    };
  });

  for (const check of sceneChecks) errors.push(...check.errors);
  for (const check of transitionChecks) errors.push(...check.errors);
  for (const check of markerChecks) errors.push(...check.errors);

  let status: VideoPlanAssemblyStatus = 'complete';
  if (sceneChecks.some((check) => check.status === 'duplicate')) status = 'duplicate';
  else if (sceneChecks.some((check) => check.status === 'missing')
    || transitionChecks.some((check) => check.status === 'missing')
    || markerChecks.some((check) => check.status === 'missing')) {
    status = 'incomplete';
  } else if (errors.length > 0) status = 'drifted';

  return {
    status,
    planId: plan.id,
    planHash,
    timelineId: input.timeline.id,
    assemblyId,
    expectedSceneCount: schedule.entries.length,
    foundSceneCount: clips.length,
    expectedTransitionCount: schedule.transitions.length,
    foundTransitionCount: transitionChecks.reduce((sum, check) => sum + check.transitionIds.length, 0),
    expectedMarkerCount: schedule.markers.length,
    foundMarkerCount: markerChecks.reduce((sum, check) => sum + check.markerIds.length, 0),
    sceneChecks,
    transitionChecks,
    markerChecks,
    errors,
    warnings,
  };
}
