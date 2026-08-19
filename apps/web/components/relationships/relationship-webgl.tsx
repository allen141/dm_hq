"use client";

import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { SigmaContainer, useCamera, useRegisterEvents, useSetSettings, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createEdgeArrowProgram } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { buildGraphPresentation, type GraphNodeVisualKind } from "@/lib/graph-presentation";
import { useTheme } from "@/components/theme-provider";
import { graphEdgeColor, graphNodeColor, graphStatusColor } from "@/lib/renderer-theme";
import type { VisualizationPalette } from "@/lib/theme";

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
  size: number; label: string; color: string; type: "arrow" | "curved"; curvature: number; edgeClass: GraphEdge["edge_class"]; zIndex: number;
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
  // Sigma's built-in move check only tracks the mouse captor. Touch drags are
  // handled separately below so edge geometry is also skipped for them.
  hideEdgesOnMove: true,
  hideLabelsOnMove: true,
  labelFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  labelSize: 12,
  labelWeight: "600",
  edgeLabelFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  edgeLabelSize: 10,
  labelDensity: 0.8,
  stagePadding: 64,
  minCameraRatio: 0.08,
  maxCameraRatio: 4,
  zIndex: true,
};

export default function RelationshipWebgl(props: RelationshipWebglProps) {
  const { theme } = useTheme();
  const [available] = useState(supportsWebgl);
  const [initialPalette] = useState(theme.visualization);
  const graph = useMemo(
    () => createGraph(props.nodes, props.edges, props.rootId, props.positions, initialPalette),
    [initialPalette, props.edges, props.nodes, props.positions, props.rootId],
  );
  const graphKey = useMemo(() => [props.rootId ?? "", props.positions ? "fixed" : "network", ...props.nodes.map(({ id }) => id), ...props.edges.map(({ id }) => id)].join("|"), [props.edges, props.nodes, props.positions, props.rootId]);

  useEffect(() => {
    if (!available) props.onRenderError("WebGL is unavailable in this browser. The relationship list remains fully available.");
  }, [available, props]);
  if (!available) return null;

  return (
    <SigmaContainer<NodeAttributes, EdgeAttributes> key={graphKey} className="graph-sigma" graph={graph} settings={{ ...SETTINGS, labelColor: { color: initialPalette.text }, edgeLabelColor: { color: initialPalette.textMuted } }}>
      <RelationshipController {...props} palette={theme.visualization} />
    </SigmaContainer>
  );
}

function RelationshipController({ positions, rootId, selectedId, reducedMotion, onAnchorChange, onRenderError, onSelect, palette }: RelationshipWebglProps & { palette: VisualizationPalette }) {
  const sigma = useSigma<NodeAttributes, EdgeAttributes>();
  const graph = sigma.getGraph();
  const registerEvents = useRegisterEvents<NodeAttributes, EdgeAttributes>();
  const setSettings = useSetSettings<NodeAttributes, EdgeAttributes>();
  const { gotoNode, reset, zoomIn, zoomOut } = useCamera({ duration: reducedMotion ? 0 : 190, factor: 1.45 });
  const { start, stop } = useWorkerLayoutForceAtlas2({ settings: { gravity: 1.8, scalingRatio: 6, slowDown: 4, strongGravityMode: true } });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const touchMoving = useRef(false);
  const coarsePointer = useSyncExternalStore(subscribeCoarsePointer, coarsePointerSnapshot, () => false);

  useEffect(() => {
    graph.forEachNode((node, data) => {
      graph.mergeNodeAttributes(node, {
        color: graphNodeColor(data.kind as GraphNodeVisualKind, palette),
        borderColor: node === rootId ? palette.selection : graphStatusColor(data.status, palette),
      });
    });
    graph.forEachEdge((edge, data) => {
      graph.setEdgeAttribute(edge, "color", graphEdgeColor(data.edgeClass, palette));
    });
    setSettings({ labelColor: { color: palette.text }, edgeLabelColor: { color: palette.textMuted } });
    sigma.refresh();
  }, [graph, palette, rootId, setSettings, sigma]);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onSelect(node),
      clickStage: () => onSelect(null),
      enterNode: ({ node }) => { setHoveredId(node); sigma.getContainer().style.cursor = "pointer"; },
      leaveNode: () => { setHoveredId(null); sigma.getContainer().style.cursor = "grab"; },
      touchdown: () => { touchMoving.current = true; sigma.refresh(); },
      touchup: () => { touchMoving.current = false; sigma.refresh(); },
    });
  }, [onSelect, registerEvents, sigma]);

  useEffect(() => {
    const activeId = selectedId ?? hoveredId;
    const neighbors = activeId && graph.hasNode(activeId) ? new Set(graph.neighbors(activeId)) : new Set<string>();
    setSettings({
      nodeReducer: (node, data) => !activeId ? data : node === activeId
        ? { ...data, borderColor: palette.selection, highlighted: true, forceLabel: true, size: data.size * 1.35, zIndex: 3 }
        : neighbors.has(node)
          ? { ...data, borderColor: palette.neighbor, highlighted: true, forceLabel: true, size: data.size * 1.08, zIndex: 2 }
          : { ...data, borderColor: palette.dimmedEdge, color: palette.dimmedNode, label: "", size: data.size * 0.82, zIndex: 0 },
      edgeReducer: (edge, data) => {
        if (touchMoving.current) return { ...data, hidden: true };
        if (!activeId) return data;
        const [source, target] = graph.extremities(edge);
        return source === activeId || target === activeId
          ? { ...data, color: palette.edgeRelationship, forceLabel: true, size: data.size * 2.1, zIndex: 2 }
          : { ...data, color: palette.dimmedEdge, forceLabel: false, size: Math.max(0.45, data.size * 0.55), zIndex: 0 };
      },
    });
    sigma.refresh();
  }, [graph, hoveredId, palette, selectedId, setSettings, sigma]);

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
    if (positions || reducedMotion || coarsePointer || graph.order < 2) { reset({ duration: 0 }); return; }
    start();
    const timer = window.setTimeout(() => { stop(); reset({ duration: 220 }); }, 900);
    return () => { window.clearTimeout(timer); stop(); };
  }, [coarsePointer, graph, positions, reducedMotion, reset, start, stop]);

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
      {!positions && <button type="button" aria-label="Relayout relationships" title="Relayout relationships" onClick={() => { if (coarsePointer) { reset({ duration: 0 }); return; } start(); window.setTimeout(() => { stop(); reset(); }, 700); }}>✦</button>}
    </div>
  );
}

function createGraph(nodes: GraphNode[], edges: GraphEdge[], rootId: string | null | undefined, positions: Readonly<Record<string, { x: number; y: number }>> | null | undefined, palette: VisualizationPalette) {
  const presentation = buildGraphPresentation(nodes, edges, palette);
  const graph = new MultiDirectedGraph<NodeAttributes, EdgeAttributes>();
  for (const node of presentation.nodes) {
    const root = node.id === rootId;
    const position = positions?.[node.id];
    const statusBorder = graphStatusColor(node.status, palette);
    graph.addNode(node.id, {
      x: position?.x ?? node.x, y: position?.y ?? node.y, size: node.size + (root ? 2 : 0),
      label: node.title, color: node.color, borderColor: root ? palette.selection : statusBorder,
      type: "border", kind: node.kind, status: node.status, forceLabel: root, zIndex: root ? 2 : 1,
    });
  }
  for (const edge of presentation.edges) {
    if (!graph.hasNode(edge.source_id) || !graph.hasNode(edge.target_id)) continue;
    graph.addDirectedEdgeWithKey(edge.key, edge.source_id, edge.target_id, {
      size: edge.size, label: edge.label || edge.kind.replaceAll("_", " "), color: edge.color,
      type: "curved", curvature: edge.curvature || 0.12, edgeClass: edge.edge_class, zIndex: 1,
    });
  }
  return graph;
}

function subscribeCoarsePointer(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(pointer: coarse)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function coarsePointerSnapshot() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

function supportsWebgl() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch { return false; }
}
