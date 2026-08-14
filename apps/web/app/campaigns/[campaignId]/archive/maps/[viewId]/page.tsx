"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ApiError, createApiClient, type ArchiveItem, type ArchiveViewDocument, type ItemSummary, type MapPlacement } from "@dm-hq/api-client";

import { MapMarkerList } from "@/components/map/map-marker-list";
import { MapLocationIndex } from "@/components/map/map-location-index";
import { MapToolbar } from "@/components/map/map-toolbar";
import { MapWorkspace } from "@/components/map/map-workspace";
import type { MapMode, MapPoint } from "@/lib/map-types";
import { markdownExcerpt } from "@/lib/map-summary";

const client = createApiClient();
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `placement-${Date.now()}`;
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export default function MapViewPage() {
  const { campaignId, viewId } = useParams<{ campaignId: string; viewId: string }>();
  const pathname = usePathname();
  const editing = pathname.endsWith("/edit");
  const [view, setView] = useState<ArchiveViewDocument | null>(null);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundAlt, setBackgroundAlt] = useState("");
  const [mode, setMode] = useState<MapMode>("2d");
  const [placementItemId, setPlacementItemId] = useState("");
  const [placementArmed, setPlacementArmed] = useState(false);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null);
  const [selectedItemLoading, setSelectedItemLoading] = useState(false);
  const [selectedItemError, setSelectedItemError] = useState("");
  const [resetToken, setResetToken] = useState(0);
  const [rendererError, setRendererError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const itemCache = useRef(new Map<string, ArchiveItem>());
  const latestItemVersion = useRef(new Map<string, number>());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [result, itemResult] = await Promise.all([client.archiveView(campaignId, viewId), client.items(campaignId)]);
      setView(result);
      setItems(itemResult.items);
      setBackgroundUrl(result.background?.url ?? "");
      setBackgroundAlt(result.background?.alt ?? "");
      setSelectedPlacementId(null);
      setPlacementArmed(false);
      setRendererError("");
      setConflicted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Map could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, viewId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const selectedPlacement = useMemo(() => view?.placements.find((placement) => placement.id === selectedPlacementId), [selectedPlacementId, view]);
  const selectedSummary = useMemo(() => items.find((item) => item.id === selectedPlacement?.item_id), [items, selectedPlacement?.item_id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      const itemId = selectedPlacement?.item_id;
      if (!itemId) { setSelectedItem(null); setSelectedItemError(""); setSelectedItemLoading(false); return; }
      const listedVersion = selectedSummary?.version;
      const lastVersion = latestItemVersion.current.get(itemId);
      const expectedVersion = listedVersion === undefined ? lastVersion : Math.max(listedVersion, lastVersion ?? 0);
      const cached = expectedVersion === undefined ? undefined : itemCache.current.get(itemId + ":" + expectedVersion);
      if (cached) { setSelectedItem(cached); setSelectedItemError(""); setSelectedItemLoading(false); return; }
      setSelectedItem(null); setSelectedItemError(""); setSelectedItemLoading(true);
      void client.item(itemId).then((result) => {
        itemCache.current.set(result.id + ":" + result.version, result);
        latestItemVersion.current.set(result.id, result.version);
        if (active) setSelectedItem(result);
      }).catch((cause) => {
        if (active) setSelectedItemError(cause instanceof Error ? cause.message : "Page summary could not be loaded.");
      }).finally(() => { if (active) setSelectedItemLoading(false); });
    });
    return () => { active = false; };
  }, [selectedPlacement?.item_id, selectedSummary?.version]);

  const save = useCallback(async (nextPlacements: MapPlacement[], nextBackground = { url: backgroundUrl, alt: backgroundAlt }, successMessage = "Map view saved.") => {
    if (!view || busy || conflicted) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.updateArchiveView(campaignId, view.id, {
        version: view.version, view_type: "map", title: view.title, description: view.description,
        background: nextBackground,
        placements: nextPlacements.map((placement) => ({ id: placement.id, item_id: placement.item_id, x: placement.x, y: placement.y, caption: placement.caption })),
      });
      setView(result); setMessage(successMessage); return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflicted(true);
        setError("This map changed elsewhere. Reload before saving; your local changes have not been merged.");
      } else setError(cause instanceof Error ? cause.message : "Map could not be saved.");
      return false;
    } finally { setBusy(false); }
  }, [backgroundAlt, backgroundUrl, busy, campaignId, conflicted, view]);

  const handleRendererError = useCallback((cause: Error) => { setRendererError(cause.message || "renderer error"); }, []);

  async function place(point: MapPoint) {
    if (!view || !placementArmed || !placementItemId) return;
    const placement: MapPlacement = { id: uuid(), item_id: placementItemId, x: clamp(point.x), y: clamp(point.y), caption: "" };
    const saved = await save([...view.placements, placement], undefined, "Marker added.");
    if (saved) { setPlacementArmed(false); setSelectedPlacementId(placement.id); }
  }

  function changePlacement(id: string, key: "x" | "y" | "caption", value: string) {
    setView((current) => current ? { ...current, placements: current.placements.map((placement) => placement.id === id ? { ...placement, [key]: key === "caption" ? value : clamp(Number(value)) } : placement) } : current);
  }

  function nudgePlacement(id: string, deltaX: number, deltaY: number) {
    setView((current) => current ? { ...current, placements: current.placements.map((placement) => placement.id === id ? { ...placement, x: clamp(placement.x + deltaX), y: clamp(placement.y + deltaY) } : placement) } : current);
  }

  function movePlacement(id: string, point: MapPoint, phase: "preview" | "commit") {
    if (!view) return;
    const next = view.placements.map((placement) => placement.id === id ? { ...placement, x: clamp(point.x), y: clamp(point.y) } : placement);
    setView({ ...view, placements: next });
    if (phase === "commit") void save(next, undefined, "Marker position saved.");
  }

  async function removePlacement(id: string) {
    if (!view) return;
    const saved = await save(view.placements.filter((placement) => placement.id !== id), undefined, "Marker removed.");
    if (saved && selectedPlacementId === id) setSelectedPlacementId(null);
  }

  async function saveBackground(event: FormEvent) {
    event.preventDefault();
    if (!view) return;
    setRendererError("");
    await save(view.placements, { url: backgroundUrl.trim(), alt: backgroundAlt.trim() }, "Map background saved.");
  }

  async function changeArchiveStatus() {
    if (!view || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = view.status === "archived" ? await client.restoreArchiveView(campaignId, view.id, view.version) : await client.archiveArchiveView(campaignId, view.id, view.version);
      setView(result);
      setMessage(result.status === "archived" ? "Map archived. Its document and markers remain recoverable." : "Map restored.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) { setConflicted(true); setError("This map changed elsewhere. Reload before changing its status."); }
      else setError(cause instanceof Error ? cause.message : "Map status could not be changed.");
    } finally { setBusy(false); }
  }

  if (loading) return <section className="archive-view-page map-product-page"><div className="map-loading-card" role="status"><div className="eyebrow">Charting the terrain</div><h2>Loading map…</h2><p>Preparing markers and the interactive renderer.</p></div></section>;
  if (!view) return <section className="archive-view-page map-product-page"><div className="map-empty-state"><h2>Map unavailable</h2><p>{error || "This map could not be loaded."}</p><button type="button" onClick={() => void load()}>Try again</button></div></section>;

  const isArchived = view.status === "archived";
  return <section className="archive-view-page map-product-page">
    <div className="archive-page-heading">
      <div><div className="eyebrow">Interactive atlas · DM private · {view.status}</div><h2>{view.title}</h2><p>{view.description || "Explore this campaign map in two or three dimensions."}</p></div>
      <div className="archive-page-actions">
        <Link className="button secondary" href={editing ? `/campaigns/${campaignId}/archive/maps/${view.id}` : `/campaigns/${campaignId}/archive/maps/${view.id}/edit`}>{editing ? "View map" : "Edit map"}</Link>
        {editing && <button type="button" className="secondary" disabled={busy} onClick={() => void changeArchiveStatus()}>{isArchived ? "Restore view" : "Archive view"}</button>}
      </div>
    </div>
    {editing ? <p className="map-privacy-notice">External map images are requested directly by your browser with no referrer. The image host still receives the request, may block WebGL use through CORS, and campaign exports contain the URL rather than the image.</p> : <details className="map-privacy-disclosure"><summary>External image privacy</summary><p>The image host receives the browser request. WebGL also requires the host to allow cross-origin textures, and exports retain the URL rather than the image.</p></details>}
    {editing && <form className="map-background-editor" onSubmit={saveBackground}>
      <label>Background HTTPS URL<input type="url" required pattern="https://.*" value={backgroundUrl} onChange={(event) => setBackgroundUrl(event.target.value)} disabled={isArchived} /></label>
      <label>Image description<input required value={backgroundAlt} onChange={(event) => setBackgroundAlt(event.target.value)} disabled={isArchived} /></label>
      <button disabled={busy || conflicted || isArchived || !backgroundUrl.startsWith("https://") || !backgroundAlt.trim()}>{busy ? "Saving…" : "Save background"}</button>
    </form>}
    <MapToolbar mode={mode} onModeChange={setMode} items={items} itemId={placementItemId} onItemChange={setPlacementItemId} placementArmed={placementArmed} onTogglePlacement={() => setPlacementArmed((current) => !current)} onResetView={() => setResetToken((current) => current + 1)} disabled={busy || conflicted || isArchived} editing={editing} />
    <div className={`map-workspace-grid ${editing ? "is-editing" : "is-viewing"}`}>
      <div className="map-viewport-column">
        <MapWorkspace campaignId={campaignId} background={{ url: view.background?.url ?? backgroundUrl, alt: view.background?.alt ?? backgroundAlt }} items={items} placements={view.placements} mode={mode} selectedPlacementId={selectedPlacementId} editing={editing} placementArmed={placementArmed} resetToken={resetToken} selectedItem={selectedItem} selectedExcerpt={selectedItem ? markdownExcerpt(selectedItem.markdown) : undefined} selectedItemLoading={selectedItemLoading} selectedItemError={selectedItemError} rendererError={rendererError} onSelectPlacement={setSelectedPlacementId} onPlace={(point) => void place(point)} onMovePlacement={movePlacement} onRendererError={handleRendererError} />
        {!editing && <MapLocationIndex placements={view.placements} items={items} selectedPlacementId={selectedPlacementId} onSelect={setSelectedPlacementId} />}
      </div>
      {editing && <aside className="map-inspector" aria-label="Marker editor">
        <MapMarkerList placements={view.placements} items={items} selectedPlacementId={selectedPlacementId} busy={busy || conflicted || isArchived} onSelect={setSelectedPlacementId} onChange={changePlacement} onNudge={nudgePlacement} onRemove={(id) => void removePlacement(id)} onSave={() => void save(view.placements, undefined, "Marker changes saved.")} />
      </aside>}
    </div>
    {message && <p className="success" role="status">{message}</p>}
    {error && <div className="error" role="alert"><p>{error}</p>{conflicted && <button type="button" className="secondary" onClick={() => void load()}>Reload map</button>}</div>}
  </section>;
}
