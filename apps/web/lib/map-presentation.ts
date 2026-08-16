import type { VisualizationPalette } from "@/lib/theme";

export type MapVisualKind = "note" | "entity" | "session";

export function normalizeMapVisualKind(kind: string | undefined): MapVisualKind {
  if (kind === "entity" || kind === "session") return kind;
  return "note";
}

export function mapMarkerColor(
  palette: VisualizationPalette,
  kind: string | undefined,
  archived = false,
): string {
  if (archived) return palette.mapArchived;
  const visualKind = normalizeMapVisualKind(kind);
  if (visualKind === "entity") return palette.mapEntity;
  if (visualKind === "session") return palette.mapSession;
  return palette.mapNote;
}
