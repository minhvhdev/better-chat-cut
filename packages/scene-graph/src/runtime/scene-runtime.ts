import type { SceneDocumentV1 } from '../contracts/scene-document.ts';
import { createSceneFrameEvaluator } from './evaluate-scene-frame.ts';
import { createSceneValidator } from '../schema/scene-validator.ts';

export type SceneRuntime = {
  validate: ReturnType<typeof createSceneValidator>['validate'];
  evaluateFrame: ReturnType<typeof createSceneFrameEvaluator>['evaluate'];
};

export function createSceneRuntime(options?: {
  roots?: Parameters<typeof createSceneValidator>[0] extends { roots?: infer R } ? R : never;
}): SceneRuntime {
  const validator = createSceneValidator({ roots: options?.roots as never });
  const evaluator = createSceneFrameEvaluator({ roots: options?.roots as never });
  return {
    validate: (input, opts) => validator.validate(input, opts),
    evaluateFrame: (scene: SceneDocumentV1, frame: number) => evaluator.evaluate(scene, frame),
  };
}
