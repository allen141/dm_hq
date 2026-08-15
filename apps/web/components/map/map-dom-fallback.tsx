"use client";

import { useState, type MouseEvent } from "react";
import { pointerToMapPoint } from "@/lib/map-coordinates";
import type { MapCanvasProps } from "@/lib/map-types";

type MapDomFallbackProps = MapCanvasProps & {
  reason?: string;
};

export function MapDomFallback({
  background,
  items,
  placements,
  selectedPlacementId,
  placementArmed = false,
  className,
  onSelectPlacement,
  onPlace,
  reason,
}: MapDomFallbackProps) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [imageFailed, setImageFailed] = useState(false);
  const itemById = new Map(items.map((item) => [item.id, item]));

  function handleStageClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    if (placementArmed && onPlace) {
      onPlace(pointerToMapPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()));
    } else {
      onSelectPlacement?.(null);
    }
  }

  return (
    <div className={className ? `map-dom-fallback ${className}` : "map-dom-fallback"}>
      {reason && <p className="map-renderer-notice">Interactive graphics unavailable. Using the accessible map.</p>}
      <div
        className="map-dom-stage"
        style={{ aspectRatio, position: "relative", overflow: "hidden" }}
        onClick={handleStageClick}
        data-placement-armed={placementArmed || undefined}
      >
        {imageFailed || !background.url ? (
          <div className="map-unavailable">Background image unavailable. Your placements are still safe.</div>
        ) : (
          // The canonical background is intentionally fetched by the browser, never by DM HQ.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={background.url}
            alt={background.alt}
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setAspectRatio(image.naturalWidth / image.naturalHeight);
              }
            }}
            onError={() => setImageFailed(true)}
            style={{ display: "block", width: "100%", height: "100%" }}
          />
        )}
        {placements.map((placement, index) => {
          const item = itemById.get(placement.item_id);
          const label = placement.caption || item?.title || `Map marker ${index + 1}`;
          return (
            <button
              type="button"
              key={placement.id}
              className={`map-marker map-marker-${item?.kind ?? "note"}${placement.id === selectedPlacementId ? " selected" : ""}${item?.status === "archived" ? " archived" : ""}`}
              style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, position: "absolute" }}
              aria-label={label}
              title={label}
              aria-pressed={placement.id === selectedPlacementId}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPlacement?.(placement.id);
              }}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MapDomFallback;
