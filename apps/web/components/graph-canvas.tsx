"use client";

import Link from "next/link";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { archiveDocumentHref } from "@/lib/archive-routes";

export default function GraphCanvas({ campaignId, nodes, edges, focusId }: { campaignId: string; nodes: GraphNode[]; edges: GraphEdge[]; focusId?: string }) {
  if (!nodes.length) return <div className="graph-empty">No connected pages in this view.</div>;
  const width = 900; const height = Math.max(420, Math.ceil(nodes.length / 4) * 170);
  const positioned = nodes.map((node, index) => ({ ...node, x: 125 + (index % 4) * 220, y: 90 + Math.floor(index / 4) * 165 }));
  const positions = new Map(positioned.map((node) => [node.id, node]));
  return <div className="graph-canvas" role="img" aria-label={`Relationship graph with ${nodes.length} pages and ${edges.length} connections`}>
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs>
      {edges.map((edge) => { const source = positions.get(edge.source_id); const target = positions.get(edge.target_id); if (!source || !target) return null; return <g key={`${edge.edge_class}-${edge.id}`}><line className={`graph-edge ${edge.edge_class}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd="url(#arrow)" /><text className="graph-label" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6}>{edge.label || edge.kind}</text></g>; })}
      {positioned.map((node) => <g key={node.id} className={`graph-node ${node.id === focusId ? "focus" : ""}`}><rect x={node.x - 78} y={node.y - 30} width="156" height="60" rx="12" /><text x={node.x} y={node.y - 3} textAnchor="middle">{node.title.slice(0, 22)}</text><text className="graph-node-kind" x={node.x} y={node.y + 15} textAnchor="middle">{node.kind}</text></g>)}
    </svg>
    <div className="sr-only">{nodes.map((node) => <Link key={node.id} href={archiveDocumentHref(campaignId, node.id, node.node_type)}>{node.title}</Link>)}</div>
  </div>;
}
