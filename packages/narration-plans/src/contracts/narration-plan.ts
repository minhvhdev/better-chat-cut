import type { VideoPlanV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { SceneDurationPolicy } from './narration-policy.ts';
import type { NarrationSpeakerV1 } from './narration-speaker.ts';
import type { NarrationSceneV1 } from './narration-scene.ts';
import type { NarrationCaptionPolicyV1 } from './narration-timing.ts';

export type NarrationPlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  language: string;
  videoPlan: VideoPlanV1;
  speakers: NarrationSpeakerV1[];
  defaults?: {
    speakerId?: string;
    leadInMs?: number;
    tailOutMs?: number;
    pauseBetweenSegmentsMs?: number;
    sceneDurationPolicy?: SceneDurationPolicy;
    captions?: NarrationCaptionPolicyV1;
  };
  scenes: NarrationSceneV1[];
};
