export type SceneAnimationInstanceV1 = {
  id: string;
  animation: {
    id: string;
    version: string;
  };
  startFrame: number;
  durationInFrames: number;
  params?: Record<string, unknown>;
};
