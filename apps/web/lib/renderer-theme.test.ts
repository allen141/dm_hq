import { describe, expect, it } from "vitest";
import { GRAPH_PALETTE_REGISTRY } from "@/lib/theme";
import {
  graphCloudColors,
  graphEdgeColor,
  graphNodeColor,
  graphStatusColor,
  withAlpha,
} from "@/lib/renderer-theme";

describe("renderer theme adapters", () => {
  it("resolves graph semantics from whichever runtime palette is active", () => {
    const astral = GRAPH_PALETTE_REGISTRY.astral;
    const verdant = GRAPH_PALETTE_REGISTRY.verdant;

    expect(graphNodeColor("entity", astral)).toBe(astral.nodeEntity);
    expect(graphNodeColor("entity", verdant)).toBe(verdant.nodeEntity);
    expect(graphNodeColor("entity", astral)).not.toBe(graphNodeColor("entity", verdant));
    expect(graphEdgeColor("reference", astral)).toBe(astral.edgeReference);
    expect(graphStatusColor("archived", verdant)).toBe(verdant.statusArchived);
  });

  it("derives contours and cloud roles without hard-coded renderer colors", () => {
    const palette = GRAPH_PALETTE_REGISTRY.emberkeep;
    expect(withAlpha(palette.contour, 0.4)).toMatch(/^#[0-9a-f]{8}$/i);
    expect(graphCloudColors(palette)).toEqual([
      palette.nodeNote,
      palette.nodeEntity,
      palette.nodeCampaign,
      palette.edgeDocument,
      palette.nodeSession,
    ]);
  });
});
