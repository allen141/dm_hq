"use client";

import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { SigmaContainer, useCamera, useRegisterEvents, useSetSettings, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { useEffect, useMemo, useState } from "react";
import { createEdgeArrowProgram } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { buildGraphPresentation } from "@/lib/graph-presentation";

export type RelationshipWebglProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId?: string | null;
  positions?: Readonly<Record<string, { x: number; y: number }>> | null;
  selectedId: string | null;
  reducedMotion: boolean;
  onAnchorChange: (position: { x: number; y: number } | null) => void;
  onRenderError: (message: string) => void;
  onSelect: (nodeId: string | null) => void;
};

type NodeAttributes = {
  x: number; y: number; size: number; label: string; color: string; borderColor: string;
  type: "border"; kind: string; status: string; forceLabel: boolean; zIndex: number;
};
type EdgeAttributes = {
  size: number; label: string; color: string; type: "arrow" | "curved"; curvature: number; zIndex: number;
};

const SETTINGS: Partial<Settings<NodeAttributes, EdgeAttributes>> = {
  allowInvalidContainer: true,
  defaultNodeType: "border",
  defaultEdgeType: "curved",
  nodeProgramClasses: { border: createNodeBorderProgram<NodeAttributes, EdgeAttributes>() },
  edgeProgramClasses: {
    arrow: createEdgeArrowProgram<NodeAttributes, EdgeAttributes>(),
    curved: createEdgeCurveProgram<NodeAttributes, EdgeAttributes>({
      curvatureAttribute: "curvature",
      defaultCurvature: 0.25,
      arrowHead: { extremity: "target", lengthToThicknessRatio: 5, widenessToThicknessRatio: 2.5 },
    }),
  },
  renderEdgeLabels: true,
  hideEdgesOnMove: false,
  hideLabelsOnMove: true,
  labelFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  labelSize: 12,
  labelWeight: "600",
  labelColor: { color: "#dce8f3" },
  edgeLabelFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  edgeLabelSize: 10,
  edgeLabelColor: { color: "#aabbd0" },
  labelDensity: 0.8,
  stagePadding: 64,
  minCameraRatio: 0.08,
  maxCameraRatio: 4,
  zIndex: true,
};

export default function RelationshipWebgl(props: RelationshipWebglProps) {
  const [available] = useState(supportsWebgl);
  const graph = useMemo(
    () => createGraph(props.nodes, props.edges, props.rootId, props.positions),
    [props.edges, props.nodes, props.positions, props.rootId],
  );
  const graphKey = useMemo(() => [props.rootId ?? "", props.positions ? "fixed" : "network", ...props.nodes.map(({ id }) => id), ...props.edges.map(({ id }) => id)].join("|"), [props.edges, props.nodes, props.positions, props.rootId]);

  useEffect(() => {
    if (!available) props.onRenderError("WebGL is unavailable in this browser. The relationship list remains fully available.");
  }, [available, props]);
  if (!available) return null;

  return (
    <SigmaContainer<NodeAttributes, EdgeAttributes> key={graphKey} className="graph-sigma" graph={graph} settings={SETTINGS}>
      <RelationshipController {...props} />
    </SigmaContainer>
  );
}

function RelationshipController({ positions, selectedId, reducedMotion, onAnchorChange, onRenderError, onSelect }: RelationshipWebglProps) {
  const sigma = useSigma<NodeAttributes, EdgeAttributes>();
  const graph = sigma.getGraph();
  const registerEvents = useRegisterEvents<NodeAttributes, EdgeAttributes>();
  const setSettings = useSetSettings<NodeAttributes, EdgeAttributes>();
  const { gotoNode, reset, zoomIn, zoomOut } = useCamera({ duration: reducedMotion ? 0 : 190, factor: 1.45 });
  const { start, stop } = useWorkerLayoutForceAtlas2({ settings: { gravity: 1.8, scalingRatio: 6, slowDown: 4, strongGravityMode: true } });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onSelect(node),
      clickStage: () => onSelect(null),
      enterNode: ({ node }) => { setHoveredId(node); sigma.getContainer().style.cursor = "pointer"; },
      leaveNode: () => { setHoveredId(null); sigma.getContainer().style.cursor = "grab"; },
    });
  }, [onSelect, registerEvents, sigma]);

  useEffect(() => {
    const activeId = selectedId ?? hoveredId;
    const neighbors = activeId && graph.hasNode(activeId) ? new Set(graph.neighbors(activeId)) : new Set<string>();
    setSettings({
      nodeReducer: (node, data) => !activeId ? data : node === activeId
        ? { ...data, borderColor: "#f2bd68", highlighted: true, forceLabel: true, size: data.size * 1.35, zIndex: 3 }
        : neighbors.has(node)
          ? { ...data, borderColor: "#67dec8", highlighted: true, forceLabel: true, size: data.size * 1.08, zIndex: 2 }
          : { ...data, borderColor: "#31465b", color: "#26384b", label: "", size: data.size * 0.82, zIndex: 0 },
      edgeReducer: (edge, data) => {
        if (!activeId) return data;
        const [source, target] = graph.extremities(edge);
        return source === activeId || target === activeId
          ? { ...data, color: "#e8a759", forceLabel: true, size: data.size * 2.1, zIndex: 2 }
          : { ...data, color: "#293c50", forceLabel: false, size: Math.max(0.45, data.size * 0.55), zIndex: 0 };
      },
    });
    sigma.refresh();
  }, [graph, hoveredId, selectedId, setSettings, sigma]);

  useEffect(() => {
    if (!selectedId || !graph.hasNode(selectedId)) { onAnchorChange(null); return; }
    const update = () => {
      const { x, y } = graph.getNodeAttributes(selectedId);
      onAnchorChange(sigma.graphToViewport({ x, y }));
    };
    update();
    sigma.on("afterRender", update);
    return () => { sigma.off("afterRender", update); };
  }, [graph, onAnchorChange, selectedId, sigma]);

  useEffect(() => {
    if (selectedId && graph.hasNode(selectedId)) gotoNode(selectedId, { duration: reducedMotion ? 0 : 210 });
  }, [gotoNode, graph, reducedMotion, selectedId]);

  useEffect(() => {
    if (positions || reducedMotion || graph.order < 2) { reset({ duration: 0 }); return; }
    start();
    const timer = window.setTimeout(() => { stop(); reset({ duration: 220 }); }, 900);
    return () => { window.clearTimeout(timer); stop(); };
  }, [graph, positions, reducedMotion, reset, start, stop]);

  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onRenderError("The graphics context was lost. The relationship list remains fully available."); };
    const canvases = Object.values(sigma.getCanvases());
    canvases.forEach((canvas) => canvas.addEventListener("webglcontextlost", lost));
    return () => canvases.forEach((canvas) => canvas.removeEventListener("webglcontextlost", lost));
  }, [onRenderError, sigma]);

  return (
    <div className="graph-camera-controls" aria-label="Relationship camera controls">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn()}>+</button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut()}>−</button>
      <button type="button" aria-label="Fit relationships" title="Fit relationships" onClick={() => reset()}>⌂</button>
      {!positions && <button type="button" aria-label="Relayout relationships" title="Relayout relationships" onClick={() => { start(); window.setTimeout(() => { stop(); reset(); }, 700); }}>✦</button>}
    </div>
  );
}

function createGraph(nodes: GraphNode[], edges: GraphEdge[], rootId?: string | null, positions?: Readonly<Record<string, { x: number; y: number }>> | null) {
  const presentation = buildGraphPresentation(nodes, edges);
  const graph = new MultiDirectedGraph<NodeAttributes, EdgeAttributes>();
  for (const node of presentation.nodes) {
    const root = node.id === rootId;
    const position = positions?.[node.id];
    const statusBorder = node.status === "archived" ? "#718096" : node.status === "draft" ? "#d3a65e" : "#67cdb8";
    graph.addNode(node.id, {
      x: position?.x ?? node.x, y: position?.y ?? node.y, size: node.size + (root ? 2 : 0),
      label: node.title, color: node.color, borderColor: root ? "#f2bd68" : statusBorder,
      type: "border", kind: node.kind, status: node.status, forceLabel: root, zIndex: root ? 2 : 1,
    });
  }
  for (const edge of presentation.edges) {
    if (!graph.hasNode(edge.source_id) || !graph.hasNode(edge.target_id)) continue;
    graph.addDirectedEdgeWithKey(edge.key, edge.source_id, edge.target_id, {
      size: edge.size, label: edge.label || edge.kind.replaceAll("_", " "), color: edge.color,
      type: "curved", curvature: edge.curvature || 0.12, zIndex: 1,
    });
  }
  return graph;
}

function supportsWebgl() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}
