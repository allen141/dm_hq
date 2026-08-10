"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createApiClient, type GraphResponse } from "@dm-hq/api-client";
import { archiveDocumentHref } from "@/lib/archive-routes";

const client = createApiClient();
const classes = ["document_link", "reference", "relationship"] as const;

export default function ArchiveGraphTablePage() {
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
    void client.archiveGraph(campaignId, { focus_id: focusId, depth: focusId ? depth : undefined, edge_classes: edgeClasses })
      .then((result) => { if (active) setGraph(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Graph table could not be loaded."); })
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
    <section className="archive-view-page graph-table-page" aria-labelledby="graph-table-title">
      <div className="archive-page-heading"><div><Link className="back-link" href={`/campaigns/${campaignId}/archive/graph${focusId ? `?focus_id=${encodeURIComponent(focusId)}` : ""}`}>← Back to immersive graph</Link><div className="eyebrow">Accessible graph view · private</div><h2 id="graph-table-title">Graph table</h2><p className="meta">The same directional facts as the visual atlas, presented as a keyboard-friendly table.</p></div></div>
      <div className="graph-table-toolbar">{focusId && <fieldset className="graph-depth-control"><legend>Exploration depth</legend><button type="button" className={depth === 1 ? "active" : "secondary"} aria-pressed={depth === 1} onClick={() => setDepth(1)}>One hop</button><button type="button" className={depth === 2 ? "active" : "secondary"} aria-pressed={depth === 2} onClick={() => setDepth(2)}>Two hops</button></fieldset>}<fieldset className="graph-filters"><legend>Connection types</legend>{classes.map((edgeClass) => <label className="checkbox-label" key={edgeClass}><input type="checkbox" checked={edgeClasses.includes(edgeClass)} disabled={edgeClasses.length === 1 && edgeClasses.includes(edgeClass)} onChange={() => toggle(edgeClass)} /> {edgeClass.replace("_", " ")}</label>)}</fieldset></div>
      {busy && <p className="meta" role="status">Building table…</p>}{error && <p className="error" role="alert">{error}</p>}
      {graph && <div className="graph-table-card"><div className="graph-table-summary"><span>{graph.nodes.length} pages</span><span>{graph.edges.length} connections</span><span>{focusId ? `${depth} ${depth === 1 ? "hop" : "hops"}` : "Overview"}</span></div><div className="table-scroll"><table><caption className="sr-only">Directional graph relationships</caption><thead><tr><th scope="col">From</th><th scope="col">Relationship</th><th scope="col">To</th><th scope="col">Class</th></tr></thead><tbody>{graph.edges.map((edge) => { const source = graph.nodes.find((node) => node.id === edge.source_id); const target = graph.nodes.find((node) => node.id === edge.target_id); return <tr key={`${edge.edge_class}-${edge.id}`}><td>{source ? <Link href={archiveDocumentHref(campaignId, source.id, source.node_type)}>{source.title}</Link> : edge.source_id}</td><td>{edge.label || edge.kind}</td><td>{target ? <Link href={archiveDocumentHref(campaignId, target.id, target.node_type)}>{target.title}</Link> : edge.target_id}</td><td>{edge.edge_class.replace("_", " ")}</td></tr>; })}</tbody></table></div></div>}
    </section>
  );
}
