"use client";

import { autoUpdate, flip, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { RelationshipWebglProps } from "@/components/relationships/relationship-webgl";
import RelationshipTree from "@/components/relationships/relationship-tree";
import { useTheme } from "@/components/theme-provider";
import { archiveDocumentHref } from "@/lib/archive-routes";
import {
  buildRelationshipPresentation,
  relationshipFactsForNode,
  type RelationshipLayoutDirection,
  type RelationshipLayoutMode,
  type RelationshipOrientation,
} from "@/lib/relationship-presentation";

export type RelationshipGraphCanvasProps = {
  campaignId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layoutMode?: RelationshipLayoutMode;
  orientation?: RelationshipOrientation;
  rootId?: string | null;
  visibleRelationshipKinds?: readonly string[];
  layoutRelationshipKinds?: readonly string[];
  layoutDirection?: RelationshipLayoutDirection;
  showLevelLabels?: boolean;
  levelOverrides?: Readonly<Record<string, number | null | undefined>>;
  manualPositions?: Readonly<Record<string, { x: number; y: number }>>;
  editable?: boolean;
  onPositionChange?: (id: string, position: { x: number; y: number }, level: number) => void;
  onConnect?: (sourceId: string, targetId: string) => void;
  levelLabels?: readonly string[];
};

const Webgl = dynamic<RelationshipWebglProps>(() => import("@/components/relationships/relationship-webgl"), {
  ssr: false,
  loading: () => <div className="graph-loading" role="status">Arranging relationships…</div>,
});

class RenderBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void; resetKey: number },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    this.props.onError(`The visual relationship view could not start${detail}. The relationship list remains fully available.`);
  }
  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function RelationshipGraphCanvas({
  campaignId,
  nodes,
  edges,
  layoutMode = "hierarchy",
  orientation = "top_to_bottom",
  rootId = null,
  visibleRelationshipKinds,
  layoutRelationshipKinds,
  layoutDirection = "outgoing",
  showLevelLabels = true,
  levelLabels = [],
  levelOverrides = {},
  manualPositions = {},
  editable = false,
  onPositionChange,
  onConnect,
}: RelationshipGraphCanvasProps) {
  const presentation = useMemo(() => buildRelationshipPresentation(nodes, edges, {
    layout_mode: layoutMode,
    orientation,
    root_id: rootId,
    visible_relationship_kinds: visibleRelationshipKinds,
    layout_relationship_kinds: layoutRelationshipKinds,
    layout_direction: layoutDirection,
    level_overrides: levelOverrides,
  }), [edges, layoutDirection, layoutMode, layoutRelationshipKinds, levelOverrides, nodes, orientation, rootId, visibleRelationshipKinds]);
  const { theme } = useTheme();
  const forcedColors = useForcedColors();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"webgl" | "list">("webgl");
  const [message, setMessage] = useState("");
  const displayedMode = forcedColors ? "list" : mode;
  const [resetKey, setResetKey] = useState(0);
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const selectedNode = presentation.nodes.find(({ id }) => id === selectedId) ?? null;
  const facts = useMemo(() => selectedId ? relationshipFactsForNode(presentation.nodes, presentation.edges, selectedId) : [], [presentation, selectedId]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return presentation.nodes.filter((node) => node.title.toLowerCase().includes(normalized) || node.kind.toLowerCase().includes(normalized)).slice(0, 7);
  }, [presentation.nodes, query]);
  const levels = useMemo(() => groupByLevel(presentation.nodes, presentation.positions), [presentation.nodes, presentation.positions]);
  const { refs, floatingStyles, update } = useFloating({
    open: Boolean(selectedNode), placement: "right-start",
    middleware: [offset(14), flip({ padding: 12 }), shift({ padding: 12 })], whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    const stage = stageRef.current;
    if (!selectedNode || !anchor || !stage || displayedMode !== "webgl") { refs.setPositionReference(null); return; }
    const reference: VirtualElement = {
      contextElement: stage,
      getBoundingClientRect() {
        const bounds = stage.getBoundingClientRect();
        const x = bounds.left + anchor.x;
        const y = bounds.top + anchor.y;
        return { x, y, top: y, right: x, bottom: y, left: x, width: 0, height: 0, toJSON: () => ({}) };
      },
    };
    refs.setPositionReference(reference);
    void update();
  }, [anchor, displayedMode, refs, selectedNode, update]);
  useEffect(() => {
    if (!selectedNode) return;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNode]);

  if (!nodes.length) return <div className="graph-empty">No members in this relationship view.</div>;

  function selectNode(id: string | null, rememberFocus = false) {
    if (rememberFocus && document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
    setSelectedId(id);
    if (!id) setAnchor(null);
  }
  function closeInspector() {
    selectNode(null);
    const target = returnFocusRef.current;
    if (target?.isConnected) window.requestAnimationFrame(() => target.focus());
  }
  function rendererError(detail: string) { setMessage(detail); setMode("list"); setAnchor(null); }
  function retry() { setMessage(""); setMode("webgl"); setResetKey((value) => value + 1); }
  function setInspector(node: HTMLElement | null) { inspectorRef.current = node; refs.setFloating(node); }

  return (
    <section className="visualization-stage graph-canvas relationship-graph-canvas" aria-label="Relationship explorer">
      <div className="sr-only" role="img" aria-label={`${presentation.nodes.length} members and ${presentation.edges.length} relationships`} />
      <div className="graph-explorer-bar">
        <div className="graph-search" role="search">
          <label htmlFor="relationship-node-search">Find a member</label>
          <input id="relationship-node-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Person, faction, place…" autoComplete="off" />
          {matches.length > 0 && <ul className="graph-search-results" aria-label="Matching members">
            {matches.map((node) => <li key={node.id}><button type="button" onClick={() => { selectNode(node.id, true); setQuery(""); }}><span>{node.title}</span><small>{node.kind} · {node.status}</small></button></li>)}
          </ul>}
        </div>
        <div className="graph-mode-switch" aria-label="Relationship presentation">
          <button type="button" className={displayedMode === "webgl" ? "active" : "secondary"} aria-pressed={displayedMode === "webgl"} disabled={forcedColors} onClick={retry}>Visual</button>
          <button type="button" className={displayedMode === "list" ? "active" : "secondary"} aria-pressed={displayedMode === "list"} onClick={() => { setMode("list"); setAnchor(null); }}>List</button>
        </div>
      </div>
      {message && <div className="graph-renderer-notice" role="status"><span>{message}</span><button type="button" className="secondary" onClick={retry}>Retry visual view</button></div>}

      <div className="graph-stage-frame" ref={stageRef}>
        {displayedMode === "webgl" ? (
          layoutMode === "hierarchy" && presentation.positions ? (
            <RelationshipTree nodes={presentation.nodes} edges={presentation.edges} structuralEdgeIds={presentation.structural_edge_ids} positions={presentation.positions} orientation={orientation} rootId={rootId} selectedId={selectedId} showLevelLabels={showLevelLabels} levelLabels={levelLabels} editable={editable} manualPositions={manualPositions} onPositionChange={onPositionChange} onConnect={onConnect} onSelect={(id) => selectNode(id, true)} palette={theme.visualization} />
          ) : (
            <RenderBoundary key={resetKey} resetKey={resetKey} onError={rendererError}>
              <Webgl nodes={presentation.nodes} edges={presentation.edges} rootId={rootId} positions={null} selectedId={selectedId} reducedMotion={reducedMotion} onAnchorChange={setAnchor} onRenderError={rendererError} onSelect={selectNode} />
            </RenderBoundary>
          )
        ) : (
          <div className="graph-list-fallback relationship-semantic-list">
            <div><span className="eyebrow">Semantic view</span><h3>{layoutMode === "hierarchy" ? "Relationship hierarchy" : "Relationship knowledge"}</h3></div>
            <p>Every row is a canonical relationship fact. Structural relationships affect arrangement only.</p>
            {levels.map(({ level, nodes: levelNodes }) => <section key={level} aria-label={layoutMode === "hierarchy" ? levelLabel(level, levelLabels) : "Members"}>
              {layoutMode === "hierarchy" && showLevelLabels && <h4>{levelLabel(level, levelLabels)}</h4>}
              <ul>{levelNodes.map((node) => <li key={node.id}>
                <button type="button" aria-pressed={selectedId === node.id} onClick={() => selectNode(node.id, true)}><span>{node.title}</span><small>{node.kind} · {relationshipFactsForNode(presentation.nodes, presentation.edges, node.id).length} relationships</small></button>
                <ul>{relationshipFactsForNode(presentation.nodes, presentation.edges, node.id).map((fact) => <li key={`${fact.edge.id}:${fact.direction}`}>{fact.phrase}</li>)}</ul>
              </li>)}</ul>
            </section>)}
          </div>
        )}

        {selectedNode && <aside className={`graph-inspector${anchor && displayedMode === "webgl" ? " floating" : " static"}`} ref={setInspector} style={anchor && displayedMode === "webgl" ? floatingStyles : undefined} role="dialog" aria-modal="false" aria-labelledby="relationship-inspector-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") closeInspector(); }}>
          <div className="graph-inspector-topline"><span className="privacy-chip">DM private</span><button type="button" className="graph-close" aria-label="Close relationship summary" onClick={closeInspector}>×</button></div>
          <div className="graph-kind-row"><span className={`node-kind-icon ${selectedNode.kind}`} aria-hidden="true" /><span>{selectedNode.kind}</span><span>·</span><span>{selectedNode.status}</span></div>
          <h3 id="relationship-inspector-title">{selectedNode.title}</h3>
          <p className="graph-node-summary">{("summary" in selectedNode && selectedNode.summary) || "No summary has been written for this page yet."}</p>
          <div className="graph-inspector-stats"><span><strong>{facts.length}</strong> {facts.length === 1 ? "relationship" : "relationships"}</span></div>
          {facts.length > 0 && <div className="graph-neighbor-list"><h4>Known relationships</h4><ul>{facts.map((fact) => <li key={`${fact.edge.id}:${fact.direction}`}><button type="button" disabled={!fact.neighbor || fact.neighbor.id === selectedNode.id} onClick={() => fact.neighbor && selectNode(fact.neighbor.id)}><span>{fact.phrase}</span><small>{fact.direction}</small></button></li>)}</ul></div>}
          <div className="graph-inspector-actions"><Link className="button" href={archiveDocumentHref(campaignId, selectedNode.id, selectedNode.node_type)}>Open page</Link></div>
        </aside>}
      </div>

      <details className="graph-node-index" key={displayedMode} open={displayedMode === "list"}><summary>Member index <span>{presentation.nodes.length}</span></summary><ul>{presentation.nodes.map((node) => <li key={node.id}><button type="button" aria-pressed={selectedId === node.id} aria-label={`Select ${node.title}`} onClick={() => selectNode(node.id, true)}><span className={`node-kind-icon ${node.kind}`} aria-hidden="true" /><span>{node.title}</span><small>{node.kind}</small></button></li>)}</ul></details>
      <p className="sr-only" role="status" aria-live="polite">{selectedNode ? `${selectedNode.title} selected with ${facts.length} relationships.` : ""}</p>
    </section>
  );
}

function groupByLevel(nodes: readonly GraphNode[], positions: Readonly<Record<string, { level: number; order: number }>> | null) {
  if (!positions) return [{ level: 0, nodes: nodes.slice().sort((a, b) => a.title.localeCompare(b.title)) }];
  const groups = new Map<number, GraphNode[]>();
  nodes.forEach((node) => { const level = positions[node.id]?.level ?? 0; groups.set(level, [...(groups.get(level) ?? []), node]); });
  return Array.from(groups, ([level, grouped]) => ({ level, nodes: grouped.sort((a, b) => (positions[a.id]?.order ?? 0) - (positions[b.id]?.order ?? 0)) })).sort((a, b) => a.level - b.level);
}

function subscribeForcedColors(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(forced-colors: active)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function forcedColorsSnapshot() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(forced-colors: active)").matches;
}

function useForcedColors() {
  return useSyncExternalStore(subscribeForcedColors, forcedColorsSnapshot, () => false);
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function levelLabel(level: number, labels: readonly string[]) { return labels[level]?.trim() || `Level ${level + 1}`; }
function reducedMotionSnapshot() { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
function useReducedMotion() { return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => true); }
