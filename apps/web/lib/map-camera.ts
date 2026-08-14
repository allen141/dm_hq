import type { MapMode } from "@/lib/map-types";

export type MapCameraBounds = {
  x: number;
  y: number;
};

export function mapCameraBounds(
  mode: MapMode,
  planeWidth: number,
  planeHeight: number,
  visibleWidth?: number,
  visibleHeight?: number,
): MapCameraBounds {
  if (mode === "2d" && visibleWidth !== undefined && visibleHeight !== undefined) {
    return {
      x: Math.max(0, (planeWidth - visibleWidth) / 2),
      y: Math.max(0, (planeHeight - visibleHeight) / 2),
    };
  }

  return {
    x: planeWidth * 0.46,
    y: planeHeight * 0.46,
  };
}

export function clampMapCameraTarget(
  target: { x: number; y: number },
  bounds: MapCameraBounds,
) {
  const clampAxis = (value: number, bound: number) => bound === 0 ? 0 : Math.max(-bound, Math.min(bound, value));
  return {
    x: clampAxis(target.x, bounds.x),
    y: clampAxis(target.y, bounds.y),
  };
}

type MapCameraVector = {
  x: number;
  y: number;
  z: number;
};

export function constrainMapCameraPose(
  target: MapCameraVector,
  position: MapCameraVector,
  bounds: MapCameraBounds,
) {
  const planarTarget = clampMapCameraTarget({ x: target.x, y: target.z }, bounds);
  const shift = {
    x: planarTarget.x - target.x,
    y: -target.y,
    z: planarTarget.y - target.z,
  };
  return {
    target: { x: planarTarget.x, y: 0, z: planarTarget.y },
    position: {
      x: position.x + shift.x,
      y: position.y + shift.y,
      z: position.z + shift.z,
    },
  };
}
