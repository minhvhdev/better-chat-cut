export { resolveSceneTimelineDuration } from './sequence-scheduler.ts';
import { sceneDurationToTimelineFrames } from '../../../project-scene-bindings/src/timeline/scene-clip-item-builder.ts';

export function convertSceneDurationToTimelineFrames(input: {
  sceneDurationInFrames: number;
  sceneFps: number;
  timelineFps: number;
}): number {
  return sceneDurationToTimelineFrames(input);
}
