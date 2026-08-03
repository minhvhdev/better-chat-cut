import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  SCENE_CLIP_BINDING_SCHEMA_VERSION,
} from '../contracts/scene-clip-item.ts';
import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';

/**
 * Browser-safe structural parse for timeline rendering.
 * Full hash/dependency validation stays in readiness (Node/edit tools).
 */
export function parseSceneClipBindingForRender(item: SceneClipTimelineItemLike): {
  binding?: SceneClipBindingV1;
  errorCode?: string;
  errorMessage?: string;
} {
  if (!item || item.kind !== 'motion-graphic') {
    return { errorCode: 'SCENE_CLIP_WRONG_ITEM_KIND', errorMessage: 'Not a motion-graphic clip' };
  }
  if (item.templateId !== BETTER_CHAT_CUT_SCENE_TEMPLATE_ID) {
    return { errorCode: 'SCENE_CLIP_WRONG_TEMPLATE_ID', errorMessage: 'Wrong template id' };
  }
  const raw = item.props?.[BETTER_CHAT_CUT_SCENE_PROPS_KEY];
  if (!raw || typeof raw !== 'object') {
    return { errorCode: 'SCENE_CLIP_RESERVED_PROPS_MISSING', errorMessage: 'Missing reserved scene props' };
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== SCENE_CLIP_BINDING_SCHEMA_VERSION) {
    return { errorCode: 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', errorMessage: 'Unsupported binding schema' };
  }
  if (record.bindingMode !== 'embedded-snapshot') {
    return { errorCode: 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', errorMessage: 'Invalid binding mode' };
  }
  const scene = record.scene as SceneClipBindingV1['scene'] | undefined;
  if (!scene || typeof scene !== 'object' || typeof scene.fps !== 'number' || typeof scene.durationInFrames !== 'number') {
    return { errorCode: 'SCENE_BINDING_SCENE_INVALID', errorMessage: 'Embedded scene missing' };
  }
  if (typeof record.bindingPayloadHash !== 'string' || typeof record.sceneContentHash !== 'string') {
    return { errorCode: 'SCENE_CLIP_BINDING_SCHEMA_UNSUPPORTED', errorMessage: 'Missing binding hashes' };
  }
  return { binding: raw as SceneClipBindingV1 };
}
