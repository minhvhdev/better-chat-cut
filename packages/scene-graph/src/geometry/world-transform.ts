import {
  identityMatrix,
  multiplyMatrices,
  rotationMatrix,
  scaleMatrix,
  translationMatrix,
  type Matrix2D,
} from './matrix2d.ts';
import type { SceneTransformV1 } from '../contracts/scene-transform.ts';
import { DEFAULT_SCENE_TRANSFORM } from '../contracts/scene-transform.ts';

/**
 * Transform order (documented for M3A):
 * layout translation
 * → anchor translation
 * → animation translation
 * → rotation
 * → scale
 * → reverse anchor translation
 *
 * Matrices multiply left-to-right as parent × layout × transform × animation.
 */
export function buildNodeLocalMatrix(args: {
  layoutX: number;
  layoutY: number;
  layoutWidth: number;
  layoutHeight: number;
  transform?: SceneTransformV1;
  animationTranslateX?: number;
  animationTranslateY?: number;
  animationRotationDeg?: number;
  animationScaleX?: number;
  animationScaleY?: number;
}): Matrix2D {
  const t = { ...DEFAULT_SCENE_TRANSFORM, ...args.transform };
  const anchorX = args.layoutWidth * t.anchorX;
  const anchorY = args.layoutHeight * t.anchorY;
  const animTx = args.animationTranslateX ?? 0;
  const animTy = args.animationTranslateY ?? 0;
  const animRot = args.animationRotationDeg ?? 0;
  const animSx = args.animationScaleX ?? 1;
  const animSy = args.animationScaleY ?? 1;

  let matrix = identityMatrix();
  matrix = multiplyMatrices(matrix, translationMatrix(args.layoutX, args.layoutY));
  matrix = multiplyMatrices(matrix, translationMatrix(anchorX, anchorY));
  matrix = multiplyMatrices(matrix, translationMatrix(animTx, animTy));
  matrix = multiplyMatrices(matrix, rotationMatrix(t.rotation + animRot));
  matrix = multiplyMatrices(matrix, scaleMatrix(t.scaleX * animSx, t.scaleY * animSy));
  matrix = multiplyMatrices(matrix, translationMatrix(-anchorX, -anchorY));
  return matrix;
}

export function composeWorldMatrix(parentWorld: Matrix2D, local: Matrix2D): Matrix2D {
  return multiplyMatrices(parentWorld, local);
}

export { worldAabb } from './rectangles.ts';
