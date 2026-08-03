import type { SceneClipBindingV1 } from '../contracts/scene-clip-binding.ts';
import type { BuildSceneTimelineItemInput } from '../contracts/scene-clip-tool-input.ts';
import {
  BETTER_CHAT_CUT_SCENE_PROPS_KEY,
  BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY,
  BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
  type SceneClipRequestMetaV1,
} from '../contracts/scene-clip-item.ts';
import type { SceneClipTimelineItemLike } from '../contracts/scene-clip-timeline-item.ts';
import { SceneClipError } from '../contracts/scene-clip-errors.ts';

export function sceneDurationToTimelineFrames(input: {
  sceneDurationInFrames: number;
  sceneFps: number;
  timelineFps: number;
}): number {
  const { sceneDurationInFrames, sceneFps, timelineFps } = input;
  if (!Number.isFinite(sceneDurationInFrames) || sceneDurationInFrames <= 0
    || !Number.isFinite(sceneFps) || sceneFps <= 0
    || !Number.isFinite(timelineFps) || timelineFps <= 0) {
    throw new SceneClipError('SCENE_CLIP_INVALID_DURATION', 'Invalid scene/timeline fps or duration', {
      recovery: 'Ensure scene duration and fps are positive finite numbers',
    });
  }
  return Math.max(1, Math.ceil((sceneDurationInFrames / sceneFps) * timelineFps));
}

export function buildBetterChatCutSceneTimelineItem(
  input: BuildSceneTimelineItemInput,
  requestMeta?: SceneClipRequestMetaV1,
): SceneClipTimelineItemLike {
  const { itemId, trackId, startFrame, projectFps, binding, name } = input;
  if (!trackId.trim()) {
    throw new SceneClipError('SCENE_CLIP_TRACK_NOT_FOUND', 'trackId is required', {
      recovery: 'Provide a video track id',
    });
  }
  if (!Number.isFinite(startFrame) || startFrame < 0) {
    throw new SceneClipError('SCENE_CLIP_INVALID_START_FRAME', 'startFrame must be >= 0', {
      recovery: 'Pass a non-negative startFrame or omit to append',
    });
  }
  const durationInFrames = sceneDurationToTimelineFrames({
    sceneDurationInFrames: binding.scene.durationInFrames,
    sceneFps: binding.scene.fps,
    timelineFps: projectFps,
  });
  const props: Record<string, unknown> = {
    [BETTER_CHAT_CUT_SCENE_PROPS_KEY]: binding,
  };
  if (requestMeta) {
    props[BETTER_CHAT_CUT_SCENE_REQUEST_META_KEY] = requestMeta;
  }
  return {
    id: itemId,
    track: trackId,
    startFrame,
    durationInFrames,
    kind: 'motion-graphic',
    templateId: BETTER_CHAT_CUT_SCENE_TEMPLATE_ID,
    name: name?.trim() || binding.scene.name || binding.sourceDraft.draftId,
    props,
    width: binding.scene.canvas.width,
    height: binding.scene.canvas.height,
  };
}

export function bindingDisplayName(binding: SceneClipBindingV1): string {
  return binding.scene.name || binding.sourceDraft.draftId;
}
