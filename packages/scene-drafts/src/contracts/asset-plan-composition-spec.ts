import type { SceneTransformV1 } from '../../../scene-graph/src/contracts/scene-transform.ts';
import type { SceneAnimationInstanceV1 } from '../../../scene-graph/src/contracts/scene-animation.ts';

export type AssetPlanCompositionPartPlacementOverrideV1 = {
  partId: string;
  nodeId?: string;
  parentPartId?: string;
  order?: number;
  normalizedBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  transform?: SceneTransformV1;
  animations?: SceneAnimationInstanceV1[];
};

export type AssetPlanRequirementPlacementV1 = {
  requirementId: string;
  nodeId: string;
  parentId?: string;
  order: number;
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
  partOverrides?: AssetPlanCompositionPartPlacementOverrideV1[];
};

export type AssetPlanSceneCompositionSpecV1 = {
  schemaVersion: '1.0.0';
  draft: {
    draftId: string;
    name: string;
    description?: string;
  };
  scene: {
    id: string;
    name: string;
    description?: string;
    canvas: {
      width: number;
      height: number;
      backgroundColor: string;
    };
    fps: number;
    durationInFrames: number;
    theme: {
      id: string;
      version: string;
    };
    safeArea?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  placements: AssetPlanRequirementPlacementV1[];
  omitOptionalSkippedRequirements?: boolean;
};
