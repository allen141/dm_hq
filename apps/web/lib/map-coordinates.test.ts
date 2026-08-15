import { describe, expect, it } from "vitest";
import {
  clampMapCoordinate,
  mapPointFromUv,
  mapPointToWorld,
  mapWorldToPoint,
  planeDimensions,
  pointerToMapPoint,
} from "@/lib/map-coordinates";

describe("map coordinates", () => {
  it("clamps invalid and out-of-range values", () => {
    expect(clampMapCoordinate(-2)).toBe(0);
    expect(clampMapCoordinate(2)).toBe(1);
    expect(clampMapCoordinate(Number.NaN)).toBe(0);
  });

  it("maps DOM pointers into normalized coordinates", () => {
    expect(pointerToMapPoint(60, 45, { left: 10, top: 20, width: 100, height: 50 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("flips WebGL UV y into top-origin document coordinates", () => {
    expect(mapPointFromUv({ x: 0.25, y: 0.8 })).toEqual({ x: 0.25, y: 0.19999999999999996 });
  });

  it("places normalized points on the shared horizontal plane", () => {
    expect(mapPointToWorld({ x: 0, y: 1 }, 10, 6)).toEqual([-5, 0, 3]);
    expect(mapWorldToPoint(-5, 3, 10, 6)).toEqual({ x: 0, y: 1 });
  });

  it("clamps world positions outside the map plane", () => {
    expect(mapWorldToPoint(20, -20, 10, 6)).toEqual({ x: 1, y: 0 });
  });

  it("preserves the image aspect ratio", () => {
    expect(planeDimensions(1600, 800, 12)).toEqual({ width: 12, height: 6 });
  });
});
