"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createApiClient, type ArchiveViewSummary, type Campaign } from "@dm-hq/api-client";
import { ThemeSwitcher } from "@/components/theme-switcher";

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
  const mapWorkspace = pathname.includes("/archive/maps/") && !pathname.endsWith("/edit");
  const relationshipWorkspace = pathname.includes("/archive/relationships/") && !pathname.endsWith("/edit");
  const visualizationWorkspace = graphWorkspace || mapWorkspace || relationshipWorkspace;
  const mapRoute = pathname.match(/\/archive\/maps\/([^/]+)/);
  const mapViewId = mapRoute?.[1];
  const mapEditing = Boolean(mapViewId && pathname.endsWith("/edit"));
  const relationshipRoute = pathname.match(/\/archive\/relationships\/([^/]+)/);
  const relationshipViewId = relationshipRoute?.[1];
  const relationshipEditing = Boolean(relationshipViewId && pathname.endsWith("/edit"));

  return <main className={`archive-shell${visualizationWorkspace ? " visualization-shell" : ""}${graphWorkspace ? " graph-shell" : ""}${mapWorkspace ? " map-shell" : ""}${relationshipWorkspace ? " relationship-shell" : ""}`}>
    <header className="archive-topbar">
      <div className="archive-heading-group">
        <Link className="back-link" href="/"><span aria-hidden="true">←</span> <span className="archive-back-label">Campaigns</span></Link>
        <div className="archive-title-lockup">
          <span className="archive-sigil" aria-hidden="true"><span>DM</span></span>
          <h1>{campaign?.name ?? "Campaign Archive"}</h1>
        </div>
      </div>
      <div className="archive-utilities" aria-label="Archive utilities">
        {mapViewId && <Link className="button secondary archive-context-action" href={`/campaigns/${campaignId}/archive/maps/${mapViewId}${mapEditing ? "" : "/edit"}`}>{mapEditing ? "View map" : "Edit map"}</Link>}
        {relationshipViewId && <Link className="button secondary archive-context-action" href={`/campaigns/${campaignId}/archive/relationships/${relationshipViewId}${relationshipEditing ? "" : "/edit"}`}>{relationshipEditing ? "View relationships" : "Edit relationships"}</Link>}
        <Link className="button secondary archive-utility" href={`/campaigns/${campaignId}/archive?focus=search`}><span aria-hidden="true">⌕</span> <span className="archive-utility-label">Search</span></Link>
        <Link className="button secondary archive-utility" href={`/campaigns/${campaignId}/archive?focus=capture`}><span aria-hidden="true">＋</span> <span className="archive-utility-label">Quick capture</span></Link>
        <ThemeSwitcher className="theme-switcher theme-switcher-archive" label="Theme" />
        <Link className="button archive-primary-action" href={`/campaigns/${campaignId}/archive/views/new`}><span className="archive-utility-label">New view</span> <span aria-hidden="true">↗</span></Link>
      </div>
    </header>
    <nav className="archive-tabs" aria-label="Archive views">
      {tabs.map((tab) => <Link key={tab.label} href={tab.href} aria-current={tab.active ? "page" : undefined} className={tab.active ? "active" : undefined}><span className="archive-tab-glyph" aria-hidden="true">{tab.glyph}</span><span>{tab.label}</span></Link>)}
    </nav>
    {children}
  </main>;
}
