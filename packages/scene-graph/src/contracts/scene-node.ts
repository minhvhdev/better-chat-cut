import type { SceneAnimationInstanceV1 } from './scene-animation.ts';
import type { SceneTransformV1 } from './scene-transform.ts';

export type SceneNodeBaseV1 = {
  id: string;
  parentId?: string;
  order: number;
  enabled?: boolean;
  startFrame: number;
  endFrame: number;
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  transform?: SceneTransformV1;
  animations?: SceneAnimationInstanceV1[];
  metadata?: {
    role?: string;
    label?: string;
  };
};

export type SceneGroupNodeV1 = SceneNodeBaseV1 & {
  type: 'group';
};

export type SceneAssetNodeV1 = SceneNodeBaseV1 & {
  type: 'asset';
  asset: {
    id: string;
    version: string;
    props?: Record<string, unknown>;
  };
  fit?: 'contain' | 'cover' | 'stretch';
};

export type SceneNodeV1 = SceneGroupNodeV1 | SceneAssetNodeV1;
