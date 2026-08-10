import type { MapPoint } from "@/lib/map-types";

export const clampMapCoordinate = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export const clampMapPoint = (point: MapPoint): MapPoint => ({
  x: clampMapCoordinate(point.x),
  y: clampMapCoordinate(point.y),
});

export const pointerToMapPoint = (
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): MapPoint =>
  clampMapPoint({
    x: bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0,
    y: bounds.height > 0 ? (clientY - bounds.top) / bounds.height : 0,
  });

export const mapPointFromUv = (uv: MapPoint): MapPoint =>
  clampMapPoint({ x: uv.x, y: 1 - uv.y });

export const mapPointToWorld = (
  point: MapPoint,
  planeWidth: number,
  planeHeight: number,
): [x: number, y: number, z: number] => {
  const normalized = clampMapPoint(point);
  return [
    (normalized.x - 0.5) * planeWidth,
    0,
    (normalized.y - 0.5) * planeHeight,
  ];
};

export const mapWorldToPoint = (
  worldX: number,
  worldZ: number,
  planeWidth: number,
  planeHeight: number,
): MapPoint =>
  clampMapPoint({
    x: planeWidth > 0 ? worldX / planeWidth + 0.5 : 0,
    y: planeHeight > 0 ? worldZ / planeHeight + 0.5 : 0,
  });

export const planeDimensions = (
  imageWidth: number,
  imageHeight: number,
  longestSide = 12,
): { width: number; height: number } => {
  if (imageWidth <= 0 || imageHeight <= 0 || longestSide <= 0) {
    return { width: longestSide, height: longestSide };
  }
  const scale = longestSide / Math.max(imageWidth, imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
};
