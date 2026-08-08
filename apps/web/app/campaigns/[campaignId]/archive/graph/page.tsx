"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createApiClient, type GraphResponse } from "@dm-hq/api-client";
import GraphCanvas from "@/components/graph-canvas";

const client = createApiClient();
const classes = ["document_link", "reference", "relationship"] as const;

export default function ArchiveGraphPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus_id") ?? undefined;
  const [depth, setDepth] = useState<1 | 2>(1);
  const [edgeClasses, setEdgeClasses] = useState<string[]>([...classes]);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    // Fetching graph data is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    setError("");
    void client.archiveGraph(campaignId, { focus_id: focusId, depth, edge_classes: edgeClasses })
      .then((result) => { if (active) setGraph(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Graph could not be loaded."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [campaignId, depth, edgeClasses, focusId]);

  function toggle(edgeClass: string) {
    setEdgeClasses((current) => {
      if (current.includes(edgeClass)) return current.length === 1 ? current : current.filter((value) => value !== edgeClass);
      return [...current, edgeClass];
    });
  }

  return (
    <section className="archive-view-page graph-page" aria-labelledby="graph-page-title">
      {graph && <GraphCanvas campaignId={campaignId} nodes={graph.nodes} edges={graph.edges} focusId={graph.focus_id} />}
      <div className="graph-interface">
        <div className="graph-page-heading archive-page-heading">
          <div>
            <div className="eyebrow">Private campaign atlas · immersive view</div>
            <h2 id="graph-page-title">Knowledge graph</h2>
            <p className="graph-page-description">The graph is the workspace. Trace the threads between people, places, sessions, and secrets, then bring the controls forward only when you need them.</p>
          </div>
          {graph && <div className="graph-vitals" aria-label="Graph totals"><span><strong>{graph.nodes.length}</strong> pages</span><span><strong>{graph.edges.length}</strong> connections</span><span><strong>{depth}</strong> {depth === 1 ? "hop" : "hops"}</span></div>}
        </div>

        <div className="graph-command-deck">
          <fieldset className="graph-depth-control"><legend>Exploration depth</legend><button type="button" className={depth === 1 ? "active" : "secondary"} aria-pressed={depth === 1} onClick={() => setDepth(1)}>One hop</button><button type="button" className={depth === 2 ? "active" : "secondary"} aria-pressed={depth === 2} onClick={() => setDepth(2)}>Two hops</button></fieldset>
          <fieldset className="graph-filters"><legend>Connection types</legend>{classes.map((edgeClass) => <label className="graph-filter-chip" key={edgeClass}><input type="checkbox" checked={edgeClasses.includes(edgeClass)} disabled={edgeClasses.length === 1 && edgeClasses.includes(edgeClass)} onChange={() => toggle(edgeClass)} /><span className={`edge-swatch ${edgeClass}`} aria-hidden="true" />{edgeClass.replace("_", " ")}</label>)}</fieldset>
          <Link className="button secondary graph-table-link" href={`/campaigns/${campaignId}/archive/graph/table${focusId ? `?focus_id=${encodeURIComponent(focusId)}` : ""}`}>Accessible graph table <span aria-hidden="true">↗</span></Link>
        </div>

        <div className="graph-status-line" aria-live="polite">{busy && <span role="status"><span className="status-orbit" aria-hidden="true" /> Rebuilding the atlas…</span>}{!busy && graph && <span>Focused on {graph.nodes.find((node) => node.id === graph.focus_id)?.title ?? "campaign home"}</span>}</div>
        {error && <p className="error" role="alert">{error}</p>}
        {graph && (graph.truncated.nodes || graph.truncated.edges) && <p className="notice graph-truncation-notice">This view reached its safety limit. Narrow the connection types or return to a one-hop view.</p>}
        {!graph && busy && <div className="graph-loading-card" role="status">Charting the campaign atlas…</div>}
      </div>
    </section>
  );
}
