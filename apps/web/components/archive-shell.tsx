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
    { label: "Wiki", href: `/campaigns/${campaignId}/archive`, active: pathname === `/campaigns/${campaignId}/archive` || pathname.includes("/archive/items/") },
    { label: "Graph", href: `/campaigns/${campaignId}/archive/graph`, active: pathname.includes("/archive/graph") },
    ...(firstMap ? [{ label: "Maps", href: `/campaigns/${campaignId}/archive/maps/${firstMap.id}`, active: pathname.includes("/archive/maps/") }] : []),
    ...(firstRelationship ? [{ label: "Relationships", href: `/campaigns/${campaignId}/archive/relationships/${firstRelationship.id}`, active: pathname.includes("/archive/relationships/") }] : []),
  ];

  return <main className="archive-shell">
    <header className="archive-topbar">
      <div className="archive-topbar-copy"><Link className="back-link" href="/">← Campaigns</Link><div className="archive-kicker"><span className="eyebrow">The Archive</span><span className="privacy-badge">Private workspace</span></div><h1>{campaign?.name ?? "Campaign Archive"}</h1><p className="archive-subtitle">Campaign knowledge, connected and ready at the table.</p></div>
      <div className="archive-utilities" aria-label="Archive utilities">
        <Link className="button secondary" href={`/campaigns/${campaignId}/archive?focus=search`}>Search</Link>
        <Link className="button secondary" href={`/campaigns/${campaignId}/archive?focus=capture`}>Quick capture</Link>
        <Link className="button" href={`/campaigns/${campaignId}/archive/views/new`}>New view</Link>
      </div>
    </header>
    <nav className="archive-tabs" aria-label="Archive views">
      {tabs.map((tab) => <Link key={tab.label} href={tab.href} aria-current={tab.active ? "page" : undefined} className={tab.active ? "active" : undefined}>{tab.label}</Link>)}
    </nav>
    {children}
  </main>;
}
