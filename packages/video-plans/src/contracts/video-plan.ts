import type { SceneClipBindingV1 } from '../../../project-scene-bindings/src/contracts/scene-clip-binding.ts';
import type {
  VideoPlanMarkerColor,
  VideoPlanVisualTransitionType,
} from './video-plan-policy.ts';

export type VideoPlanTransitionV1 =
  | { mode: 'cut' }
  | {
    mode: 'timeline-transition';
    type: VideoPlanVisualTransitionType;
    durationInFrames: number;
    direction?: 'left' | 'right' | 'up' | 'down';
  };

export type VideoPlanSceneEntryV1 = {
  id: string;
  name?: string;
  description?: string;
  binding: SceneClipBindingV1;
  duration?: {
    mode: 'match-scene' | 'timeline-frames';
    timelineFrames?: number;
  };
  gapAfterFrames?: number;
  transitionToNext?: VideoPlanTransitionV1;
  marker?: {
    note?: string;
    color?: VideoPlanMarkerColor;
  };
};

export type VideoPlanV1 = {
  schemaVersion: '1.0.0';
  id: string;
  name: string;
  description?: string;
  output: {
    width: number;
    height: number;
    fps: number;
    fit?: 'contain' | 'cover';
  };
  sceneCanvasPolicy?: 'require-match' | 'allow-fit';
  placement: {
    mode: 'append' | 'at-frame';
    startFrame?: number;
    targetTrack?: string;
    collisionPolicy?: 'require-clear' | 'ripple';
  };
  markers?: {
    mode: 'none' | 'boundary' | 'range' | 'both';
    defaultColor?: VideoPlanMarkerColor;
    notePrefix?: string;
  };
  defaults?: {
    gapAfterFrames?: number;
    transitionToNext?: VideoPlanTransitionV1;
  };
  scenes: VideoPlanSceneEntryV1[];
};
