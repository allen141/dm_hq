"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createApiClient, type ArchiveItem, type PublicationSummary, type TemplateField } from "@dm-hq/api-client";

const client = createApiClient();
type Revision = { number: number; reason: string; created_at: string; snapshot: Record<string, unknown> };
const SUBJECT_TYPES = ["person", "place", "faction", "thing", "event", "lore"] as const;

function displaySubjectType(subjectType: string): string {
  return subjectType === "person" ? "Person / NPC" : subjectType.charAt(0).toUpperCase() + subjectType.slice(1);
}

export default function ItemPage() {
  const params = useParams<{ campaignId: string; itemId: string }>();
  const [item, setItem] = useState<ArchiveItem | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [handouts, setHandouts] = useState<PublicationSummary[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("draft");
  const [subjectType, setSubjectType] = useState("person");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [aliases, setAliases] = useState("");
  const [tags, setTags] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [sessionStatus, setSessionStatus] = useState("planned");
  const [outcomeText, setOutcomeText] = useState("");
  const [targetId, setTargetId] = useState("");
  const [relationshipKind, setRelationshipKind] = useState("connected_to");
  const [shareUrl, setShareUrl] = useState("");
  const [includeBody, setIncludeBody] = useState(true);
  const [includeFields, setIncludeFields] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [current, history, publicationResult] = await Promise.all([
        client.item(params.itemId),
        client.revisions(params.itemId),
        client.publications(params.campaignId),
      ]);
      setItem(current);
      setRevisions(history.revisions);
      setHandouts(publicationResult.publications.filter((publication) => publication.item_ids.includes(params.itemId)));
      setTitle(current.title);
      setBody(current.body);
      setStatus(current.status);
      setSubjectType(current.entity?.subject_type ?? "person");
      setFields(current.entity?.fields ?? {});
      setAliases(current.aliases.join(", "));
      setTags(current.tags.join(", "));
      setScheduledFor(current.session?.scheduled_for ?? "");
      setSessionStatus(current.session?.session_status ?? "planned");
      setOutcomeText(current.session?.outcome_text ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Item could not be loaded.");
    }
  }

  // Loading remote item state is intentionally isolated in an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [params.itemId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await client.updateItem(item.id, {
        version: item.version,
        title,
        body,
        status,
        subject_type: item.kind === "entity" ? subjectType : undefined,
        fields: item.kind === "entity" ? fields : undefined,
        aliases: aliases.split(","),
        tags: tags.split(","),
        scheduled_for: scheduledFor || undefined,
        session_status: sessionStatus,
        outcome_text: outcomeText,
      });
      setItem(updated);
      setMessage("Saved as a new revision.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function updateField(key: string, value: unknown) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function renderTemplateField(field: TemplateField) {
    const value = fields[field.key];
    const label = `${field.label}${field.required ? " *" : ""}`;
    if (field.type === "boolean") {
      return <label className="checkbox-label" key={field.key}><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateField(field.key, event.target.checked)} /> {label}</label>;
    }
    if (field.type === "long_text") {
      return <label key={field.key}>{label}<textarea value={typeof value === "string" ? value : ""} onChange={(event) => updateField(field.key, event.target.value)} rows={3} /></label>;
    }
    if (field.type === "choice") {
      return <label key={field.key}>{label}<select value={typeof value === "string" ? value : ""} onChange={(event) => updateField(field.key, event.target.value)}><option value="">Select…</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
    }
    const inputType = field.type === "number" ? "number" : field.type === "calendar_date" ? "date" : "text";
    return <label key={field.key}>{label}<input type={inputType} value={value === undefined || value === null ? "" : String(value)} onChange={(event) => updateField(field.key, field.type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} /></label>;
  }

  async function promote() { if (!item) return; try { const updated = await client.promote(item.id, { version: item.version, subject_type: "person" }); setItem(updated); setMessage("Promoted to a Person / NPC."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Promotion failed."); } }
  async function connect(event: FormEvent) { event.preventDefault(); if (!item || !targetId) return; try { await client.relationship(item.id, { target_id: targetId, kind: relationshipKind }); setMessage("Relationship added."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Relationship failed."); } }
  async function linkSession() { if (!item || !targetId) return; try { await client.sessionLink(item.id, targetId); setMessage("Item linked to session."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Session link failed."); } }
  async function publish() { if (!item) return; try { const publication = await client.createPublication(params.campaignId, [{ item_id: item.id, title: item.title, body: includeBody ? item.body : "", fields: includeFields ? item.entity?.fields ?? {} : {} }]); setShareUrl(`${window.location.origin}${publication.url ?? `/p/${publication.token ?? ""}`}`); setHandouts((current) => [{ id: publication.id, status: publication.status, version: publication.version, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), url: publication.url, item_ids: [item.id] }, ...current]); setMessage("Player handout published."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication failed."); } }
  async function restoreRevision(number: number) { if (!item) return; try { const restored = await client.restore(item.id, { version: item.version, revision: number }); setItem(restored); setMessage(`Revision ${number} restored as a new revision.`); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); } }
  async function exportCampaign() { try { const blob = await client.exportCampaign(params.campaignId); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "campaign-archive.zip"; link.click(); URL.revokeObjectURL(url); setMessage("Campaign export downloaded."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); } }
  async function restoreCampaign() { if (!restoreFile) return; try { const campaign = await client.restoreCampaign(restoreFile); setMessage(`Restored campaign: ${campaign.name}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign restore failed."); } }

  if (!item) return <main className="shell"><p className="empty">Loading Archive item…</p>{error && <p className="error">{error}</p>}</main>;
  const templateFields = item.entity?.template_fields ?? [];
  return <main className="shell">
    <header className="masthead"><div><Link className="back-link" href={`/campaigns/${params.campaignId}`}>← Campaign</Link><div className="eyebrow">{item.kind} · {item.status}{item.kind === "entity" ? ` · ${displaySubjectType(subjectType)}` : ""}</div><h1>{item.title}</h1></div><p className="lede">{item.kind === "session" ? "Capture what happened and connect the session to the campaign records it changed." : item.kind === "entity" ? "Give this campaign record the structure it needs, while keeping private source content separate from anything you publish." : "This is a durable campaign record. Private source content stays separate from anything you publish."}</p></header>
    <div className="workspace archive-workspace"><section className="panel"><form onSubmit={save}>
      <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Draft</option><option value="canon">Canon</option><option value="archived">Archived</option></select></label>
      {item.kind === "entity" && <label>Subject type<select value={subjectType} onChange={(event) => setSubjectType(event.target.value)}>{SUBJECT_TYPES.map((type) => <option key={type} value={type}>{displaySubjectType(type)}</option>)}</select></label>}
      <label>Aliases<input value={aliases} onChange={(event) => setAliases(event.target.value)} placeholder="Mara, The Ferrymaster" /></label>
      <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="harbor, faction" /></label>
      <label>Markdown source<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} /></label>
      {item.kind === "entity" && <fieldset className="template-fields"><legend>{displaySubjectType(subjectType)} details</legend><p className="meta">Template fields · version {item.entity?.template_version ?? "none"}. These are manual reference fields; derived calculations are not applied.</p>{templateFields.length > 0 ? templateFields.map(renderTemplateField) : <p className="empty">No template fields are assigned to this entity.</p>}</fieldset>}
      {item.kind === "session" && <fieldset className="session-fields"><legend>Session details</legend><label>Scheduled date<input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /></label><label>Session status<select value={sessionStatus} onChange={(event) => setSessionStatus(event.target.value)}><option value="planned">Planned</option><option value="completed">Completed</option></select></label><label>Outcome / scratch capture<textarea value={outcomeText} onChange={(event) => setOutcomeText(event.target.value)} rows={7} /></label></fieldset>}
      <button disabled={busy}>{busy ? "Saving…" : "Save revision"}</button>
    </form><div className="preview"><div className="eyebrow">Sanitized preview</div><div dangerouslySetInnerHTML={{ __html: item.html }} /></div></section>
    <aside className="panel"><div className="eyebrow">Next actions</div>{item.kind === "entity" && <div className="publication-options"><div className="eyebrow">Player-safe selection</div><label className="checkbox-label"><input type="checkbox" checked={includeBody} onChange={(event) => setIncludeBody(event.target.checked)} /> Include prose</label><label className="checkbox-label"><input type="checkbox" checked={includeFields} onChange={(event) => setIncludeFields(event.target.checked)} /> Include template fields</label></div>}<div className="action-stack">{item.kind === "note" && <button className="secondary" onClick={promote}>Promote to Person / NPC</button>}<button className="secondary" onClick={publish}>Publish player snapshot</button><button className="secondary" onClick={exportCampaign}>Export campaign</button></div>{shareUrl && <p className="success">Player link: <a href={shareUrl}>Open player handout</a></p>}{handouts.length > 0 && <div className="revision-list"><div className="eyebrow">Handouts for this item</div>{handouts.map((handout) => <div className="revision-row" key={handout.id}><span className="meta">v{handout.version} · {handout.status}</span>{handout.url ? <a href={handout.url}>Open handout</a> : <span className="meta">Republish to create a recoverable link</span>}</div>)}</div>}<form onSubmit={connect} className="connect-form"><div className="eyebrow">Connect records</div><label>Target item UUID<input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="Paste another item ID" /></label><label>Relationship kind<input value={relationshipKind} onChange={(event) => setRelationshipKind(event.target.value)} /></label><button className="secondary">Add relationship</button>{item.kind === "session" && <button type="button" className="secondary" onClick={() => void linkSession()}>Link target to session</button>}</form>{revisions.length > 1 && <div className="revision-list"><div className="eyebrow">Revision history</div>{revisions.map((revision) => <div className="revision-row" key={revision.number}><span className="meta">v{revision.number} · {revision.reason || "Saved"}</span>{revision.number !== item.version && <button type="button" className="secondary" onClick={() => void restoreRevision(revision.number)}>Restore</button>}</div>)}</div>}<div className="connect-form"><div className="eyebrow">Restore campaign export</div><input type="file" accept=".zip,application/zip" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} /><button type="button" className="secondary" disabled={!restoreFile} onClick={() => void restoreCampaign()}>Restore as new campaign</button></div>{item.relationships.length > 0 && <div><div className="eyebrow">Relationships</div>{item.relationships.map((relationship) => <p className="meta" key={relationship.id}>{relationship.kind} → {relationship.target_id}</p>)}</div>}{message && <p className="success" role="status">{message}</p>}{error && <p className="error" role="alert">{error}</p>}</aside></div></main>;
}
