import {
  type Matrix2D,
  type Point2D,
  type Rectangle,
  transformPoint,
} from './matrix2d.ts';

export function rectangleFromXYWH(x: number, y: number, width: number, height: number): Rectangle {
  return { x, y, width, height };
}

export function rectangleCorners(rect: Rectangle): Point2D[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

export function transformRectangleCorners(matrix: Matrix2D, rect: Rectangle): Point2D[] {
  return rectangleCorners(rect).map((point) => transformPoint(matrix, point));
}

/** Axis-aligned bounding box of transformed rectangle corners. */
export function boundingBoxFromPoints(points: Point2D[]): Rectangle {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function worldAabb(matrix: Matrix2D, local: Rectangle): Rectangle {
  return boundingBoxFromPoints(transformRectangleCorners(matrix, local));
}

export function rectanglesOverlap(a: Rectangle, b: Rectangle): boolean {
  return !(
    a.x + a.width <= b.x
    || b.x + b.width <= a.x
    || a.y + a.height <= b.y
    || b.y + b.height <= a.y
  );
}

export function rectFullyOutside(inner: Rectangle, outer: Rectangle): boolean {
  return (
    inner.x + inner.width <= outer.x
    || inner.x >= outer.x + outer.width
    || inner.y + inner.height <= outer.y
    || inner.y >= outer.y + outer.height
  );
}

export function rectFullyInside(inner: Rectangle, outer: Rectangle): boolean {
  return (
    inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
  );
}
