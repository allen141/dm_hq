import { describe, expect, it } from "vitest";
import { THEME_REGISTRY } from "@/lib/theme";
import { mapMarkerColor, normalizeMapVisualKind } from "@/lib/map-presentation";

describe("map presentation", () => {
  it("normalizes page and unknown items consistently with notes", () => {
    expect(normalizeMapVisualKind("note")).toBe("note");
    expect(normalizeMapVisualKind("page")).toBe("note");
    expect(normalizeMapVisualKind("unknown")).toBe("note");
    expect(normalizeMapVisualKind(undefined)).toBe("note");
    expect(normalizeMapVisualKind("entity")).toBe("entity");
    expect(normalizeMapVisualKind("session")).toBe("session");
  });

  it("resolves every marker role from the active concrete palette", () => {
    const palette = THEME_REGISTRY.astral.visualization;
    expect(mapMarkerColor(palette, "note")).toBe(palette.mapNote);
    expect(mapMarkerColor(palette, "entity")).toBe(palette.mapEntity);
    expect(mapMarkerColor(palette, "session")).toBe(palette.mapSession);
    expect(mapMarkerColor(palette, "entity", true)).toBe(palette.mapArchived);
  });
});
