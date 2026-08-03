export type SceneTransformV1 = {
  anchorX?: number;
  anchorY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
};

export const DEFAULT_SCENE_TRANSFORM: Required<SceneTransformV1> = {
  anchorX: 0.5,
  anchorY: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};
