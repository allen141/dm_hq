"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createApiClient, type ArchiveItem } from "@dm-hq/api-client";

const client = createApiClient();

export default function ItemPage() {
  const params = useParams<{ campaignId: string; itemId: string }>();
  const [item, setItem] = useState<ArchiveItem | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("draft");
  const [fields, setFields] = useState("{}");
  const [targetId, setTargetId] = useState("");
  const [relationshipKind, setRelationshipKind] = useState("connected_to");
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() { try { const current = await client.item(params.itemId); setItem(current); setTitle(current.title); setBody(current.body); setStatus(current.status); setFields(JSON.stringify(current.entity?.fields ?? {}, null, 2)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Item could not be loaded."); } }
  // Loading remote item state is intentionally isolated in an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [params.itemId]);

  async function save(event: FormEvent) { event.preventDefault(); if (!item) return; setBusy(true); setError(""); setMessage(""); try { const parsed = item.kind === "entity" ? JSON.parse(fields) as Record<string, unknown> : undefined; const updated = await client.updateItem(item.id, { version: item.version, title, body, status, fields: parsed }); setItem(updated); setMessage("Saved as a new revision."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); } finally { setBusy(false); } }

  async function promote() { if (!item) return; try { const updated = await client.promote(item.id, { version: item.version, subject_type: "person" }); setItem(updated); setMessage("Promoted to a Person / NPC."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Promotion failed."); } }
  async function connect(event: FormEvent) { event.preventDefault(); if (!item || !targetId) return; try { await client.relationship(item.id, { target_id: targetId, kind: relationshipKind }); setMessage("Relationship added."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Relationship failed."); } }
  async function publish() { if (!item) return; try { const publication = await client.createPublication(params.campaignId, [{ item_id: item.id, title: item.title, body: item.body, fields: item.entity?.fields ?? {} }]); setShareUrl(`${window.location.origin}${publication.url ?? `/p/${publication.token ?? ""}`}`); setMessage("Player snapshot published."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication failed."); } }
  async function exportCampaign() { try { const blob = await client.exportCampaign(params.campaignId); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "campaign-archive.zip"; link.click(); URL.revokeObjectURL(url); setMessage("Campaign export downloaded."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); } }

  if (!item) return <main className="shell"><p className="empty">Loading Archive item…</p>{error && <p className="error">{error}</p>}</main>;
  return <main className="shell"><header className="masthead"><div><Link className="back-link" href={`/campaigns/${params.campaignId}`}>← Campaign</Link><div className="eyebrow">{item.kind} · {item.status}</div><h1>{item.title}</h1></div><p className="lede">This is a durable campaign record. Private source content stays separate from anything you publish.</p></header><div className="workspace archive-workspace"><section className="panel"><form onSubmit={save}><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Draft</option><option value="canon">Canon</option><option value="archived">Archived</option></select></label><label>Markdown source<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} /></label>{item.kind === "entity" && <label>Template fields (JSON)<textarea value={fields} onChange={(event) => setFields(event.target.value)} rows={8} /></label>}<button disabled={busy}>{busy ? "Saving…" : "Save revision"}</button></form><div className="preview"><div className="eyebrow">Sanitized preview</div><div dangerouslySetInnerHTML={{ __html: item.html }} /></div></section><aside className="panel"><div className="eyebrow">Next actions</div><div className="action-stack">{item.kind === "note" && <button className="secondary" onClick={promote}>Promote to Person / NPC</button>}<button className="secondary" onClick={publish}>Publish player snapshot</button><button className="secondary" onClick={exportCampaign}>Export campaign</button></div>{shareUrl && <p className="success">Player link: <a href={shareUrl}>{shareUrl}</a></p>}<form onSubmit={connect} className="connect-form"><div className="eyebrow">Connect records</div><label>Target item UUID<input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="Paste another item ID" /></label><label>Relationship kind<input value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value)} /></label><button className="secondary">Add relationship</button></form>{item.relationships.length > 0 && <div><div className="eyebrow">Relationships</div>{item.relationships.map((relationship) => <p className="meta" key={relationship.id}>{relationship.kind} → {relationship.target_id}</p>)}</div>}{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</aside></div></main>;
}
