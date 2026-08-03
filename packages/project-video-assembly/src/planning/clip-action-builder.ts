import {
  bindingDisplayName,
  buildBetterChatCutSceneTimelineItem,
} from '../../../project-scene-bindings/src/timeline/scene-clip-item-builder.ts';
import { BETTER_CHAT_CUT_SCENE_PROPS_KEY } from '../../../project-scene-bindings/src/contracts/scene-clip-item.ts';
import type { SceneClipTimelineItemLike } from '../../../project-scene-bindings/src/contracts/scene-clip-timeline-item.ts';
import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { VideoPlanScheduleV1 } from '../../../video-plans/src/contracts/video-plan-schedule.ts';
import {
  BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY,
  type VideoPlanClipMetadataV1,
} from '../contracts/assembly-metadata.ts';

export function buildAssemblySceneClip(input: {
  itemId: string;
  trackId: string;
  startFrame: number;
  durationInFrames: number;
  projectFps: number;
  plan: VideoPlanV1;
  scheduleEntryIndex: number;
  schedule: VideoPlanScheduleV1;
  assemblyId: string;
  assemblyRequestId: string;
  assemblyInputHash: string;
}): SceneClipTimelineItemLike {
  const entry = input.plan.scenes[input.scheduleEntryIndex]!;
  const scheduled = input.schedule.entries[input.scheduleEntryIndex]!;
  const meta: VideoPlanClipMetadataV1 = {
    schemaVersion: '1.0.0',
    assemblyId: input.assemblyId,
    planId: input.plan.id,
    planHash: input.schedule.planHash,
    sceneEntryId: entry.id,
    sequenceIndex: scheduled.sequenceIndex,
    assemblyRequestId: input.assemblyRequestId,
    assemblyInputHash: input.assemblyInputHash,
  };
  const item = buildBetterChatCutSceneTimelineItem({
    itemId: input.itemId,
    trackId: input.trackId,
    startFrame: input.startFrame,
    projectFps: input.projectFps,
    binding: entry.binding,
    name: entry.name ?? bindingDisplayName(entry.binding),
  });
  item.durationInFrames = input.durationInFrames;
  item.props = {
    ...item.props,
    [BETTER_CHAT_CUT_SCENE_PROPS_KEY]: entry.binding,
    [BETTER_CHAT_CUT_VIDEO_PLAN_PROPS_KEY]: meta,
  };
  return item;
}
