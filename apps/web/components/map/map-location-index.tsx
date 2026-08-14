import type { ItemSummary, MapPlacement } from "@dm-hq/api-client";

type MapLocationIndexProps = {
  placements: MapPlacement[];
  items: ItemSummary[];
  selectedPlacementId: string | null;
  onSelect: (placementId: string) => void;
};

export function MapLocationIndex({ placements, items, selectedPlacementId, onSelect }: MapLocationIndexProps) {
  return <details className="map-location-index">
    <summary>Map locations <span>({placements.length})</span></summary>
    {placements.length === 0 ? <p>No locations have been placed on this map.</p> : <ol>
      {placements.map((placement, index) => {
        const item = items.find((candidate) => candidate.id === placement.item_id) ?? placement.item;
        const title = item?.title ?? placement.item_id;
        return <li key={placement.id}>
          <button type="button" aria-pressed={placement.id === selectedPlacementId} onClick={() => onSelect(placement.id)}>
            <span aria-hidden="true">{index + 1}</span><strong>{title}</strong><small>{placement.caption || item?.kind || "Archive page"}</small>
          </button>
        </li>;
      })}
    </ol>}
  </details>;
}
