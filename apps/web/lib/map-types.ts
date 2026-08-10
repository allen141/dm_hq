export type MapMode = "2d" | "3d";

export type MapPoint = {
  x: number;
  y: number;
};

export type MapBackground = {
  url: string;
  alt: string;
};

export type MapItem = {
  id: string;
  title: string;
  kind: "note" | "entity" | "session" | string;
  status: string;
  summary?: string;
};

export type MapCanvasPlacement = MapPoint & {
  id: string;
  item_id: string;
  caption: string;
};

export type MapCanvasProps = {
  background: MapBackground;
  items: MapItem[];
  placements: MapCanvasPlacement[];
  mode: MapMode;
  selectedPlacementId?: string | null;
  placementArmed?: boolean;
  resetToken?: number;
  className?: string;
  onSelectPlacement?: (placementId: string | null) => void;
  onPlace?: (point: MapPoint) => void;
  onMovePlacement?: (
    placementId: string,
    point: MapPoint,
    phase: "preview" | "commit",
  ) => void;
  onRendererError?: (error: Error) => void;
};
