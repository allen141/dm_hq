import type { ItemSummary } from "@dm-hq/api-client";
import type { MapMode } from "@/lib/map-types";

type MapToolbarProps = {
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  items: ItemSummary[];
  itemId: string;
  onItemChange: (itemId: string) => void;
  placementArmed: boolean;
  onTogglePlacement: () => void;
  onResetView: () => void;
  disabled?: boolean;
  editing?: boolean;
};

export function MapToolbar({ mode, onModeChange, items, itemId, onItemChange, placementArmed, onTogglePlacement, onResetView, disabled, editing = false }: MapToolbarProps) {
  return <div className={`map-command-bar${editing ? " is-editing" : " is-viewing"}`} aria-label="Map controls">
    <div className="map-mode-switch" role="group" aria-label="Map dimension">
      <button type="button" className={mode === "2d" ? "active" : "secondary"} aria-pressed={mode === "2d"} onClick={() => onModeChange("2d")}>2D</button>
      <button type="button" className={mode === "3d" ? "active" : "secondary"} aria-pressed={mode === "3d"} onClick={() => onModeChange("3d")}>3D</button>
    </div>
    {editing && <div className="map-placement-command">
      <label>
        Page to place
        <select value={itemId} onChange={(event) => onItemChange(event.target.value)} disabled={disabled || placementArmed}>
          <option value="">Choose a page</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.title}{item.status === "archived" ? " (archived)" : ""}</option>)}
        </select>
      </label>
      <button type="button" className={placementArmed ? "active" : "secondary"} aria-pressed={placementArmed} disabled={disabled || (!itemId && !placementArmed)} onClick={onTogglePlacement}>
        {placementArmed ? "Cancel placing" : "Add marker"}
      </button>
      <span className="meta" role="status">{placementArmed ? "Placement armed — choose a point on the map." : "Explore freely. Map clicks do not add markers."}</span>
    </div>}
    <button type="button" className="secondary map-reset" onClick={onResetView}>Reset view</button>
  </div>;
}
