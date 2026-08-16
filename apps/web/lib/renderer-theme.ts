import type { GraphEdge } from "@dm-hq/api-client";
import type { GraphNodeVisualKind } from "@/lib/graph-presentation";
import type { VisualizationPalette } from "@/lib/theme";

export function graphNodeColor(kind: GraphNodeVisualKind, palette: VisualizationPalette): string {
  return {
    campaign: palette.nodeCampaign,
    note: palette.nodeNote,
    entity: palette.nodeEntity,
    session: palette.nodeSession,
  }[kind];
}

export function graphEdgeColor(edgeClass: GraphEdge["edge_class"], palette: VisualizationPalette): string {
  return {
    document_link: palette.edgeDocument,
    reference: palette.edgeReference,
    relationship: palette.edgeRelationship,
  }[edgeClass];
}

export function graphStatusColor(status: string, palette: VisualizationPalette): string {
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

export function graphCloudColors(palette: VisualizationPalette): readonly string[] {
  return [palette.nodeNote, palette.nodeEntity, palette.nodeCampaign, palette.edgeDocument, palette.nodeSession];
}
