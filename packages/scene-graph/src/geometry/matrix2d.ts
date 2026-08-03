/** Affine 2D matrix utilities for deterministic scene transforms. */

export const MATRIX_EPSILON = 1e-9;

export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

export type Point2D = { x: number; y: number };

export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite ${label}`);
  }
  return value;
}

export function identityMatrix(): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function translationMatrix(tx: number, ty: number): Matrix2D {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: assertFinite(tx, 'tx'),
    f: assertFinite(ty, 'ty'),
  };
}

export function scaleMatrix(sx: number, sy: number): Matrix2D {
  return {
    a: assertFinite(sx, 'sx'),
    b: 0,
    c: 0,
    d: assertFinite(sy, 'sy'),
    e: 0,
    f: 0,
  };
}

export function rotationMatrix(degrees: number): Matrix2D {
  const rad = (assertFinite(degrees, 'rotation') * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Multiply matrices: result = left × right (apply right first, then left). */
export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

export function transformPoint(matrix: Matrix2D, point: Point2D): Point2D {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

export function nearlyEqual(a: number, b: number, epsilon = MATRIX_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}
