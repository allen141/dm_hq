"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState, type ReactNode } from "react";
import { createApiClient, type ArchiveHome, type ItemKind, type ItemSummary } from "@dm-hq/api-client";
import { newItemMarkdown } from "@/lib/archive-markdown";

const client = createApiClient();

type NavigationNode = {
  id: string;
  type: "group" | "page";
  label?: string;
  target?: { type: "item" | "campaign"; id: string };
  children?: NavigationNode[];
};

function NavigationTree({ nodes, campaignId }: { nodes: NavigationNode[]; campaignId: string }): ReactNode {
  return nodes.map((node) => {
    if (node.type === "group") {
      return <li key={node.id}><details open><summary>{node.label || "Untitled group"}</summary><ul>{NavigationTree({ nodes: node.children || [], campaignId })}</ul></details></li>;
    }
    const target = node.target;
    const href = target?.type === "item"
      ? `/campaigns/${campaignId}/archive/items/${target.id}`
      : `/campaigns/${campaignId}/archive`;
    return <li key={node.id}><Link href={href}>{node.label || "Untitled page"}</Link></li>;
  });
}

export default function ArchiveWikiPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [home, setHome] = useState<ArchiveHome | null>(null);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("note");
  const [body, setBody] = useState("");
  const [editingHome, setEditingHome] = useState(false);
  const [homeMarkdown, setHomeMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const itemResult = await client.items(campaignId);
      setItems(itemResult.items);
      try { const result = await client.archiveHome(campaignId); setHome(result); setHomeMarkdown(result.markdown); } catch { setHome(null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Archive could not be loaded."); }
  }

  // Loading campaign-owned Archive state is the external synchronization performed here.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [campaignId]);
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus) document.getElementById(focus)?.focus();
  }, [searchParams]);

  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setItems((await client.search(campaignId, query)).items); } catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); } finally { setBusy(false); }
  }

  async function capture(event: FormEvent) {
    event.preventDefault(); if (!title.trim()) return; setBusy(true); setError("");
    try {
      const item = await client.createItem(campaignId, { kind, markdown: newItemMarkdown(campaignId, kind, title.trim(), body) });
      router.push(`/campaigns/${campaignId}/archive/items/${item.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Document could not be created."); } finally { setBusy(false); }
  }

  async function saveHome(event: FormEvent) {
    event.preventDefault(); if (!home) return; setBusy(true); setError("");
    try { const result = await client.updateArchiveHome(campaignId, { version: home.version, markdown: homeMarkdown }); setHome(result); setHomeMarkdown(result.markdown); setEditingHome(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign home could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="archive-layout">
    <aside className="archive-sidebar" aria-label="Wiki navigation">
      <div className="eyebrow">Wiki navigation</div>
      <ul className="archive-tree">
        <li><Link aria-current="page" href={`/campaigns/${campaignId}/archive`}>Campaign home</Link></li>
        {(() => {
          const archive = (home?.metadata as { archive?: { navigation?: NavigationNode[] } } | undefined)?.archive;
          const navigation = archive?.navigation || [];
          return navigation.length ? NavigationTree({ nodes: navigation, campaignId }) : <li><details open><summary>Pages</summary><ul>{items.map((item) => <li key={item.id}><Link href={`/campaigns/${campaignId}/archive/items/${item.id}`}>{item.title}{item.status === "archived" && <span className="meta"> (archived)</span>}</Link></li>)}</ul></details></li>;
        })()}
      </ul>
    </aside>
    <section className="archive-content">
      <div className="archive-page-heading"><div><div className="eyebrow">Campaign home · campaign.md</div><h2>Wiki</h2></div>{home && <button type="button" className="secondary" onClick={() => setEditingHome((value) => !value)}>{editingHome ? "Cancel" : "Edit home"}</button>}</div>
      {editingHome && home ? <form onSubmit={saveHome}><label>Canonical campaign Markdown<textarea value={homeMarkdown} onChange={(event) => setHomeMarkdown(event.target.value)} rows={24} /></label><button disabled={busy}>Save campaign.md</button></form> : home ? <article className="markdown-reader" dangerouslySetInnerHTML={{ __html: home.html }} /> : <div className="empty-state"><h3>Your campaign wiki starts here.</h3><p>The campaign-home API is not available yet. Archive pages, search, and quick capture remain usable while it is being connected.</p></div>}
      <section className="archive-index" aria-labelledby="archive-pages-heading"><h3 id="archive-pages-heading">All pages</h3>{items.length ? <div className="item-list">{items.map((item) => <article className="item-card" key={item.id}><Link href={`/campaigns/${campaignId}/archive/items/${item.id}`}><span className="item-kind">{item.kind}</span><strong>{item.title}</strong><span className="meta">{item.status} · v{item.version}</span></Link></article>)}</div> : <p className="empty">Nothing captured yet.</p>}</section>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <aside className="archive-tools">
      <form className="panel" onSubmit={search}><div className="eyebrow">Find knowledge</div><label>Search archive<input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="People, places, notes…" /></label><button className="secondary" disabled={busy}>Search</button></form>
      <form className="panel" onSubmit={capture}><div className="eyebrow">Quick capture</div><label>Title<input id="capture" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Marra Venn" /></label><label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}><option value="note">Note</option><option value="entity">Entity</option><option value="session">Session</option></select></label><label>Markdown<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} placeholder="What should you remember?" /></label><button disabled={busy || !title.trim()}>Capture page</button></form>
    </aside>
  </div>;
}
