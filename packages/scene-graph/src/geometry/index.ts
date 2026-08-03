export {
  MATRIX_EPSILON,
  identityMatrix,
  translationMatrix,
  scaleMatrix,
  rotationMatrix,
  multiplyMatrices,
  transformPoint,
  nearlyEqual,
  type Matrix2D,
  type Point2D,
  type Rectangle,
} from './matrix2d.ts';

export {
  rectangleFromXYWH,
  rectangleCorners,
  transformRectangleCorners,
  boundingBoxFromPoints,
  worldAabb,
  rectanglesOverlap,
  rectFullyOutside,
  rectFullyInside,
} from './rectangles.ts';

export { buildNodeLocalMatrix, composeWorldMatrix } from './world-transform.ts';
