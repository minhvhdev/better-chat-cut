import type { Matrix2D, Rectangle } from '../geometry/matrix2d.ts';
import type { SceneDiagnostic } from './scene-errors.ts';

export type EvaluatedSceneNode = {
  id: string;
  type: 'group' | 'asset';
  parentId?: string;
  order: number;
  active: boolean;
  visible: boolean;
  localFrame: number;
  localDurationInFrames: number;
  localMatrix: Matrix2D;
  worldMatrix: Matrix2D;
  localOpacity: number;
  worldOpacity: number;
  localBounds: Rectangle;
  worldBounds: Rectangle;
  asset?: {
    id: string;
    version: string;
  };
  appliedAnimations: {
    instanceId: string;
    animationId: string;
    animationVersion: string;
  }[];
  warnings: SceneDiagnostic[];
};

export type SceneFrameEvaluation = {
  sceneId: string;
  frame: number;
  sceneContentHash: string;
  dependencyFingerprint: string;
  canvas: {
    width: number;
    height: number;
  };
  nodes: EvaluatedSceneNode[];
  diagnostics: SceneDiagnostic[];
};
