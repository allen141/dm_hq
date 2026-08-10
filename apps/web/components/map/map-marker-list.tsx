"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import type { ItemSummary, MapPlacement, PageIdentity } from "@dm-hq/api-client";

type MapMarkerListProps = {
  placements: MapPlacement[];
  items: ItemSummary[];
  selectedPlacementId: string | null;
  busy?: boolean;
  onSelect: (placementId: string) => void;
  onChange: (placementId: string, key: "x" | "y" | "caption", value: string) => void;
  onNudge: (placementId: string, deltaX: number, deltaY: number) => void;
  onRemove: (placementId: string) => void;
  onSave: () => void;
};

function placementIdentity(placement: MapPlacement, items: ItemSummary[]): ItemSummary | PageIdentity | undefined {
  return items.find((item) => item.id === placement.item_id) ?? placement.item;
}

export function MapMarkerList({ placements, items, selectedPlacementId, busy, onSelect, onChange, onNudge, onRemove, onSave }: MapMarkerListProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return placements;
    return placements.filter((placement) => {
      const identity = placementIdentity(placement, items);
      return [identity?.title, identity?.kind, identity?.status, placement.caption].some((value) => value?.toLocaleLowerCase().includes(normalized));
    });
  }, [items, placements, query]);

  function nudge(event: KeyboardEvent, placement: MapPlacement) {
    if (!event.shiftKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const amount = 0.01;
    onSelect(placement.id);
    onNudge(placement.id, event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0, event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0);
  }

  return <section className="map-marker-list" aria-labelledby="map-marker-list-heading">
    <div className="map-marker-heading">
      <div><div className="eyebrow">Map index</div><h3 id="map-marker-list-heading">Markers <span className="meta">({placements.length})</span></h3></div>
      <button type="button" disabled={busy || placements.length === 0} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</button>
    </div>
    <label className="map-marker-search">
      Search markers
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, kind, status, or caption" />
    </label>
    <p className="meta">Focus a marker and use Shift + arrow keys to nudge it.</p>
    <div className="map-marker-results">
      {filtered.map((placement, index) => {
        const identity = placementIdentity(placement, items);
        const title = identity?.title ?? placement.item_id;
        return <article
          key={placement.id}
          className={`map-marker-editor${selectedPlacementId === placement.id ? " selected" : ""}`}
          aria-current={selectedPlacementId === placement.id ? "true" : undefined}
          onClick={() => onSelect(placement.id)}
          onFocus={() => onSelect(placement.id)}
          onKeyDown={(event) => nudge(event, placement)}
        >
          <div className="map-marker-heading">
            <strong><span className="meta">{placements.indexOf(placement) + 1}.</span> {title}</strong>
            <span><span className="map-kind-badge">{identity?.kind ?? "page"}</span> <span className={"map-status-badge" + (identity?.status === "archived" ? " archived" : "")}>{identity?.status ?? "unknown"}</span></span>
          </div>
          <div className="map-coordinate-grid">
            <label>X<input aria-label={`X coordinate for ${title}`} type="number" min="0" max="1" step="0.01" value={placement.x} onChange={(event) => onChange(placement.id, "x", event.target.value)} /></label>
            <label>Y<input aria-label={`Y coordinate for ${title}`} type="number" min="0" max="1" step="0.01" value={placement.y} onChange={(event) => onChange(placement.id, "y", event.target.value)} /></label>
          </div>
          <label>Caption<input aria-label={`Caption for ${title}`} value={placement.caption} onChange={(event) => onChange(placement.id, "caption", event.target.value)} placeholder="What is here?" /></label>
          <div className="map-marker-actions">
            <button type="button" className="secondary" aria-label={`Show details for ${title}`} onClick={() => onSelect(placement.id)}>Show details</button>
            <button type="button" className="secondary" disabled={busy} aria-label={`Remove ${title} marker ${index + 1}`} onClick={(event) => { event.stopPropagation(); onRemove(placement.id); }}>Remove</button>
          </div>
        </article>;
      })}
      {placements.length === 0 && <div className="map-empty-state"><strong>No markers yet.</strong><p>Choose a page, select Add marker, then choose a point on the map.</p></div>}
      {placements.length > 0 && filtered.length === 0 && <div className="map-empty-state"><strong>No matching markers.</strong><p>Try a title, kind, status, or caption.</p></div>}
    </div>
  </section>;
}
