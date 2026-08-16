import type { GraphEdge } from "@dm-hq/api-client";
import type { GraphNodeVisualKind } from "@/lib/graph-presentation";
import type { GraphPalette, VisualizationPalette } from "@/lib/theme";

export type GraphColorPalette = VisualizationPalette | GraphPalette;

export function graphNodeColor(kind: GraphNodeVisualKind, palette: GraphColorPalette): string {
  return {
    campaign: palette.nodeCampaign,
    note: palette.nodeNote,
    entity: palette.nodeEntity,
    session: palette.nodeSession,
  }[kind];
}

export function graphEdgeColor(edgeClass: GraphEdge["edge_class"], palette: GraphColorPalette): string {
  return {
    document_link: palette.edgeDocument,
    reference: palette.edgeReference,
    relationship: palette.edgeRelationship,
  }[edgeClass];
}

export function graphStatusColor(status: string, palette: GraphColorPalette): string {
  if (status === "archived") return palette.statusArchived;
  if (status === "draft") return palette.statusDraft;
  return palette.statusCanon;
}

export function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color + Math.round(alpha * 255).toString(16).padStart(2, "0");
  }
  return color;
}

export function graphCloudColors(palette: GraphColorPalette): readonly string[] {
  return [palette.nodeNote, palette.nodeEntity, palette.nodeCampaign, palette.edgeDocument, palette.nodeSession];
}
