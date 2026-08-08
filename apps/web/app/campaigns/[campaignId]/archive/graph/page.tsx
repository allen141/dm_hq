"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createApiClient, type GraphResponse } from "@dm-hq/api-client";
import GraphCanvas from "@/components/graph-canvas";

const client = createApiClient();
const classes = ["document_link", "reference", "relationship"] as const;

export default function ArchiveGraphPage() {
  const { campaignId } = useParams<{ campaignId: string }>(); const searchParams = useSearchParams();
  const focusId = searchParams.get("focus_id") ?? undefined;
  const [depth, setDepth] = useState<1 | 2>(1); const [edgeClasses, setEdgeClasses] = useState<string[]>([...classes]);
  const [graph, setGraph] = useState<GraphResponse | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  // Fetching graph data is the external synchronization performed by this effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let active = true; setBusy(true); setError("");
    void client.archiveGraph(campaignId, { focus_id: focusId, depth, edge_classes: edgeClasses }).then((result) => { if (active) setGraph(result); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Graph could not be loaded."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [campaignId, depth, edgeClasses, focusId]);

  function toggle(edgeClass: string) { setEdgeClasses((current) => current.includes(edgeClass) ? current.filter((value) => value !== edgeClass) : [...current, edgeClass]); }
  return <section className="archive-view-page">
    <div className="archive-page-heading"><div><div className="eyebrow">Derived from canonical Markdown</div><h2>Knowledge graph</h2><p className="meta">Explore direct links, references, and authored relationships without changing campaign facts.</p></div><label>Depth<select value={depth} onChange={(event) => setDepth(Number(event.target.value) as 1 | 2)}><option value="1">One hop</option><option value="2">Two hops</option></select></label></div>
    <fieldset className="graph-filters"><legend>Connection types</legend>{classes.map((edgeClass) => <label className="checkbox-label" key={edgeClass}><input type="checkbox" checked={edgeClasses.includes(edgeClass)} onChange={() => toggle(edgeClass)} /> {edgeClass.replace("_", " ")}</label>)}</fieldset>
    {busy && <p className="meta" role="status">Building graph…</p>}{error && <p className="error" role="alert">{error}</p>}
    {graph && <><GraphCanvas campaignId={campaignId} nodes={graph.nodes} edges={graph.edges} focusId={graph.focus_id} />{(graph.truncated.nodes || graph.truncated.edges) && <p className="notice">This view reached its safety limit. Narrow the connection types or return to a one-hop view.</p>}<details className="graph-table" open><summary>Accessible graph table</summary><div className="table-scroll"><table><thead><tr><th>From</th><th>Relationship</th><th>To</th><th>Class</th></tr></thead><tbody>{graph.edges.map((edge) => { const source = graph.nodes.find((node) => node.id === edge.source_id); const target = graph.nodes.find((node) => node.id === edge.target_id); return <tr key={`${edge.edge_class}-${edge.id}`}><td>{source ? <Link href={`/campaigns/${campaignId}/archive/items/${source.id}`}>{source.title}</Link> : edge.source_id}</td><td>{edge.label || edge.kind}</td><td>{target ? <Link href={`/campaigns/${campaignId}/archive/items/${target.id}`}>{target.title}</Link> : edge.target_id}</td><td>{edge.edge_class.replace("_", " ")}</td></tr>; })}</tbody></table></div></details></>}
  </section>;
}
