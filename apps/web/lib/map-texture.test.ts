import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMapTexture } from "@/lib/map-texture";

const OriginalImage = globalThis.Image;

afterEach(() => {
  globalThis.Image = OriginalImage;
  vi.restoreAllMocks();
});

describe("loadMapTexture", () => {
  it("sets privacy attributes before assigning the source", async () => {
    const assignments: string[] = [];
    class TestImage {
      crossOrigin = "";
      referrerPolicy = "";
      decoding = "";
      naturalWidth = 1200;
      naturalHeight = 800;
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      set src(value: string) {
        assignments.push(`${this.crossOrigin}|${this.referrerPolicy}|${value}`);
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = TestImage as unknown as typeof Image;

    const loaded = await loadMapTexture("https://maps.example.test/world.png");

    expect(assignments).toEqual(["anonymous|no-referrer|https://maps.example.test/world.png"]);
    expect(loaded.width).toBe(1200);
    expect(loaded.height).toBe(800);
    loaded.texture.dispose();
  });
});
