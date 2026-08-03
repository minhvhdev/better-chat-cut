import type { SceneDurationPolicy } from './narration-policy.ts';
import type { NarrationSegmentV1 } from './narration-segment.ts';

export type NarrationSceneV1 = {
  sceneEntryId: string;
  leadInMs?: number;
  tailOutMs?: number;
  sceneDurationPolicy?: SceneDurationPolicy;
  segments: NarrationSegmentV1[];
};
