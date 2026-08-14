import { describe, expect, test } from "vitest";

import { clampMapCameraTarget, mapCameraBounds } from "@/lib/map-camera";

describe("map camera constraints", () => {
  test("keeps a fully framed 2D map centered", () => {
    const bounds = mapCameraBounds("2d", 12, 8, 13.44, 9);

    expect(bounds).toEqual({ x: 0, y: 0 });
    expect(clampMapCameraTarget({ x: 8, y: -8 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  test("allows bounded panning after zooming into a 2D map", () => {
    const bounds = mapCameraBounds("2d", 12, 8, 6, 4);

    expect(bounds).toEqual({ x: 3, y: 2 });
    expect(clampMapCameraTarget({ x: 9, y: -7 }, bounds)).toEqual({ x: 3, y: -2 });
  });

  test("keeps the 3D orbit target inside the image plane", () => {
    const bounds = mapCameraBounds("3d", 12, 8);

    const target = clampMapCameraTarget({ x: -20, y: 20 }, bounds);
    expect(target.x).toBeCloseTo(-5.52);
    expect(target.y).toBeCloseTo(3.68);
  });
});
