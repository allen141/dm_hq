"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createApiClient, type ArchiveViewSummary, type Campaign } from "@dm-hq/api-client";

const client = createApiClient();

export default function ArchiveShell({ campaignId, children }: { campaignId: string; children: ReactNode }) {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [views, setViews] = useState<ArchiveViewSummary[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([client.campaign(campaignId), client.archiveViews(campaignId)])
      .then(([campaignResult, viewResult]) => {
        if (!active) return;
        setCampaign(campaignResult);
        setViews(viewResult.views.filter((view) => view.status === "active"));
      })
      .catch(() => { if (active) void client.campaign(campaignId).then(setCampaign).catch(() => undefined); });
    return () => { active = false; };
  }, [campaignId]);

  const firstMap = useMemo(() => views.find((view) => view.view_type === "map"), [views]);
  const firstRelationship = useMemo(() => views.find((view) => view.view_type === "relationship"), [views]);
  const tabs = [
    { label: "Wiki", glyph: "W", href: `/campaigns/${campaignId}/archive`, active: pathname === `/campaigns/${campaignId}/archive` || pathname.includes("/archive/items/") },
    { label: "Graph", glyph: "G", href: `/campaigns/${campaignId}/archive/graph`, active: pathname.includes("/archive/graph") },
    ...(firstMap ? [{ label: "Maps", glyph: "M", href: `/campaigns/${campaignId}/archive/maps/${firstMap.id}`, active: pathname.includes("/archive/maps/") }] : []),
    ...(firstRelationship ? [{ label: "Relationships", glyph: "R", href: `/campaigns/${campaignId}/archive/relationships/${firstRelationship.id}`, active: pathname.includes("/archive/relationships/") }] : []),
  ];

  const graphWorkspace = pathname.includes("/archive/graph") && !pathname.includes("/archive/graph/table");

  return <main className={`archive-shell${graphWorkspace ? " graph-shell" : ""}`}>
    <header className="archive-topbar">
      <div className="archive-heading-group">
        <Link className="back-link" href="/"><span aria-hidden="true">←</span> Campaigns</Link>
        <div className="archive-title-lockup">
          <span className="archive-sigil" aria-hidden="true"><span>DM</span></span>
          <div>
            <div className="eyebrow">Private Archive · Campaign intelligence</div>
            <h1>{campaign?.name ?? "Campaign Archive"}</h1>
            <p className="archive-context">World index, connections, and field views</p>
          </div>
        </div>
      </div>
      <div className="archive-utilities" aria-label="Archive utilities">
        <Link className="button secondary archive-utility" href={`/campaigns/${campaignId}/archive?focus=search`}><span aria-hidden="true">⌕</span> Search</Link>
        <Link className="button secondary archive-utility" href={`/campaigns/${campaignId}/archive?focus=capture`}><span aria-hidden="true">＋</span> Quick capture</Link>
        <Link className="button archive-primary-action" href={`/campaigns/${campaignId}/archive/views/new`}>New view <span aria-hidden="true">↗</span></Link>
      </div>
    </header>
    <nav className="archive-tabs" aria-label="Archive views">
      {tabs.map((tab) => <Link key={tab.label} href={tab.href} aria-current={tab.active ? "page" : undefined} className={tab.active ? "active" : undefined}><span className="archive-tab-glyph" aria-hidden="true">{tab.glyph}</span><span>{tab.label}</span></Link>)}
    </nav>
    {children}
  </main>;
}
