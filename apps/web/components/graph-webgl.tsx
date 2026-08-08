"use client";

import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { SigmaContainer, useCamera, useRegisterEvents, useSetSettings, useSigma } from "@react-sigma/core";
import { useWorkerLayoutForceAtlas2 } from "@react-sigma/layout-forceatlas2";
import { createEdgeCurveProgram } from "@sigma/edge-curve";
import { bindWebGLLayer, createContoursProgram } from "@sigma/layer-webgl";
import { createNodeBorderProgram } from "@sigma/node-border";
import { MultiDirectedGraph } from "graphology";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type Sigma from "sigma";
import { createEdgeArrowProgram } from "sigma/rendering";
import type { Settings } from "sigma/settings";
import { buildGraphClouds, buildGraphPresentation } from "@/lib/graph-presentation";

type AnchorPosition = { x: number; y: number };

type GraphWebglProps = {
  campaignId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId?: string;
  cloudFocusId?: string;
  selectedId: string | null;
  reducedMotion: boolean;
  onAnchorChange: (position: AnchorPosition | null) => void;
  onRenderError: (message: string) => void;
  onSelect: (nodeId: string | null) => void;
};

type NodeAttributes = {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  borderColor: string;
  type: "border";
  kind: string;
  status: string;
  forceLabel: boolean;
  zIndex: number;
};

type EdgeAttributes = {
  size: number;
  label: string;
  color: string;
  type: "arrow" | "curved";
  curvature: number;
  edgeClass: GraphEdge["edge_class"];
  zIndex: number;
};

const SIGMA_SETTINGS: Partial<Settings<NodeAttributes, EdgeAttributes>> = {
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
  enableEdgeEvents: true,
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
  labelRenderedSizeThreshold: 6,
  stagePadding: 64,
  minCameraRatio: 0.08,
  maxCameraRatio: 4,
  zIndex: true,
};

export default function GraphWebgl(props: GraphWebglProps) {
  const onRenderError = props.onRenderError;
  const [available] = useState(supportsWebgl);
  const graph = useMemo(
    () => createGraph(props.nodes, props.edges, props.focusId),
    [props.edges, props.focusId, props.nodes],
  );
  // Sigma owns its graph instance for the lifetime of the container. Remount it
  // when the API returns a different neighborhood so depth/filter changes cannot
  // leave the layout worker attached to the previous graph.
  const graphKey = useMemo(
    () => [props.focusId ?? "", ...props.nodes.map((node) => node.id), ...props.edges.map((edge) => edge.edge_class + ":" + edge.id + ":" + edge.source_id + ":" + edge.target_id)].join("|"),
    [props.edges, props.focusId, props.nodes],
  );

  useEffect(() => {
    if (!available) onRenderError("WebGL is unavailable in this browser. The page index remains fully available.");
  }, [available, onRenderError]);

  if (!available) return null;

  return (
    <SigmaContainer<NodeAttributes, EdgeAttributes>
      key={graphKey}
      className="graph-sigma"
      graph={graph}
      settings={SIGMA_SETTINGS}
    >
      <GraphController {...props} />
    </SigmaContainer>
  );
}

function GraphController({
  nodes,
  edges,
  cloudFocusId,
  focusId,
  selectedId,
  reducedMotion,
  onAnchorChange,
  onRenderError,
  onSelect,
}: GraphWebglProps) {
  const sigma = useSigma<NodeAttributes, EdgeAttributes>();
  const graph = sigma.getGraph();
  const registerEvents = useRegisterEvents<NodeAttributes, EdgeAttributes>();
  const setSettings = useSetSettings<NodeAttributes, EdgeAttributes>();
  const { gotoNode, reset, zoomIn, zoomOut } = useCamera({ duration: reducedMotion ? 0 : 190, factor: 1.45 });
  const { start: startLayout, stop: stopLayout } = useWorkerLayoutForceAtlas2({
    settings: {
      barnesHutOptimize: graph.order > 40,
      gravity: 1.8,
      scalingRatio: 6,
      slowDown: 4,
      strongGravityMode: true,
    },
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const coarsePointer = useSyncExternalStore(subscribeCoarsePointer, coarsePointerSnapshot, () => false);
  const clouds = useMemo(
    () => buildGraphClouds(nodes, edges, cloudFocusId ?? focusId),
    [cloudFocusId, edges, focusId, nodes],
  );

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => onSelect(node),
      clickStage: () => onSelect(null),
      enterNode: ({ node }) => {
        setHoveredId(node);
        sigma.getContainer().style.cursor = "pointer";
      },
      leaveNode: () => {
        setHoveredId(null);
        sigma.getContainer().style.cursor = "grab";
      },
    });
  }, [onSelect, registerEvents, sigma]);

  useEffect(() => {
    const activeId = selectedId ?? hoveredId;
    const neighbors = activeId && graph.hasNode(activeId) ? new Set(graph.neighbors(activeId)) : new Set<string>();

    setSettings({
      nodeReducer: (node, data) => {
        if (!activeId) return data;
        if (node === activeId) {
          return {
            ...data,
            borderColor: "#f2bd68",
            highlighted: true,
            forceLabel: true,
            size: data.size * 1.35,
            zIndex: 3,
          };
        }
        if (neighbors.has(node)) {
          return {
            ...data,
            borderColor: "#67dec8",
            highlighted: true,
            forceLabel: true,
            size: data.size * 1.08,
            zIndex: 2,
          };
        }
        return {
          ...data,
          borderColor: "#31465b",
          color: "#26384b",
          label: "",
          size: data.size * 0.82,
          zIndex: 0,
        };
      },
      edgeReducer: (edge, data) => {
        if (!activeId) return data;
        const [source, target] = graph.extremities(edge);
        if (source === activeId || target === activeId) {
          return {
            ...data,
            color: data.edgeClass === "relationship" ? "#e8a759" : "#73c9d7",
            forceLabel: true,
            size: data.size * 2.1,
            zIndex: 2,
          };
        }
        return { ...data, color: "#293c50", forceLabel: false, size: Math.max(0.45, data.size * 0.55), zIndex: 0 };
      },
    });
    sigma.refresh();
  }, [graph, hoveredId, selectedId, setSettings, sigma]);

  useEffect(() => {
    if (!selectedId || !graph.hasNode(selectedId)) {
      onAnchorChange(null);
      return;
    }

    const updateAnchor = () => {
      const attributes = graph.getNodeAttributes(selectedId);
      onAnchorChange(sigma.graphToViewport({ x: attributes.x, y: attributes.y }));
    };
    updateAnchor();
    sigma.on("afterRender", updateAnchor);
    return () => {
      sigma.off("afterRender", updateAnchor);
    };
  }, [graph, onAnchorChange, selectedId, sigma]);

  useEffect(() => {
    if (!selectedId || !graph.hasNode(selectedId)) return;
    gotoNode(selectedId, { duration: reducedMotion ? 0 : 210 });
  }, [gotoNode, graph, reducedMotion, selectedId]);

  useEffect(() => {
    if (reducedMotion || coarsePointer || graph.order < 2) {
      reset({ duration: 0 });
      return;
    }
    startLayout();
    const timer = window.setTimeout(() => {
      stopLayout();
      reset({ duration: 220 });
    }, 900);
    return () => {
      window.clearTimeout(timer);
      stopLayout();
    };
  }, [coarsePointer, graph, reducedMotion, reset, startLayout, stopLayout]);

  useEffect(() => {
    if (!selectedId || !graph.hasNode(selectedId) || reducedMotion || coarsePointer) return;
    const activeNodes = [selectedId, ...graph.neighbors(selectedId)];
    try {
      const cleanup = bindWebGLLayer(
        "active-neighborhood",
        sigma as unknown as Sigma,
        createContoursProgram(activeNodes, {
          radius: 54,
          feather: 1.2,
          levels: [
            { color: "#193d4666", threshold: 0.35 },
            { color: "#0c182600", threshold: 0.72 },
          ],
          border: { color: "#58cdb899", thickness: 1.5 },
        }),
      );
      sigma.refresh();
      return () => {
        try { cleanup(); } catch { /* The renderer may already be disposed. */ }
      };
    } catch {
      return;
    }
  }, [coarsePointer, graph, reducedMotion, selectedId, sigma]);

  useEffect(() => {
    if (reducedMotion || coarsePointer || clouds.length === 0) return;
    const cleanups = clouds.map((cloud, index) => {
      try {
        return bindWebGLLayer(
          "graph-cloud-" + index,
          sigma as unknown as Sigma,
          createContoursProgram(cloud.node_ids, {
            radius: cloud.node_ids.length === 1 ? 38 : 58 + Math.min(28, cloud.node_ids.length * 4),
            feather: 1.35,
            levels: [
              { color: cloudColor(index, 0.2), threshold: 0.28 },
              { color: cloudColor(index, 0), threshold: 0.76 },
            ],
            border: { color: cloudColor(index, 0.44), thickness: 1.15 },
          }),
        );
      } catch {
        return () => undefined;
      }
    });
    sigma.refresh();
    return () => {
      cleanups.forEach((cleanup) => {
        try { cleanup(); } catch { /* The renderer may already be disposed. */ }
      });
    };
  }, [clouds, coarsePointer, reducedMotion, sigma]);

  useEffect(() => {
    const contextLoss = (event: Event) => {
      event.preventDefault();
      onRenderError("The graphics context was lost. The page index remains fully available.");
    };
    const canvases = Object.values(sigma.getCanvases());
    canvases.forEach((canvas) => canvas.addEventListener("webglcontextlost", contextLoss));
    return () => canvases.forEach((canvas) => canvas.removeEventListener("webglcontextlost", contextLoss));
  }, [onRenderError, sigma]);

  const relayout = useCallback(() => {
    if (reducedMotion || coarsePointer || graph.order < 2) {
      reset({ duration: 0 });
      return;
    }
    startLayout();
    window.setTimeout(() => {
      stopLayout();
      reset({ duration: 180 });
    }, 700);
  }, [coarsePointer, graph.order, reducedMotion, reset, startLayout, stopLayout]);

  return (
    <div className="graph-camera-controls" aria-label="Graph camera controls">
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomIn()}>+</button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomOut()}>−</button>
      <button type="button" aria-label="Fit graph" title="Fit graph" onClick={() => reset()}>⌂</button>
      <button type="button" aria-label="Relayout graph" title="Relayout graph" onClick={relayout}>✦</button>
    </div>
  );
}

function createGraph(nodes: GraphNode[], edges: GraphEdge[], focusId?: string) {
  const presentation = buildGraphPresentation(nodes, edges);
  const graph = new MultiDirectedGraph<NodeAttributes, EdgeAttributes>();

  for (const node of presentation.nodes) {
    const statusBorder = node.status === "archived" ? "#718096" : node.status === "draft" ? "#d3a65e" : "#67cdb8";
    graph.addNode(node.id, {
      x: node.x,
      y: node.y,
      size: node.size + (node.id === focusId ? 2 : 0),
      label: node.title,
      color: node.color,
      borderColor: node.id === focusId ? "#f2bd68" : statusBorder,
      type: "border",
      kind: node.kind,
      status: node.status,
      forceLabel: node.id === focusId || node.visual_kind === "campaign",
      zIndex: node.id === focusId ? 2 : 1,
    });
  }

  for (const edge of presentation.edges) {
    if (!graph.hasNode(edge.source_id) || !graph.hasNode(edge.target_id)) continue;
    const curved = edge.type === "curved" || edge.parallel_count > 1;
    graph.addDirectedEdgeWithKey(edge.key, edge.source_id, edge.target_id, {
      size: edge.size,
      label: edge.label || edge.kind.replaceAll("_", " "),
      color: edge.color,
      type: curved ? "curved" : "arrow",
      curvature: curved ? edge.curvature || 0.12 : 0,
      edgeClass: edge.edge_class,
      zIndex: edge.edge_class === "relationship" ? 2 : 1,
    });
  }

  return graph;
}

const CLOUD_COLORS = ["#56c9bd", "#8f7bd0", "#e4ae64", "#6ba8d8", "#dc7f9e"];

function cloudColor(index: number, alpha: number) {
  const hex = CLOUD_COLORS[index % CLOUD_COLORS.length] ?? CLOUD_COLORS[0];
  const opacity = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return hex + opacity;
}

function subscribeCoarsePointer(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(pointer: coarse)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function coarsePointerSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function supportsWebgl() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
