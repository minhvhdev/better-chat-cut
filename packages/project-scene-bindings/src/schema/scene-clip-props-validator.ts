import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  type SceneClipRequestMetaV1,
} from '../contracts/scene-clip-item.ts';
import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import { sceneClipDiagnostic, type SceneClipDiagnostic } from '../contracts/scene-clip-errors.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import { validateSceneClipBinding } from './scene-clip-binding-validator.ts';

export function isBetterChatCutSceneClip(item: SceneClipTimelineItemLike | null | undefined): boolean {
  return Boolean(
    item
    && item.kind === 'motion-graphic'
    && item.templateId === BETTER_CHAT_CUT_SCENE_TEMPLATE_ID
    && item.props
    && BETTER_CHAT_CUT_SCENE_PROPS_KEY in item.props,
  );
}

export function readSceneClipBindingRaw(item: SceneClipTimelineItemLike): unknown {
  return item.props?.[BETTER_CHAT_CUT_SCENE_PROPS_KEY];
}

export function readSceneClipRequestMeta(item: SceneClipTimelineItemLike): SceneClipRequestMetaV1 | null {
  const raw = item.props?.[BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.createRequestId !== 'string' || typeof record.createInputHash !== 'string') return null;
  return {
    createRequestId: record.createRequestId,
    createInputHash: record.createInputHash,
  };
}

export function parseSceneClipBinding(item: SceneClipTimelineItemLike): {
  binding?: SceneClipBindingV1;
  errors: SceneClipDiagnostic[];
  warnings: SceneClipDiagnostic[];
} {
  if (!item || item.kind !== 'motion-graphic') {
    return {
      errors: [sceneClipDiagnostic('error', 'SCENE_CLIP_WRONG_ITEM_KIND', 'Item is not a motion-graphic clip', {
        itemId: item?.id,
        recovery: 'Pass a Better Chat Cut scene clip item id',
      })],
      warnings: [],
    };
  }
  if (item.templateId !== BETTER_CHAT_CUT_SCENE_TEMPLATE_ID) {
    return {
      errors: [sceneClipDiagnostic('error', 'SCENE_CLIP_WRONG_TEMPLATE_ID', 'Item templateId is not a Better Chat Cut scene clip', {
        itemId: item.id,
        recovery: 'Use scene_clip_bind to create scene clips',
      })],
      warnings: [],
    };
  }
  const raw = readSceneClipBindingRaw(item);
  if (raw === undefined) {
    return {
      errors: [sceneClipDiagnostic('error', 'SCENE_CLIP_RESERVED_PROPS_MISSING', `Missing props.${BETTER_CHAT_CUT_SCENE_PROPS_KEY}`, {
        itemId: item.id,
        recovery: 'Rebind the scene clip from a valid binding payload',
      })],
      warnings: [],
    };
  }
  const validated = validateSceneClipBinding(raw);
  return {
    binding: validated.binding,
    errors: validated.errors.map((d) => ({ ...d, itemId: item.id })),
    warnings: validated.warnings.map((d) => ({ ...d, itemId: item.id })),
  };
}

export function assertReservedPropsNotPatched(patch: Record<string, unknown>): SceneClipDiagnostic | null {
  if (
    BETTER_CHAT_CUT_SCENE_PROPS_KEY in patch
    || BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY in patch
    || '__betterChatCutVideoPlan' in patch
    || '__betterChatCutNarration' in patch
  ) {
    return sceneClipDiagnostic(
      'error',
      'SCENE_CLIP_GENERIC_PROPS_EDIT_BLOCKED',
      'Reserved Better Chat Cut scene props cannot be edited via update_item_props',
      {
        recovery: '__betterChatCutScene: use scene_draft_patch then scene_clip_sync. __betterChatCutVideoPlan: create a new VideoPlan. __betterChatCutNarration: use narration_apply_timeline',
      },
    );
  }
  return null;
}
