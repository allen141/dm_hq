"use client";

import dynamic from "next/dynamic";
import type { ArchiveItem, ItemSummary, MapPlacement, PageIdentity } from "@dm-hq/api-client";

import { MapDetailsCard } from "@/components/map/map-details-card";
import type { MapItem, MapMode } from "@/lib/map-types";
const MapCanvas = dynamic(() => import("@/components/map/map-canvas"), {
  ssr: false,
  loading: () => <div className="map-loading-card" role="status" aria-label="Loading interactive map">Preparing the interactive map…</div>,
});

type MapWorkspaceProps = {
  campaignId: string;
  background: { url: string; alt: string };
  items: ItemSummary[];
  placements: MapPlacement[];
  mode: MapMode;
  selectedPlacementId: string | null;
  placementArmed: boolean;
  resetToken: number;
  selectedItem?: ArchiveItem | null;
  selectedExcerpt?: string;
  selectedItemLoading?: boolean;
  selectedItemError?: string;
  rendererError?: string;
  onSelectPlacement: (placementId: string | null) => void;
  onPlace: (point: { x: number; y: number }) => void;
  onMovePlacement: (placementId: string, point: { x: number; y: number }, phase: "preview" | "commit") => void;
  onRendererError: (error: Error) => void;
};

function identityFor(placement: MapPlacement, items: ItemSummary[]): ItemSummary | PageIdentity | undefined {
  return items.find((item) => item.id === placement.item_id) ?? placement.item;
}

export function MapWorkspace({ campaignId, background, items, placements, mode, selectedPlacementId, placementArmed, resetToken, selectedItem, selectedExcerpt, selectedItemLoading, selectedItemError, rendererError, onSelectPlacement, onPlace, onMovePlacement, onRendererError }: MapWorkspaceProps) {
  const selectedPlacement = placements.find((placement) => placement.id === selectedPlacementId);
  const rendererItems: MapItem[] = items.map((item) => ({ id: item.id, title: item.title, kind: item.kind, status: item.status }));
  for (const placement of placements) {
    if (rendererItems.some((item) => item.id === placement.item_id)) continue;
    const embedded = placement.item;
    rendererItems.push({ id: placement.item_id, title: embedded?.title ?? placement.item_id, kind: embedded?.kind ?? "page", status: embedded?.status ?? "unknown" });
  }

  return <section className="map-workspace" aria-label="Interactive campaign map">
    {rendererError && <p className="map-renderer-warning" role="status">The WebGL map could not start ({rendererError}). The accessible 2D fallback is active. A remote image host may also block the map texture through CORS; marker data and editing remain available.</p>}
    {!background.url ? <div className="map-empty-state"><strong>Add a background to begin exploring.</strong><p>Your markers remain available in the index while the map image is configured.</p></div> : <div className="map-viewport-shell">
      <MapCanvas
        className="map-renderer"
        background={background}
        items={rendererItems}
        placements={placements}
        mode={mode}
        selectedPlacementId={selectedPlacementId}
        placementArmed={placementArmed}
        resetToken={resetToken}
        onSelectPlacement={onSelectPlacement}
        onPlace={onPlace}
        onMovePlacement={onMovePlacement}
        onRendererError={onRendererError}
      />
      {selectedPlacement && <div className="map-popover">
        <MapDetailsCard
          campaignId={campaignId}
          placement={selectedPlacement}
          identity={identityFor(selectedPlacement, items)}
          item={selectedItem}
          excerpt={selectedExcerpt}
          loading={selectedItemLoading}
          error={selectedItemError}
          onClose={() => onSelectPlacement(null)}
        />
      </div>}
    </div>}
  </section>;
}
