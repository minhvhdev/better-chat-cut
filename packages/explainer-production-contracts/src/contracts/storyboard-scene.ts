import type { VideoPlanTransitionV1 } from '../../../video-plans/src/contracts/video-plan.ts';
import type { StoryboardVisualRequirementV1 } from './storyboard-visual-requirement.ts';

export type StoryboardLayoutV1 = {
  backgroundColor: string;
  safeArea?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  notes?: string;
};

export type StoryboardSceneV1 = {
  id: string;
  name: string;
  purpose: string;
  scriptSegmentIds: string[];
  claimIds: string[];
  durationHintSeconds?: number;
  visualDescription: string;
  layout: StoryboardLayoutV1;
  visualRequirements: StoryboardVisualRequirementV1[];
  transitionToNext?: VideoPlanTransitionV1;
  markerNote?: string;
};
