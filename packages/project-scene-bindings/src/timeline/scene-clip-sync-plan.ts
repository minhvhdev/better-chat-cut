import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { SyncSceneClipInput } from '../contracts/scene-clip-tool-input.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY,
} from '../contracts/scene-clip-item.ts';
import { SceneClipError, sceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import { validateSceneClipBinding } from '../schema/scene-clip-binding-validator.ts';
import { parseSceneClipBinding, readSceneClipRequestMeta } from '../schema/scene-clip-props-validator.ts';
import { computeSceneClipItemFingerprint } from './scene-clip-fingerprint.ts';
import { bindingDisplayName, sceneDurationToTimelineFrames } from './scene-clip-item-builder.ts';

export type SceneClipSyncPlan = {
  changed: boolean;
  item: SceneClipTimelineItemLike;
  previousBinding: SceneClipBindingV1;
  resultingBinding: SceneClipBindingV1;
  changeSummary: {
    sceneChanged: boolean;
    dependenciesChanged: boolean;
    canvasChanged: boolean;
    durationChanged: boolean;
    nameChanged: boolean;
  };
  warnings: ReturnType<typeof sceneClipDiagnostic>[];
  actions: Array<
    | { type: 'patchItem'; id: string; patch: { name?: string; width?: number; height?: number; props?: Record<string, unknown> } }
    | { type: 'retime'; id: string; durationInFrames: number; srcInFrame?: number }
  >;
};

export function planSceneClipSync(
  item: SceneClipTimelineItemLike,
  input: SyncSceneClipInput,
  timelineFps: number,
): SceneClipSyncPlan {
  const parsed = parseSceneClipBinding(item);
  if (!parsed.binding) {
    throw new SceneClipError('SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', 'Existing clip binding is invalid', {
      diagnostics: parsed.errors,
      recovery: 'Rebind or fix the clip before sync',
    });
  }
  const previous = parsed.binding;
  const fingerprint = computeSceneClipItemFingerprint(item);
  if (fingerprint !== input.expectedItemFingerprint) {
    throw new SceneClipError('SCENE_CLIP_ITEM_FINGERPRINT_CONFLICT', 'expectedItemFingerprint does not match current clip', {
      details: { expected: input.expectedItemFingerprint, actual: fingerprint },
      recovery: 'Re-read the clip with scene_clip_get and retry sync',
    });
  }
  if (previous.bindingPayloadHash !== input.expectedBindingPayloadHash) {
    throw new SceneClipError('SCENE_CLIP_BINDING_HASH_CONFLICT', 'expectedBindingPayloadHash does not match current clip', {
      details: { expected: input.expectedBindingPayloadHash, actual: previous.bindingPayloadHash },
      recovery: 'Re-read the clip with scene_clip_get and retry sync',
    });
  }

  const validated = validateSceneClipBinding(input.binding);
  if (!validated.valid || !validated.binding) {
    throw new SceneClipError('SCENE_BINDING_SCENE_INVALID', 'New binding payload is invalid', {
      diagnostics: validated.errors,
      recovery: 'Regenerate binding via scene_draft_get_binding_payload',
    });
  }
  const next = validated.binding;
  if (next.sourceDraft.draftId !== previous.sourceDraft.draftId) {
    throw new SceneClipError('SCENE_CLIP_SOURCE_DRAFT_MISMATCH', 'Sync cannot rebind to a different scene draft', {
      details: { previousDraftId: previous.sourceDraft.draftId, nextDraftId: next.sourceDraft.draftId },
      recovery: 'Create a new clip with scene_clip_bind for a different draft',
    });
  }

  const timingPolicy = input.timingPolicy ?? 'preserve-timeline';
  const namePolicy = input.namePolicy ?? 'preserve';
  const warnings = [...validated.warnings];

  let durationInFrames = item.durationInFrames;
  const srcInFrame = item.srcInFrame;
  if (timingPolicy === 'match-scene') {
    durationInFrames = sceneDurationToTimelineFrames({
      sceneDurationInFrames: next.scene.durationInFrames,
      sceneFps: next.scene.fps,
      timelineFps,
    });
  }

  if (srcInFrame !== undefined) {
    const unclamped = Math.floor((Math.max(0, srcInFrame) * next.scene.fps) / timelineFps);
    if (unclamped >= next.scene.durationInFrames) {
      throw new SceneClipError('SCENE_CLIP_SRC_IN_OUT_OF_RANGE', 'srcInFrame is outside the new scene duration', {
        details: { itemId: item.id },
        recovery: 'Trim or reset the clip srcInFrame before syncing',
      });
    }
  }

  const nextName = namePolicy === 'match-draft' ? bindingDisplayName(next) : item.name;
  const requestMeta = readSceneClipRequestMeta(item);
  const nextWidth = next.scene.canvas.width;
  const nextHeight = next.scene.canvas.height;

  if (next.bindingPayloadHash === previous.bindingPayloadHash
    && durationInFrames === item.durationInFrames
    && nextName === item.name
    && nextWidth === item.width
    && nextHeight === item.height) {
    return {
      changed: false,
      item,
      previousBinding: previous,
      resultingBinding: previous,
      changeSummary: {
        sceneChanged: false,
        dependenciesChanged: false,
        canvasChanged: false,
        durationChanged: false,
        nameChanged: false,
      },
      warnings,
      actions: [],
    };
  }

  const props: Record<string, unknown> = {
    ...item.props,
    [BETTER_CHAT_CUT_SCENE_PROPS_KEY]: next,
  };
  if (requestMeta) props[BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY] = requestMeta;
  // Preserve assembly metadata (__betterChatCutVideoPlan) when present — sync must not strip it.

  const resulting: SceneClipTimelineItemLike = {
    ...item,
    name: nextName,
    props,
    width: nextWidth,
    height: nextHeight,
    durationInFrames,
    srcInFrame,
  };

  const actions: SceneClipSyncPlan['actions'] = [
    {
      type: 'patchItem',
      id: item.id,
      patch: {
        name: nextName,
        width: nextWidth,
        height: nextHeight,
        props,
      },
    },
  ];
  if (durationInFrames !== item.durationInFrames) {
    actions.push({
      type: 'retime',
      id: item.id,
      durationInFrames,
      ...(srcInFrame !== undefined ? { srcInFrame } : {}),
    });
  }

  return {
    changed: true,
    item: resulting,
    previousBinding: previous,
    resultingBinding: next,
    changeSummary: {
      sceneChanged: next.sceneContentHash !== previous.sceneContentHash,
      dependenciesChanged: next.dependencyFingerprint !== previous.dependencyFingerprint,
      canvasChanged: nextWidth !== previous.scene.canvas.width || nextHeight !== previous.scene.canvas.height,
      durationChanged: durationInFrames !== item.durationInFrames,
      nameChanged: nextName !== item.name,
    },
    warnings,
    actions,
  };
}
