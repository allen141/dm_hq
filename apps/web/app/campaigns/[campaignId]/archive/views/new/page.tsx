"use client";

import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createApiClient } from "@dm-hq/api-client";

const client = createApiClient();
export default function NewArchiveViewPage() {
  const { campaignId } = useParams<{ campaignId: string }>(); const router = useRouter(); const [viewType, setViewType] = useState<"map" | "relationship">("map"); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const view = await client.createArchiveView(campaignId, { view_type: viewType, title, description, ...(viewType === "map" ? { background: { url: "https://example.invalid/map.jpg", alt: `${title} map` }, placements: [] } : { members: [], settings: { orientation: "top_to_bottom", relationship_kinds: [] } }) }); router.push(`/campaigns/${campaignId}/archive/${viewType === "map" ? "maps" : "relationships"}/${view.id}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "View could not be created."); } finally { setBusy(false); } }
  return <section className="archive-view-page narrow"><div className="eyebrow">Optional exploration view</div><h2>New view</h2><form className="panel" onSubmit={create}><fieldset><legend>View type</legend><label className="radio-label"><input type="radio" name="type" checked={viewType === "map"} onChange={() => setViewType("map")} /> Map</label><label className="radio-label"><input type="radio" name="type" checked={viewType === "relationship"} onChange={() => setViewType("relationship")} /> Relationship board</label></fieldset><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={viewType === "map" ? "Harbor District" : "House Venn"} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} /></label><button disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create view"}</button>{error && <p className="error" role="alert">{error}</p>}</form></section>;
}
