import type { BindSceneClipInput } from '../contracts/scene-clip-tool-input.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import {
  SCENE_CLIP_REQUEST_ID_PATTERN,
  type SceneClipRequestMetaV1,
} from '../contracts/scene-clip-item.ts';
import { SceneClipError } from '../contracts/scene-clip-errors.ts';
import { validateSceneClipBinding } from '../schema/scene-clip-binding-validator.ts';
import { computeCreateInputHash } from '../schema/scene-clip-binding-hash.ts';
import { readSceneClipRequestMeta } from '../schema/scene-clip-props-validator.ts';
import { isBetterChatCutSceneClip } from '../schema/scene-clip-props-validator.ts';
import {
  bindingDisplayName,
  buildBetterChatCutSceneTimelineItem,
} from './scene-clip-item-builder.ts';
import { computeSceneClipItemFingerprint } from './scene-clip-fingerprint.ts';

export type SceneClipBindPlan = {
  replayed: boolean;
  item: SceneClipTimelineItemLike;
  createTrack?: { id: string; kind: 'video'; name?: string };
  actions: Array<
    | { type: 'track.create'; track: { id: string; kind: 'video'; name?: string } }
    | { type: 'add'; item: Omit<SceneClipTimelineItemLike, 'startFrame'>; startFrame?: number; ripple?: boolean }
  >;
  warnings: ReturnType<typeof validateSceneClipBinding>['warnings'];
};

function assertRequestId(requestId: string): void {
  if (!SCENE_CLIP_REQUEST_ID_PATTERN.test(requestId)) {
    throw new SceneClipError('SCENE_CLIP_REQUEST_ID_REUSE_CONFLICT', 'requestId must match ^[A-Za-z0-9._-]{1,128}$', {
      recovery: 'Pass a stable requestId using letters, digits, . _ -',
    });
  }
}

export function findIdempotentBindReplay(
  items: SceneClipTimelineItemLike[],
  requestId: string,
  createInputHash: string,
): SceneClipTimelineItemLike | null {
  for (const item of items) {
    if (!isBetterChatCutSceneClip(item)) continue;
    const meta = readSceneClipRequestMeta(item);
    if (!meta || meta.createRequestId !== requestId) continue;
    if (meta.createInputHash !== createInputHash) {
      throw new SceneClipError('SCENE_CLIP_REQUEST_ID_REUSE_CONFLICT', 'requestId was reused with different bind input', {
        details: { requestId, previousInputHash: meta.createInputHash, nextInputHash: createInputHash },
        recovery: 'Use a new requestId for a different bind input',
      });
    }
    return item;
  }
  return null;
}

export function planSceneClipBind(input: {
  bind: BindSceneClipInput;
  itemId: string;
  trackId: string;
  createTrackId?: string;
  needsCreateTrack: boolean;
  projectFps: number;
  resolvedStartFrame: number;
  existingItems: SceneClipTimelineItemLike[];
}): SceneClipBindPlan {
  assertRequestId(input.bind.requestId);
  const validated = validateSceneClipBinding(input.bind.binding);
  if (!validated.valid || !validated.binding) {
    throw new SceneClipError('SCENE_BINDING_SCENE_INVALID', 'Binding payload is invalid', {
      diagnostics: validated.errors,
      recovery: 'Regenerate binding via scene_draft_get_binding_payload',
    });
  }
  const binding = validated.binding;
  const createInputHash = computeCreateInputHash({
    bindingPayloadHash: binding.bindingPayloadHash,
    track: input.bind.track,
    startFrame: input.bind.startFrame,
    ripple: input.bind.ripple,
    name: input.bind.name,
  });
  const replay = findIdempotentBindReplay(input.existingItems, input.bind.requestId, createInputHash);
  if (replay) {
    return {
      replayed: true,
      item: replay,
      actions: [],
      warnings: validated.warnings,
    };
  }

  const requestMeta: SceneClipRequestMetaV1 = {
    createRequestId: input.bind.requestId,
    createInputHash,
  };
  const item = buildBetterChatCutSceneTimelineItem({
    itemId: input.itemId,
    trackId: input.trackId,
    startFrame: input.resolvedStartFrame,
    projectFps: input.projectFps,
    binding,
    name: input.bind.name ?? bindingDisplayName(binding),
  }, requestMeta);

  const actions: SceneClipBindPlan['actions'] = [];
  if (input.needsCreateTrack && input.createTrackId) {
    actions.push({
      type: 'track.create',
      track: { id: input.createTrackId, kind: 'video', name: 'V1' },
    });
  }
  const { startFrame: _sf, ...itemWithoutStart } = item;
  actions.push({
    type: 'add',
    item: itemWithoutStart,
    startFrame: input.bind.startFrame ?? input.resolvedStartFrame,
    ripple: input.bind.ripple === true,
  });

  return {
    replayed: false,
    item,
    ...(input.needsCreateTrack && input.createTrackId
      ? { createTrack: { id: input.createTrackId, kind: 'video' as const, name: 'V1' } }
      : {}),
    actions,
    warnings: validated.warnings,
  };
}

export function bindResultFromItem(item: SceneClipTimelineItemLike, timelineId: string, replayed: boolean) {
  return {
    itemId: item.id,
    replayed,
    timelineId,
    trackId: item.track,
    startFrame: item.startFrame,
    durationInFrames: item.durationInFrames,
    itemFingerprint: computeSceneClipItemFingerprint(item),
    bindingPayloadHash: String(
      (item.props?.__betterChatCutScene as { bindingPayloadHash?: string } | undefined)?.bindingPayloadHash ?? '',
    ),
  };
}
