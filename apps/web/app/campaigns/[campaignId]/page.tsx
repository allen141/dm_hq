"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createApiClient, type ItemKind, type ItemSummary, type Template } from "@dm-hq/api-client";

const client = createApiClient();

export default function CampaignPage() {
  const params = useParams<{ campaignId: string }>();
  const router = useRouter();
  const campaignId = params.campaignId;
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemKind>("note");
  const [subjectType, setSubjectType] = useState("person");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() { try { setItems((await client.items(campaignId)).items); setTemplates((await client.templates(campaignId)).templates); } catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign could not be loaded."); } }
  // Loading remote campaign state is intentionally isolated in an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [campaignId]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setBusy(true); setError("");
    try { const template = templates.find((candidate) => candidate.name === "Person / NPC"); const item = await client.createItem(campaignId, { kind, title: name, body, subject_type: subjectType, template_id: kind === "entity" ? template?.id : undefined }); router.push(`/campaigns/${campaignId}/items/${item.id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Item could not be created."); }
    finally { setBusy(false); }
  }

  async function search(event: FormEvent) { event.preventDefault(); if (!query.trim()) return load(); setBusy(true); try { setItems((await client.search(campaignId, query)).items); } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); } finally { setBusy(false); } }

  return <main className="shell"><header className="masthead"><div><Link className="back-link" href="/">← Campaigns</Link><div className="eyebrow">Archive workspace</div><h1>Make it findable.</h1></div><p className="lede">Capture first. Add structure when it helps. Every note, entity, and session keeps a stable place in the campaign.</p></header><div className="workspace archive-workspace"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">Campaign archive</div><h2>Knowledge</h2></div><form className="search-form" onSubmit={search}><input aria-label="Search archive" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, prose, alias, tag" /><button className="secondary">Search</button></form></div>{items.length === 0 ? <p className="empty">Nothing captured yet. Start with a note or a person.</p> : <div className="item-list">{items.map((item) => <Link className="item-card" href={`/campaigns/${campaignId}/items/${item.id}`} key={item.id}><span className="item-kind">{item.kind}</span><strong>{item.title}</strong><span className="meta">{item.status} · updated {new Date(item.updated_at).toLocaleDateString()}</span></Link>)}</div>}</section><aside className="panel"><div className="eyebrow">Quick capture</div><h2>Add to the Archive</h2><form onSubmit={create} style={{ marginTop: 18 }}><label>Title<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mara Venn" /></label><label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}><option value="note">Note</option><option value="entity">Entity</option><option value="session">Session</option></select></label>{kind === "entity" && <label>Subject type<select value={subjectType} onChange={(event) => setSubjectType(event.target.value)}><option value="person">Person / NPC</option><option value="place">Place</option><option value="faction">Faction</option><option value="thing">Thing</option><option value="event">Event</option><option value="lore">Lore</option></select></label>}<label>Markdown note<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should you remember?" rows={7} /></label><button disabled={busy || !name.trim()}>{busy ? "Saving…" : "Capture item"}</button></form>{error && <p className="error" role="alert">{error}</p>}</aside></div></main>;
}
