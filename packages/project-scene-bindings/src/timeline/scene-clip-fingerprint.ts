import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
} from '../contracts/scene-clip-item.ts';
import { sha256Hex } from '../schema/scene-clip-hash.ts';
import { stableStringify } from '../schema/scene-clip-serialization.ts';
import { parseSceneClipBinding } from '../schema/scene-clip-props-validator.ts';

export function computeSceneClipItemFingerprint(item: SceneClipTimelineItemLike): string {
  const parsed = parseSceneClipBinding(item);
  const bindingSlice = parsed.binding
    ? {
      bindingPayloadHash: parsed.binding.bindingPayloadHash,
      sceneContentHash: parsed.binding.sceneContentHash,
      sourceDraft: parsed.binding.sourceDraft,
    }
    : item.props?.[BETTER_CHAT_CUT_SCENE_PROPS_KEY] ?? null;

  return sha256Hex(stableStringify({
    id: item.id,
    templateId: item.templateId ?? BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
    binding: bindingSlice,
    width: item.width ?? null,
    height: item.height ?? null,
    durationInFrames: item.durationInFrames,
    srcInFrame: item.srcInFrame ?? 0,
  }));
}
