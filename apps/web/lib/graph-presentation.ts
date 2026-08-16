import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { graphEdgeColor, graphNodeColor } from "@/lib/renderer-theme";
import { DEFAULT_THEME_ID, THEME_REGISTRY, type VisualizationPalette } from "@/lib/theme";

export type GraphNodeVisualKind = "campaign" | "note" | "entity" | "session";

export type GraphNodeVisual = GraphNode & {
  visual_kind: GraphNodeVisualKind;
  color: string;
  size: number;
  type: "circle";
  x: number;
  y: number;
};

export type GraphEdgeVisualType = "arrow" | "curved";

export type GraphEdgeVisual = GraphEdge & {
  key: string;
  color: string;
  size: number;
  type: GraphEdgeVisualType;
  curvature: number;
  parallel_index: number;
  parallel_count: number;
};

export type GraphPresentation = {
  nodes: GraphNodeVisual[];
  edges: GraphEdgeVisual[];
};

export type GraphCloud = {
  id: string;
  node_ids: string[];
};

export type SelectedConnectionDirection = "incoming" | "outgoing" | "self";

export type SelectedConnectionSummary = {
  edge: GraphEdge;
  direction: SelectedConnectionDirection;
  neighbor: GraphNode | null;
};

export type SelectedNeighborSummary = {
  node: GraphNode;
  direction: "incoming" | "outgoing" | "bidirectional";
  incoming_count: number;
  outgoing_count: number;
  connection_count: number;
};

export type SelectedNodeSummary = {
  node: GraphNode;
  neighbor_ids: string[];
  neighbors: SelectedNeighborSummary[];
  connections: SelectedConnectionSummary[];
  incoming_count: number;
  outgoing_count: number;
  self_connection_count: number;
};

type NodeVisualStyle = Pick<GraphNodeVisual, "size" | "type"> & {
  radius: number;
  radius_jitter: number;
};

type EdgeVisualStyle = Pick<GraphEdgeVisual, "size" | "type"> & {
  base_curvature: number;
};

export const GRAPH_NODE_STYLES: Readonly<Record<GraphNodeVisualKind, Readonly<NodeVisualStyle>>> = {
  campaign: { size: 17, type: "circle", radius: 0.18, radius_jitter: 0.08 },
  note: { size: 11, type: "circle", radius: 1.25, radius_jitter: 0.28 },
  entity: { size: 13, type: "circle", radius: 1.72, radius_jitter: 0.34 },
  session: { size: 12, type: "circle", radius: 0.82, radius_jitter: 0.2 },
};

export const GRAPH_EDGE_STYLES: Readonly<Record<GraphEdge["edge_class"], Readonly<EdgeVisualStyle>>> = {
  document_link: { size: 1.15, type: "arrow", base_curvature: 0 },
  reference: { size: 1.3, type: "curved", base_curvature: 0.1 },
  relationship: { size: 1.65, type: "curved", base_curvature: 0.16 },
};

const PARALLEL_EDGE_CURVATURE_STEP = 0.18;

export function graphNodeVisualKind(node: GraphNode): GraphNodeVisualKind {
  const kind = node.kind.trim().toLowerCase();
  if (kind === "campaign" || kind === "note" || kind === "entity" || kind === "session") return kind;
  return node.node_type === "campaign" ? "campaign" : "entity";
}

export function buildGraphPresentation(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  palette: VisualizationPalette = THEME_REGISTRY[DEFAULT_THEME_ID].visualization,
): GraphPresentation {
  return {
    nodes: nodes.map((node) => toVisualNode(node, palette)),
    edges: toVisualEdges(edges, palette),
  };
}

// Groups the visible neighborhood into connected clouds while keeping the focused node out of the grouping.
export function buildGraphClouds(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  focusId?: string,
): GraphCloud[] {
  const ids = nodes.map((node) => node.id).filter((id) => id !== focusId).sort(compareStrings);
  const parent = new Map(ids.map((id) => [id, id]));

  function find(id: string): string {
    let root = parent.get(id) ?? id;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
    let current = id;
    while (parent.has(current) && parent.get(current) !== current) {
      const next = parent.get(current) ?? current;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  function union(left: string, right: string) {
    if (!parent.has(left) || !parent.has(right)) return;
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot < rightRoot ? leftRoot : rightRoot);
  }

  for (const edge of edges) {
    if (edge.source_id !== focusId && edge.target_id !== focusId) union(edge.source_id, edge.target_id);
  }

  const grouped = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    grouped.set(root, [...(grouped.get(root) ?? []), id]);
  }

  return Array.from(grouped.values())
    .map((nodeIds) => nodeIds.sort(compareStrings))
    .sort((left, right) => compareStrings(left[0] ?? "", right[0] ?? ""))
    .map((nodeIds) => ({ id: "cloud:" + nodeIds.join(","), node_ids: nodeIds }));
}

export function summarizeSelectedNode(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  selectedNodeId: string,
): SelectedNodeSummary | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedNode = nodeById.get(selectedNodeId);
  if (!selectedNode) return null;

  const connections = edges
    .filter((edge) => edge.source_id === selectedNodeId || edge.target_id === selectedNodeId)
    .slice()
    .sort(compareEdges)
    .map<SelectedConnectionSummary>((edge) => {
      if (edge.source_id === selectedNodeId && edge.target_id === selectedNodeId) {
        return { edge, direction: "self", neighbor: null };
      }

      const outgoing = edge.source_id === selectedNodeId;
      return {
        edge,
        direction: outgoing ? "outgoing" : "incoming",
        neighbor: nodeById.get(outgoing ? edge.target_id : edge.source_id) ?? null,
      };
    });

  const neighborCounts = new Map<string, { node: GraphNode; incoming: number; outgoing: number }>();
  for (const connection of connections) {
    if (!connection.neighbor) continue;
    const current = neighborCounts.get(connection.neighbor.id) ?? {
      node: connection.neighbor,
      incoming: 0,
      outgoing: 0,
    };
    if (connection.direction === "incoming") current.incoming += 1;
    if (connection.direction === "outgoing") current.outgoing += 1;
    neighborCounts.set(connection.neighbor.id, current);
  }

  const neighbors = Array.from(neighborCounts.values())
    .sort((left, right) => compareStrings(left.node.id, right.node.id))
    .map<SelectedNeighborSummary>(({ node, incoming, outgoing }) => ({
      node,
      direction: incoming && outgoing ? "bidirectional" : incoming ? "incoming" : "outgoing",
      incoming_count: incoming,
      outgoing_count: outgoing,
      connection_count: incoming + outgoing,
    }));

  return {
    node: selectedNode,
    neighbor_ids: neighbors.map((neighbor) => neighbor.node.id),
    neighbors,
    connections,
    incoming_count: connections.filter((connection) => connection.direction === "incoming").length,
    outgoing_count: connections.filter((connection) => connection.direction === "outgoing").length,
    self_connection_count: connections.filter((connection) => connection.direction === "self").length,
  };
}

function toVisualNode(node: GraphNode, palette: VisualizationPalette): GraphNodeVisual {
  const visualKind = graphNodeVisualKind(node);
  const style = GRAPH_NODE_STYLES[visualKind];
  const angle = stableUnit(`${node.id}:angle`) * Math.PI * 2;
  const radius = style.radius + stableUnit(`${node.id}:radius`) * style.radius_jitter;

  return {
    ...node,
    visual_kind: visualKind,
    color: graphNodeColor(visualKind, palette),
    size: style.size,
    type: style.type,
    x: roundPosition(Math.cos(angle) * radius),
    y: roundPosition(Math.sin(angle) * radius),
  };
}

function toVisualEdges(edges: readonly GraphEdge[], palette: VisualizationPalette): GraphEdgeVisual[] {
  const directedGroups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const groupKey = `${edge.source_id}\u0000${edge.target_id}`;
    const group = directedGroups.get(groupKey) ?? [];
    group.push(edge);
    directedGroups.set(groupKey, group);
  }

  const parallelDetails = new Map<GraphEdge, { index: number; count: number }>();
  for (const group of directedGroups.values()) {
    group.sort(compareEdges);
    group.forEach((edge, index) => parallelDetails.set(edge, { index, count: group.length }));
  }

  return edges.map((edge) => {
    const style = GRAPH_EDGE_STYLES[edge.edge_class];
    const { index, count } = parallelDetails.get(edge) ?? { index: 0, count: 1 };
    const centeredIndex = index - (count - 1) / 2;
    return {
      ...edge,
      key: `${edge.edge_class}:${edge.id}:${edge.source_id}->${edge.target_id}:${index}`,
      color: graphEdgeColor(edge.edge_class, palette),
      size: style.size,
      type: style.type,
      curvature: roundPosition(style.base_curvature + centeredIndex * PARALLEL_EDGE_CURVATURE_STEP),
      parallel_index: index,
      parallel_count: count,
    };
  });
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return compareStrings(edgeSortKey(left), edgeSortKey(right));
}

function edgeSortKey(edge: GraphEdge): string {
  return [edge.source_id, edge.target_id, edge.edge_class, edge.id, edge.kind, edge.label, edge.inverse_label].join("\u0000");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableUnit(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function roundPosition(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
