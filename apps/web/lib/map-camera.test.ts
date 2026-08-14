import { describe, expect, test } from "vitest";

import { clampMapCameraTarget, constrainMapCameraPose, mapCameraBounds } from "@/lib/map-camera";

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

  test("projects vertical control drift back onto the map plane", () => {
    const pose = constrainMapCameraPose(
      { x: 9, y: -18, z: -7 },
      { x: 9, y: -1.8, z: -6.999 },
      { x: 3, y: 2 },
    );

    expect(pose.target).toEqual({ x: 3, y: 0, z: -2 });
    expect(pose.position.x).toBe(3);
    expect(pose.position.y).toBeCloseTo(16.2);
    expect(pose.position.z).toBeCloseTo(-1.999);
  });
});
