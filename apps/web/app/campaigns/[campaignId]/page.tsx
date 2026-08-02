"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createApiClient, type ItemKind, type ItemSummary, type PublicationSummary, type Template } from "@dm-hq/api-client";
import TemplateFields from "@/components/template-fields";

const client = createApiClient();

export default function CampaignPage() {
  const params = useParams<{ campaignId: string }>();
  const router = useRouter();
  const campaignId = params.campaignId;
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [publications, setPublications] = useState<PublicationSummary[]>([]);
  const [handoutUrl, setHandoutUrl] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ItemKind>("note");
  const [subjectType, setSubjectType] = useState("person");
  const [body, setBody] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { const [itemResult, templateResult, publicationResult] = await Promise.all([client.items(campaignId), client.templates(campaignId), client.publications(campaignId)]); setItems(itemResult.items); setTemplates(templateResult.templates); setPublications(publicationResult.publications); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign could not be loaded."); }
  }
  // Loading remote campaign state is intentionally isolated in an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [campaignId]);

  async function create(event: FormEvent) {
    event.preventDefault(); if (!name.trim()) return; setBusy(true); setError("");
    try { const templateName = kind === "session" ? "Session" : kind === "entity" && subjectType === "person" ? "Person / NPC" : ""; const template = templates.find((candidate) => candidate.name === templateName); const item = await client.createItem(campaignId, { kind, title: name, body, subject_type: subjectType, template_id: template?.id, fields: kind === "note" ? undefined : fieldValues }); router.push(`/campaigns/${campaignId}/items/${item.id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Item could not be created."); }
    finally { setBusy(false); }
  }

  function updateField(key: string, value: unknown) { setFieldValues((current) => ({ ...current, [key]: value })); }

  async function search(event: FormEvent) { event.preventDefault(); if (!query.trim()) return load(); setBusy(true); try { setItems((await client.search(campaignId, query)).items); } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); } finally { setBusy(false); } }

  function toggleSelection(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }

  async function revokePublication(id: string) {
    try { await client.revokePublication(id); setPublications((current) => current.map((publication) => publication.id === id ? { ...publication, status: "revoked" } : publication)); setMessage("Publication revoked."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Publication could not be revoked."); }
  }

  async function publishSelected() {
    if (!selectedIds.length) return; setBusy(true); setError(""); setMessage("");
    try {
      const publication = await client.createPublication(campaignId, selectedIds.map((id) => ({ item_id: id, title: items.find((item) => item.id === id)?.title ?? "", body: "", fields: {} })));
      setHandoutUrl(publication.url ?? "");
      setPublications((current) => [{ id: publication.id, status: publication.status, version: publication.version, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), url: publication.url, item_ids: selectedIds }, ...current]);
      setMessage("Player handout published.");
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Publication failed."); }
    finally { setBusy(false); }
  }

  const templateName = kind === "session" ? "Session" : kind === "entity" && subjectType === "person" ? "Person / NPC" : "";
  const activeFields = templates.find((template) => template.name === templateName)?.versions[0]?.fields ?? [];

  return <main className="shell"><header className="masthead"><div><Link className="back-link" href="/">← Campaigns</Link><div className="eyebrow">Archive workspace</div><h1>Make it findable.</h1></div><p className="lede">Capture first. Add structure when it helps. Every note, entity, and session keeps a stable place in the campaign.</p></header><div className="workspace archive-workspace"><section className="panel"><div className="panel-heading"><div><div className="eyebrow">Campaign archive</div><h2>Knowledge</h2></div><form className="search-form" onSubmit={search}><input aria-label="Search archive" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, prose, alias, tag" /><button className="secondary">Search</button></form></div>{items.length === 0 ? <p className="empty">Nothing captured yet. Start with a note or a person.</p> : <div className="item-list">{items.map((item) => <article className="item-card" key={item.id}><label className="checkbox-label"><input type="checkbox" aria-label={`Select ${item.title} for publication`} checked={selectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)} /> Select for player handout</label><Link href={`/campaigns/${campaignId}/items/${item.id}`}><span className="item-kind">{item.kind}</span><strong>{item.title}</strong><span className="meta">{item.status} · updated {new Date(item.updated_at).toLocaleDateString()}</span></Link></article>)}</div>}{selectedIds.length > 0 && <div className="selection-bar"><span className="meta">{selectedIds.length} item{selectedIds.length === 1 ? "" : "s"} selected</span><button className="secondary" disabled={busy} onClick={() => void publishSelected()}>Publish selected</button></div>}{message && <p className="success" role="status">{message}</p>}{handoutUrl && <p className="success">Handout link: <a href={handoutUrl}>Open player handout</a></p>}{publications.length > 0 && <div className="revision-list"><div className="eyebrow">Player handouts</div>{publications.map((publication) => <div className="revision-row" key={publication.id}><span className="meta">v{publication.version} · {publication.status}</span><span>{publication.url ? <a href={publication.url}>Open handout</a> : <span className="meta">Republish to create a recoverable link</span>}</span>{publication.status === "active" && <button type="button" className="secondary" onClick={() => void revokePublication(publication.id)}>Revoke</button>}</div>)}</div>}{error && <p className="error" role="alert">{error}</p>}</section><aside className="panel"><div className="eyebrow">Quick capture</div><h2>Add to the Archive</h2><form onSubmit={create} style={{ marginTop: 18 }}><label>Title<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Mara Venn" /></label><label>Kind<select value={kind} onChange={(event) => { setKind(event.target.value as ItemKind); setFieldValues({}); }}><option value="note">Note</option><option value="entity">Entity</option><option value="session">Session</option></select></label>{kind === "entity" && <label>Subject type<select value={subjectType} onChange={(event) => { setSubjectType(event.target.value); setFieldValues({}); }}><option value="person">Person / NPC</option><option value="place">Place</option><option value="faction">Faction</option><option value="thing">Thing</option><option value="event">Event</option><option value="lore">Lore</option></select></label>}{activeFields.length > 0 && <fieldset className="template-fields"><legend>{templateName} fields</legend><p className="meta">Enter structured values directly. Additional Markdown is optional extension prose.</p><TemplateFields fields={activeFields} values={fieldValues} onChange={updateField} /></fieldset>}<label>{kind === "note" ? "Markdown note" : "Additional Markdown (optional)"}<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should you remember?" rows={7} /></label><button disabled={busy || !name.trim()}>{busy ? "Saving…" : "Capture item"}</button></form></aside></div></main>;
}
