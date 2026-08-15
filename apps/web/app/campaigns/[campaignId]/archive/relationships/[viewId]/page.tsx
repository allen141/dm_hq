"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ApiError, createApiClient, type ArchiveViewDocument, type ArchiveViewSummary,
  type GraphNode, type ItemSummary, type RelationshipMember, type RelationshipViewSettings,
} from "@dm-hq/api-client";
import RelationshipGraphCanvas from "@/components/relationships/relationship-graph-canvas";

const client = createApiClient();
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `member-${Date.now()}`;
const defaults: RelationshipViewSettings = {
  layout_mode: "network", orientation: "top_to_bottom", root_item_id: null,
  relationship_kinds: [], layout_relationship_kinds: [], layout_direction: "outgoing",
};
const settingsFor = (view: ArchiveViewDocument): RelationshipViewSettings => ({ ...defaults, ...view.settings });
const memberNode = (member: RelationshipMember): GraphNode => ({
  id: member.item_id, node_type: "item", title: member.item?.title ?? member.item_id,
  kind: member.item?.kind ?? "page", status: member.item?.status ?? "draft",
});

export default function RelationshipViewPage() {
  const { campaignId, viewId } = useParams<{ campaignId: string; viewId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const editing = pathname.endsWith("/edit");
  const [view, setView] = useState<ArchiveViewDocument | null>(null);
  const [boards, setBoards] = useState<ArchiveViewSummary[]>([]);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [selectedItem, setSelectedItem] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const [result, boardResult, itemResult] = await Promise.all([
        client.archiveView(campaignId, viewId), client.archiveViews(campaignId, true),
        editing ? client.items(campaignId, "limit=100") : Promise.resolve(null),
      ]);
      setView(result);
      setBoards(boardResult.views.filter((candidate) => candidate.view_type === "relationship"));
      setItems(itemResult?.items ?? []);
      setSelectedItem(""); setConflicted(false);
    } catch (cause) {
      setView(null);
      setError(cause instanceof Error ? cause.message : "Relationship board could not be loaded.");
    } finally { setLoading(false); }
  }, [campaignId, editing, viewId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const nodes = useMemo(() => view?.members.map(memberNode) ?? [], [view]);
  const settings = view ? settingsFor(view) : defaults;
  const availableKinds = useMemo(() => view ? Array.from(new Set([
    ...(view.available_relationship_kinds ?? []), ...(view.edges ?? []).map((edge) => edge.kind),
  ])).sort((left, right) => left.localeCompare(right)) : [], [view]);

  const save = useCallback(async (next: ArchiveViewDocument, successMessage = "Relationship board saved.") => {
    if (busy || conflicted) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.updateArchiveView(campaignId, next.id, {
        version: next.version, view_type: "relationship", title: next.title, description: next.description,
        members: next.members.map(({ id, item_id, position }) => ({ id, item_id, position })),
        settings: settingsFor(next),
      });
      setView(result); setMessage(successMessage); return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflicted(true);
        setError("This relationship board changed elsewhere. Reload before saving; your local changes have not been merged.");
      } else setError(cause instanceof Error ? cause.message : "Relationship board could not be saved.");
      return false;
    } finally { setBusy(false); }
  }, [busy, campaignId, conflicted]);

  function editView(change: (current: ArchiveViewDocument) => ArchiveViewDocument) {
    setMessage(""); setView((current) => current ? change(current) : current);
  }
  function editSettings(patch: Partial<RelationshipViewSettings>) {
    editView((current) => ({ ...current, settings: { ...settingsFor(current), ...patch } }));
  }
  function toggleVisibleKind(kind: string) {
    const relationshipKinds = toggle(settings.relationship_kinds, kind);
    const layoutRelationshipKinds = relationshipKinds.length
      ? settings.layout_relationship_kinds.filter((candidate) => relationshipKinds.includes(candidate))
      : settings.layout_relationship_kinds;
    editSettings({ relationship_kinds: relationshipKinds, layout_relationship_kinds: layoutRelationshipKinds });
  }
  async function submitDetails(event: FormEvent) { event.preventDefault(); if (view) await save(view, "Board details saved."); }

  async function addMember() {
    if (!view || !selectedItem) return;
    const item = items.find((candidate) => candidate.id === selectedItem);
    const member: RelationshipMember = {
      id: uuid(), item_id: selectedItem, position: null,
      item: item && { id: item.id, title: item.title, kind: item.kind, status: item.status },
    };
    if (await save({ ...view, members: [...view.members, member] }, "Member added.")) setSelectedItem("");
  }

  async function removeMember(memberId: string) {
    if (!view) return;
    const members = view.members.filter((member) => member.id !== memberId);
    const retainedIds = new Set(members.map((member) => member.item_id));
    const currentSettings = settingsFor(view);
    await save({ ...view, members, settings: {
      ...currentSettings,
      root_item_id: currentSettings.root_item_id && retainedIds.has(currentSettings.root_item_id) ? currentSettings.root_item_id : null,
    } }, "Member removed.");
  }

  async function changeArchiveStatus() {
    if (!view || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = view.status === "archived"
        ? await client.restoreArchiveView(campaignId, view.id, view.version)
        : await client.archiveArchiveView(campaignId, view.id, view.version);
      setView(result);
      setMessage(result.status === "archived" ? "Relationship board archived. Its membership and settings remain recoverable." : "Relationship board restored.");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflicted(true); setError("This relationship board changed elsewhere. Reload before changing its status.");
      } else setError(cause instanceof Error ? cause.message : "Relationship board status could not be changed.");
    } finally { setBusy(false); }
  }

  if (loading) return <section className="archive-view-page relationship-product-page"><div className="relationship-loading-card" role="status"><div className="eyebrow">Tracing connections</div><h2>Loading relationship board…</h2><p>Preparing members and canonical relationship facts.</p></div></section>;
  if (!view) return <section className="archive-view-page relationship-product-page"><div className="relationship-empty-state"><h2>Relationship board unavailable</h2><p>{error || "This board could not be loaded."}</p><button type="button" onClick={() => void load()}>Try again</button></div></section>;

  const isArchived = view.status === "archived";
  const unavailableItems = items.filter((item) => !view.members.some((member) => member.item_id === item.id));
  return <section className={`archive-view-page relationship-product-page${editing ? " relationship-editor-page" : " visualization-page relationship-viewer-page"}`}>
    {editing ? <>
      <div className="archive-page-heading">
        <div><div className="eyebrow">Relationship knowledge · DM private · {view.status}</div><h2>{view.title}</h2><p>Choose what belongs on this board and how its canonical relationships are arranged.</p></div>
        <button type="button" className="secondary" disabled={busy} onClick={() => void changeArchiveStatus()}>{isArchived ? "Restore view" : "Archive view"}</button>
      </div>
      <form className="relationship-details-editor panel" onSubmit={submitDetails}>
        <label>Board title<input required value={view.title} disabled={isArchived} onChange={(event) => editView((current) => ({ ...current, title: event.target.value }))} /></label>
        <label>Purpose<textarea value={view.description ?? ""} disabled={isArchived} onChange={(event) => editView((current) => ({ ...current, description: event.target.value }))} /></label>
        <button disabled={busy || conflicted || isArchived || !view.title.trim()}>{busy ? "Saving…" : "Save details"}</button>
      </form>
      <div className="relationship-editor-grid">
        <section className="panel relationship-settings-editor" aria-labelledby="relationship-layout-heading">
          <div><div className="eyebrow">Presentation</div><h3 id="relationship-layout-heading">Layout</h3></div>
          <label>Layout mode<select value={settings.layout_mode} disabled={isArchived} onChange={(event) => editSettings({ layout_mode: event.target.value as RelationshipViewSettings["layout_mode"] })}><option value="network">Network</option><option value="hierarchy">Hierarchy</option></select></label>
          <label>Orientation<select value={settings.orientation} disabled={isArchived || settings.layout_mode !== "hierarchy"} onChange={(event) => editSettings({ orientation: event.target.value as RelationshipViewSettings["orientation"] })}><option value="top_to_bottom">Top to bottom</option><option value="left_to_right">Left to right</option></select></label>
          <label>Hierarchy direction<select value={settings.layout_direction} disabled={isArchived || settings.layout_mode !== "hierarchy"} onChange={(event) => editSettings({ layout_direction: event.target.value as RelationshipViewSettings["layout_direction"] })}><option value="outgoing">Follow outgoing relationships</option><option value="incoming">Follow incoming relationships</option></select></label>
          <label>Root member<select value={settings.root_item_id ?? ""} disabled={isArchived || settings.layout_mode !== "hierarchy"} onChange={(event) => editSettings({ root_item_id: event.target.value || null })}><option value="">Automatic</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
          <KindOptions title="Visible relationship kinds" hint="None selected means all" kinds={availableKinds} selected={settings.relationship_kinds} disabled={isArchived} empty="No relationship kinds are present yet." onToggle={toggleVisibleKind} />
          <KindOptions title="Hierarchy relationships" hint="None selected means all visible kinds" kinds={settings.relationship_kinds.length ? availableKinds.filter((kind) => settings.relationship_kinds.includes(kind)) : availableKinds} selected={settings.layout_relationship_kinds} disabled={isArchived || settings.layout_mode !== "hierarchy"} empty="Add relationship facts to configure hierarchy edges." onToggle={(kind) => editSettings({ layout_relationship_kinds: toggle(settings.layout_relationship_kinds, kind) })} />
          <button type="button" disabled={busy || conflicted || isArchived} onClick={() => void save(view, "Layout settings saved.")}>{busy ? "Saving…" : "Save layout"}</button>
        </section>
        <section className="panel relationship-member-editor" aria-labelledby="relationship-members-heading">
          <div><div className="eyebrow">Board scope</div><h3 id="relationship-members-heading">Members <span>{view.members.length}</span></h3></div>
          <div className="relationship-add-member"><label>Add Archive page<select value={selectedItem} disabled={isArchived} onChange={(event) => setSelectedItem(event.target.value)}><option value="">Choose a page</option>{unavailableItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button type="button" disabled={busy || conflicted || isArchived || !selectedItem} onClick={() => void addMember()}>Add member</button></div>
          <ul className="member-list">{view.members.map((member) => <li key={member.id}><div><strong>{member.item?.title ?? member.item_id}</strong><small>{member.item?.kind ?? "page"}</small></div><div><Link href={`/campaigns/${campaignId}/archive/items/${member.item_id}`}>Open page</Link><button type="button" className="secondary" disabled={busy || conflicted || isArchived} onClick={() => void removeMember(member.id)}>Remove</button></div></li>)}</ul>
        </section>
      </div>
    </> : <>
      <h2 className="sr-only">{view.title}</h2>
      <div className="relationship-viewer-summary visualization-panel">
        <div><div className="eyebrow">Relationship knowledge · DM private</div><strong>{view.title}</strong><span>{nodes.length} members · {(view.edges ?? []).length} relationships</span></div>
        {boards.length > 1 && <label>Board<select aria-label="Relationship board" value={view.id} onChange={(event) => router.push(`/campaigns/${campaignId}/archive/relationships/${event.target.value}`)}>{boards.map((board) => <option key={board.id} value={board.id}>{board.title}{board.status === "archived" ? " (archived)" : ""}</option>)}</select></label>}
      </div>
      {isArchived && <p className="relationship-archived-notice visualization-panel">This board is archived and remains available for recovery. Restore it from the editor to continue using it.</p>}
      <RelationshipGraphCanvas campaignId={campaignId} nodes={nodes} edges={view.edges ?? []} layoutMode={settings.layout_mode} orientation={settings.orientation} rootId={settings.root_item_id} visibleRelationshipKinds={settings.relationship_kinds} layoutRelationshipKinds={settings.layout_relationship_kinds} layoutDirection={settings.layout_direction} />
    </>}
    {message && <p className="success" role="status">{message}</p>}
    {error && <div className="error" role="alert"><p>{error}</p>{conflicted && <button type="button" className="secondary" onClick={() => void load()}>Reload board</button>}</div>}
  </section>;
}

function KindOptions({ title, hint, kinds, selected, disabled, empty, onToggle }: { title: string; hint: string; kinds: string[]; selected: string[]; disabled: boolean; empty: string; onToggle: (kind: string) => void }) {
  return <fieldset disabled={disabled}><legend>{title} <span>{hint}</span></legend>{kinds.length ? kinds.map((kind) => <label className="relationship-kind-option" key={kind}><input type="checkbox" checked={selected.includes(kind)} onChange={() => onToggle(kind)} />{humanize(kind)}</label>) : <p className="empty">{empty}</p>}</fieldset>;
}
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value]; }
function humanize(value: string) { return value.replaceAll("_", " "); }
