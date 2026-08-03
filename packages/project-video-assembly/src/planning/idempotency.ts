import { sha256Hex } from '../../../project-scene-bindings/src/schema/scene-clip-hash.ts';
import { stableStringify } from '../../../video-plans/src/schema/video-plan-serialization.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import {
  BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY,
  type VideoPlanClipMetadataV1,
} from '../contracts/assembly-metadata.ts';
import { VIDEO_PLAN_REQUEST_ID_PATTERN } from '../../../video-plans/src/contracts/video-plan-policy.ts';
import { VideoPlanError } from '../../../video-plans/src/contracts/video-plan-errors.ts';

export function assertAssemblyRequestId(requestId: string): void {
  if (!VIDEO_PLAN_REQUEST_ID_PATTERN.test(requestId)) {
    throw new VideoPlanError('VIDEO_PLAN_REQUEST_ID_REUSE_CONFLICT', 'requestId must match ^[A-Za-z0-9._-]{1,128}$', {
      recovery: 'Pass a stable requestId using letters, digits, . _ -',
    });
  }
}

export function computeAssemblyId(planId: string, planHash: string): string {
  const tail = planId.includes('.') ? planId.slice(planId.lastIndexOf('.') + 1) : planId;
  return `video-assembly.${tail}.${planHash.slice(0, 8)}`;
}

export function computeAssemblyInputHash(input: {
  plan: VideoPlanV1;
  timelineId: string;
  targetTrackId: string;
  placementMode: 'append' | 'at-frame';
  /** Concrete start for at-frame; ignored for append (append is semantic). */
  placementStartFrame?: number;
  collisionPolicy: 'require-clear' | 'ripple';
}): string {
  return sha256Hex(stableStringify({
    planHash: sha256Hex(stableStringify(input.plan)),
    timelineId: input.timelineId,
    targetTrackId: input.targetTrackId,
    placementMode: input.placementMode,
    placementStartFrame: input.placementMode === 'at-frame' ? (input.placementStartFrame ?? 0) : 'append',
    collisionPolicy: input.collisionPolicy,
  }));
}

export function readVideoPlanClipMetadata(item: {
  props?: Record<string, unknown>;
}): VideoPlanClipMetadataV1 | null {
  const raw = item.props?.[BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== '1.0.0') return null;
  if (typeof record.assemblyId !== 'string' || typeof record.planId !== 'string'
    || typeof record.planHash !== 'string' || typeof record.sceneEntryId !== 'string'
    || typeof record.sequenceIndex !== 'number' || typeof record.assemblyRequestId !== 'string'
    || typeof record.assemblyInputHash !== 'string') {
    return null;
  }
  return {
    schemaVersion: '1.0.0',
    assemblyId: record.assemblyId,
    planId: record.planId,
    planHash: record.planHash,
    sceneEntryId: record.sceneEntryId,
    sequenceIndex: record.sequenceIndex,
    assemblyRequestId: record.assemblyRequestId,
    assemblyInputHash: record.assemblyInputHash,
  };
}

export function findIdempotentAssemblyReplay(items: Array<{
  id: string;
  props?: Record<string, unknown>;
}>, requestId: string, inputHash: string): {
  replayed: true;
  items: typeof items;
  meta: VideoPlanClipMetadataV1;
} | null {
  const matched = items.filter((item) => {
    const meta = readVideoPlanClipMetadata(item);
    return meta?.assemblyRequestId === requestId;
  });
  if (matched.length === 0) return null;
  const meta = readVideoPlanClipMetadata(matched[0]!)!;
  if (meta.assemblyInputHash !== inputHash) {
    throw new VideoPlanError('VIDEO_PLAN_REQUEST_ID_REUSE_CONFLICT', 'requestId was reused with different assembly input', {
      details: { requestId, previousInputHash: meta.assemblyInputHash, nextInputHash: inputHash },
      recovery: 'Use a new requestId for a different assembly input',
    });
  }
  return { replayed: true, items: matched, meta };
}

export function findExistingAssemblyByPlan(
  items: Array<{ props?: Record<string, unknown> }>,
  planId: string,
  planHash: string,
): VideoPlanClipMetadataV1 | null {
  for (const item of items) {
    const meta = readVideoPlanClipMetadata(item);
    if (meta && meta.planId === planId && meta.planHash === planHash) return meta;
  }
  return null;
}
