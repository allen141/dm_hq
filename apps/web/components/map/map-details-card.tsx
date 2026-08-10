"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { ArchiveItem, ItemSummary, MapPlacement, PageIdentity } from "@dm-hq/api-client";

type MapDetailsCardProps = {
  campaignId: string;
  placement: MapPlacement;
  identity?: ItemSummary | PageIdentity;
  item?: ArchiveItem | null;
  excerpt?: string;
  loading?: boolean;
  error?: string;
  onClose: () => void;
};

export function MapDetailsCard({ campaignId, placement, identity, item, excerpt, loading, error, onClose }: MapDetailsCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const title = item?.title ?? identity?.title ?? placement.item_id;
  const kind = item?.kind ?? identity?.kind ?? "page";
  const status = item?.status ?? identity?.status ?? "unknown";
  const titleId = `map-details-title-${placement.id}`;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();
    return () => { previousFocusRef.current?.focus(); };
  }, [placement.id]);

  return <article
    ref={cardRef}
    className="map-summary-card"
    role="dialog"
    aria-modal="false"
    aria-labelledby={titleId}
    tabIndex={-1}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
  >
    <div className="map-marker-heading">
      <div>
        <span className="map-kind-badge">{kind}</span>
        <span className={`map-status-badge${status === "archived" ? " archived" : ""}`}>{status}</span>
        <h3 id={titleId}>{title}</h3>
      </div>
      <button type="button" className="secondary" aria-label="Close marker details" onClick={onClose}>×</button>
    </div>
    {placement.caption && <p className="map-marker-caption">{placement.caption}</p>}
    {loading && <p className="meta" role="status">Loading page summary…</p>}
    {!loading && error && <p className="map-detail-error" role="alert">{error}</p>}
    {!loading && !error && <p>{excerpt || "This page does not have a written summary yet."}</p>}
    <Link href={`/campaigns/${campaignId}/archive/items/${placement.item_id}`}>Open full Archive page →</Link>
    <span className="meta">Press Escape to close.</span>
  </article>;
}
