import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { describe, expect, test } from "vitest";
import {
  GRAPH_EDGE_STYLES,
  GRAPH_NODE_STYLES,
  buildGraphClouds,
  buildGraphPresentation,
  graphNodeVisualKind,
  summarizeSelectedNode,
} from "@/lib/graph-presentation";

const nodes: GraphNode[] = [
  { id: "campaign", node_type: "campaign", title: "Lantern Harbor", kind: "campaign", status: "canon" },
  { id: "note", node_type: "item", title: "Dock Notes", kind: "note", status: "draft" },
  { id: "entity", node_type: "item", title: "Captain Vey", kind: "entity", status: "canon" },
  { id: "session", node_type: "item", title: "The Fog Bell", kind: "session", status: "canon" },
];

const edges: GraphEdge[] = [
  { id: "link-b", edge_class: "document_link", source_id: "campaign", target_id: "entity", kind: "document_link", label: "links to", inverse_label: "linked from" },
  { id: "reference", edge_class: "reference", source_id: "entity", target_id: "campaign", kind: "reference", label: "mentions", inverse_label: "mentioned by" },
  { id: "link-a", edge_class: "document_link", source_id: "campaign", target_id: "entity", kind: "document_link", label: "links to", inverse_label: "linked from" },
  { id: "relationship", edge_class: "relationship", source_id: "campaign", target_id: "session", kind: "ally", label: "featured in", inverse_label: "features" },
];

describe("buildGraphPresentation", () => {
  test("assigns stable node styles and deterministic positions", () => {
    const first = buildGraphPresentation(nodes, []);
    const reordered = buildGraphPresentation([...nodes].reverse(), []);

    expect(first.nodes.map(({ id, visual_kind, color, size, type }) => ({ id, visual_kind, color, size, type }))).toEqual([
      { id: "campaign", visual_kind: "campaign", ...pickNodeStyle("campaign") },
      { id: "note", visual_kind: "note", ...pickNodeStyle("note") },
      { id: "entity", visual_kind: "entity", ...pickNodeStyle("entity") },
      { id: "session", visual_kind: "session", ...pickNodeStyle("session") },
    ]);
    expect(positionById(first.nodes)).toEqual(positionById(reordered.nodes));
    expect(first.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });

  test("falls back to campaign or entity presentation for specialized item kinds", () => {
    expect(graphNodeVisualKind({ ...nodes[0], kind: "setting" })).toBe("campaign");
    expect(graphNodeVisualKind({ ...nodes[2], kind: "npc" })).toBe("entity");
    expect(graphNodeVisualKind({ ...nodes[1], kind: " NOTE " })).toBe("note");
  });

  test("preserves directed parallel edges and assigns stable class styles", () => {
    const first = buildGraphPresentation([], edges).edges;
    const reordered = buildGraphPresentation([], [...edges].reverse()).edges;
    const forward = first.filter((edge) => edge.source_id === "campaign" && edge.target_id === "entity");
    const reverse = first.find((edge) => edge.source_id === "entity" && edge.target_id === "campaign");

    expect(first).toHaveLength(edges.length);
    expect(forward).toHaveLength(2);
    expect(forward.map((edge) => edge.parallel_index).sort()).toEqual([0, 1]);
    expect(forward.map((edge) => edge.parallel_count)).toEqual([2, 2]);
    expect(new Set(forward.map((edge) => edge.curvature)).size).toBe(2);
    expect(reverse).toMatchObject({ parallel_index: 0, parallel_count: 1 });
    expect(edgeVisualsById(first)).toEqual(edgeVisualsById(reordered));

    for (const edge of first) {
      const { color, size, type } = GRAPH_EDGE_STYLES[edge.edge_class];
      expect(edge).toMatchObject({ color, size, type });
    }
  });
});

describe("buildGraphClouds", () => {
  test("keeps direct neighbors in separate clouds until they connect directly", () => {
    const cloudNodes: GraphNode[] = [...nodes,
      { id: "a", node_type: "item", title: "A", kind: "entity", status: "canon" },
      { id: "b", node_type: "item", title: "B", kind: "entity", status: "canon" },
      { id: "c", node_type: "item", title: "C", kind: "entity", status: "canon" },
    ];
    const cloudEdges: GraphEdge[] = [
      { id: "root-a", edge_class: "document_link", source_id: "campaign", target_id: "a", kind: "link", label: "", inverse_label: "" },
      { id: "root-b", edge_class: "document_link", source_id: "campaign", target_id: "b", kind: "link", label: "", inverse_label: "" },
      { id: "root-c", edge_class: "document_link", source_id: "campaign", target_id: "c", kind: "link", label: "", inverse_label: "" },
      { id: "a-b", edge_class: "relationship", source_id: "a", target_id: "b", kind: "ally", label: "", inverse_label: "" },
    ];

    expect(buildGraphClouds(cloudNodes, cloudEdges, "campaign")).toEqual([
      { id: "cloud:a,b", node_ids: ["a", "b"] },
      { id: "cloud:c", node_ids: ["c"] },
      { id: "cloud:entity", node_ids: ["entity"] },
      { id: "cloud:note", node_ids: ["note"] },
      { id: "cloud:session", node_ids: ["session"] },
    ]);
  });
});

describe("summarizeSelectedNode", () => {
  test("summarizes unique neighbors while retaining every directed connection", () => {
    const selfEdge: GraphEdge = { id: "self", edge_class: "reference", source_id: "campaign", target_id: "campaign", kind: "reference", label: "recalls", inverse_label: "recalled by" };
    const summary = summarizeSelectedNode(nodes, [...edges, selfEdge], "campaign");

    expect(summary?.neighbor_ids).toEqual(["entity", "session"]);
    expect(summary?.neighbors).toEqual([
      { node: nodes[2], direction: "bidirectional", incoming_count: 1, outgoing_count: 2, connection_count: 3 },
      { node: nodes[3], direction: "outgoing", incoming_count: 0, outgoing_count: 1, connection_count: 1 },
    ]);
    expect(summary).toMatchObject({ incoming_count: 1, outgoing_count: 3, self_connection_count: 1 });
    expect(summary?.connections).toHaveLength(5);
    expect(summary?.connections.filter(({ neighbor }) => neighbor?.id === "entity")).toHaveLength(3);
  });

  test("returns null for a node outside the graph", () => {
    expect(summarizeSelectedNode(nodes, edges, "missing")).toBeNull();
  });
});

function pickNodeStyle(kind: keyof typeof GRAPH_NODE_STYLES) {
  const { color, size, type } = GRAPH_NODE_STYLES[kind];
  return { color, size, type };
}

function positionById(positionedNodes: ReturnType<typeof buildGraphPresentation>["nodes"]) {
  return Object.fromEntries(positionedNodes.map(({ id, x, y }) => [id, { x, y }]));
}

function edgeVisualsById(positionedEdges: ReturnType<typeof buildGraphPresentation>["edges"]) {
  return Object.fromEntries(positionedEdges.map(({ id, key, color, size, type, curvature, parallel_index, parallel_count }) => [
    id,
    { key, color, size, type, curvature, parallel_index, parallel_count },
  ]));
}
