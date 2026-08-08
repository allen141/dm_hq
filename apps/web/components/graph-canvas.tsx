"use client";

import { autoUpdate, flip, offset, shift, useFloating, type VirtualElement } from "@floating-ui/react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { archiveDocumentHref } from "@/lib/archive-routes";
import { summarizeSelectedNode } from "@/lib/graph-presentation";

type GraphCanvasProps = {
  campaignId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  focusId?: string;
};

type AnchorPosition = { x: number; y: number };

type WebglGraphProps = GraphCanvasProps & {
  selectedId: string | null;
  reducedMotion: boolean;
  onAnchorChange: (position: AnchorPosition | null) => void;
  onRenderError: (message: string) => void;
  onSelect: (nodeId: string | null) => void;
};

const WebglGraph = dynamic<WebglGraphProps>(() => import("@/components/graph-webgl"), {
  ssr: false,
  loading: () => <div className="graph-loading" role="status">Charting this neighborhood…</div>,
});

class GraphRenderBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void; resetKey: number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    this.props.onError(`The WebGL view could not start${detail}. The page index remains fully available.`);
  }

  componentDidUpdate(previous: Readonly<{ resetKey: number }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function GraphCanvas({ campaignId, nodes, edges, focusId }: GraphCanvasProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => focusId ?? null);
  const [anchor, setAnchor] = useState<AnchorPosition | null>(null);
  const [query, setQuery] = useState("");
  const [renderMode, setRenderMode] = useState<"webgl" | "list">("webgl");
  const [rendererMessage, setRendererMessage] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const selection = useMemo(
    () => selectedId ? summarizeSelectedNode(nodes, edges, selectedId) : null,
    [edges, nodes, selectedId],
  );
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return nodes
      .filter((node) => node.title.toLowerCase().includes(normalized) || node.kind.toLowerCase().includes(normalized))
      .slice(0, 7);
  }, [nodes, query]);

  const { refs, floatingStyles, update } = useFloating({
    open: Boolean(selection),
    placement: "right-start",
    middleware: [offset(14), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    // Keep route-driven graph focus synchronized with transient selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedId(focusId ?? null);
  }, [focusId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!selection || !anchor || !stage || renderMode !== "webgl") {
      refs.setPositionReference(null);
      return;
    }
    const virtualReference: VirtualElement = {
      contextElement: stage,
      getBoundingClientRect() {
        const bounds = stage.getBoundingClientRect();
        const x = bounds.left + anchor.x;
        const y = bounds.top + anchor.y;
        return {
          x,
          y,
          top: y,
          right: x,
          bottom: y,
          left: x,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      },
    };
    refs.setPositionReference(virtualReference);
    void update();
  }, [anchor, refs, renderMode, selection, update]);

  useEffect(() => {
    if (!selection) return;
    const frame = window.requestAnimationFrame(() => inspectorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [selection]);

  if (!nodes.length) return <div className="graph-empty">No connected pages in this view.</div>;

  function selectNode(nodeId: string | null, rememberFocus = false) {
    if (rememberFocus && document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
    setSelectedId(nodeId);
    if (!nodeId) setAnchor(null);
  }

  function closeInspector() {
    setSelectedId(null);
    setAnchor(null);
    const target = returnFocusRef.current;
    if (target?.isConnected) window.requestAnimationFrame(() => target.focus());
  }

  function handleRendererError(message: string) {
    setRendererMessage(message);
    setRenderMode("list");
    setAnchor(null);
  }

  function retryRenderer() {
    setRendererMessage("");
    setRenderMode("webgl");
    setResetKey((current) => current + 1);
  }

  function setInspectorElement(node: HTMLElement | null) {
    inspectorRef.current = node;
    refs.setFloating(node);
  }

  const graphLabel = "Relationship graph with " + nodes.length + " pages and " + edges.length + " connections";
  const selectedNode = selection?.node;
  const selectedSummary = selectedNode && "summary" in selectedNode ? selectedNode.summary : "";

  return (
    <section className="graph-canvas" aria-label="Campaign graph explorer">
      <div className="sr-only" role="img" aria-label={graphLabel} />
      <div className="graph-explorer-bar">
        <div className="graph-search" role="search">
          <label htmlFor="graph-node-search">Find a page</label>
          <input
            id="graph-node-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="NPC, place, session…"
            autoComplete="off"
          />
          {matches.length > 0 && (
            <ul className="graph-search-results" aria-label="Matching graph pages">
              {matches.map((node) => (
                <li key={node.id}>
                  <button type="button" onClick={() => { selectNode(node.id, true); setQuery(""); }}>
                    <span>{node.title}</span><small>{node.kind} · {node.status}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="graph-mode-switch" aria-label="Graph presentation">
          <button type="button" className={renderMode === "webgl" ? "active" : "secondary"} aria-pressed={renderMode === "webgl"} onClick={retryRenderer}>Visual</button>
          <button type="button" className={renderMode === "list" ? "active" : "secondary"} aria-pressed={renderMode === "list"} onClick={() => { setRenderMode("list"); setAnchor(null); }}>List</button>
        </div>
      </div>

      {rendererMessage && (
        <div className="graph-renderer-notice" role="status">
          <span>{rendererMessage}</span>
          <button type="button" className="secondary" onClick={retryRenderer}>Retry visual view</button>
        </div>
      )}

      <div className="graph-stage-frame" ref={stageRef}>
        {renderMode === "webgl" ? (
          <GraphRenderBoundary key={resetKey} resetKey={resetKey} onError={handleRendererError}>
            <WebglGraph
              campaignId={campaignId}
              nodes={nodes}
              edges={edges}
              focusId={focusId}
              selectedId={selectedId}
              reducedMotion={reducedMotion}
              onAnchorChange={setAnchor}
              onRenderError={handleRendererError}
              onSelect={(nodeId) => selectNode(nodeId)}
            />
          </GraphRenderBoundary>
        ) : (
          <div className="graph-list-fallback">
            <div><span className="eyebrow">Semantic view</span><h3>Campaign pages</h3></div>
            <p>Choose any page to inspect its summary and connections. All graph navigation remains available without WebGL.</p>
            <ul>
              {nodes.map((node) => (
                <li key={node.id}>
                  <button type="button" aria-pressed={selectedId === node.id} onClick={() => selectNode(node.id, true)}>
                    <span>{node.title}</span><small>{node.kind} · {node.status}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selection && selectedNode && (
          <aside
            className={"graph-inspector" + (anchor && renderMode === "webgl" ? " floating" : " static")}
            ref={setInspectorElement}
            style={anchor && renderMode === "webgl" ? floatingStyles : undefined}
            role="dialog"
            aria-modal="false"
            aria-labelledby="graph-inspector-title"
            tabIndex={-1}
            onKeyDown={(event) => { if (event.key === "Escape") closeInspector(); }}
          >
            <div className="graph-inspector-topline">
              <span className="privacy-chip">DM private</span>
              <button type="button" className="graph-close" aria-label="Close page summary" onClick={closeInspector}>×</button>
            </div>
            <div className="graph-kind-row">
              <span className={"node-kind-icon " + selectedNode.kind} aria-hidden="true" />
              <span>{selectedNode.kind}</span>
              <span>·</span>
              <span>{selectedNode.status}</span>
            </div>
            <h3 id="graph-inspector-title">{selectedNode.title}</h3>
            <p className="graph-node-summary">{selectedSummary || "No summary has been written for this page yet."}</p>
            <div className="graph-inspector-stats" aria-label="Connection counts">
              <span><strong>{selection.neighbors.length}</strong> connected pages</span>
              <span><strong>{selection.connections.length}</strong> connections</span>
            </div>
            {selection.neighbors.length > 0 && (
              <div className="graph-neighbor-list">
                <h4>Connected pages</h4>
                <ul>
                  {selection.neighbors.slice(0, 6).map((neighbor) => (
                    <li key={neighbor.node.id}>
                      <button type="button" onClick={() => selectNode(neighbor.node.id)}>
                        <span>{neighbor.node.title}</span>
                        <small>{connectionDirectionLabel(neighbor.direction, neighbor.connection_count)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="graph-inspector-actions">
              <Link className="button" href={archiveDocumentHref(campaignId, selectedNode.id, selectedNode.node_type)}>Open page</Link>
              <Link className="button secondary" href={"/campaigns/" + campaignId + "/archive/graph?focus_id=" + encodeURIComponent(selectedNode.id)}>Explore neighborhood</Link>
            </div>
          </aside>
        )}
      </div>

      <details className="graph-node-index" key={renderMode} open={renderMode === "list"}>
        <summary>Page index <span>{nodes.length}</span></summary>
        <ul>
          {nodes.map((node) => (
            <li key={node.id}>
              <button type="button" aria-pressed={selectedId === node.id} aria-label={"Select " + node.title} onClick={() => selectNode(node.id, true)}>
                <span className={"node-kind-icon " + node.kind} aria-hidden="true" />
                <span>{node.title}</span>
                <small>{node.kind}</small>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <p className="sr-only" role="status" aria-live="polite">
        {selectedNode ? selectedNode.title + " selected with " + selection.connections.length + " connections." : ""}
      </p>
    </section>
  );
}

function connectionDirectionLabel(direction: "incoming" | "outgoing" | "bidirectional", count: number) {
  const directionLabel = direction === "bidirectional" ? "both directions" : direction;
  return directionLabel + " · " + count + (count === 1 ? " connection" : " connections");
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function reducedMotionSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => true);
}
