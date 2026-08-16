"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import type { RelationshipOrientation, RelationshipPosition } from "@/lib/relationship-presentation";

export type RelationshipTreeProps = {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  structuralEdgeIds: ReadonlySet<string>;
  positions: Readonly<Record<string, RelationshipPosition>>;
  orientation: RelationshipOrientation;
  rootId?: string | null;
  selectedId: string | null;
  showLevelLabels?: boolean;
  levelLabels?: readonly string[];
  onSelect: (id: string) => void;
  editable?: boolean;
  manualPositions?: Readonly<Record<string, { x: number; y: number }>>;
  onPositionChange?: (id: string, position: { x: number; y: number }, level: number) => void;
  onConnect?: (sourceId: string, targetId: string) => void;
};

type Card = { x: number; y: number; level: number; node: GraphNode };

const CARD_WIDTH = 224;
const CARD_HEIGHT = 78;
const NODE_GAP = 42;
const LEVEL_GAP = 112;
const PADDING = 76;

export default function RelationshipTree({
  nodes,
  edges,
  structuralEdgeIds,
  positions,
  orientation,
  rootId,
  selectedId,
  showLevelLabels = true,
  levelLabels = [],
  onSelect,
  editable = false,
  manualPositions = {},
  onPositionChange,
  onConnect,
}: RelationshipTreeProps) {
  const [draftPositions, setDraftPositions] = useState(manualPositions);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [wireSource, setWireSource] = useState<string | null>(null);
  useEffect(() => setDraftPositions(manualPositions), [manualPositions]);
  const { cards, width, height } = treeGeometry(nodes, positions, orientation, draftPositions);
  const cardById = new Map(cards.map((card) => [card.node.id, card]));
  const connectors = edges.flatMap((edge) => {
    const source = cardById.get(edge.source_id);
    const target = cardById.get(edge.target_id);
    if (!source || !target) return [];
    const structural = structuralEdgeIds.has(edge.id) && source.level !== target.level;
    return [{ edge, source, target, structural }];
  });
  const levelCount = Math.max(0, ...cards.map(({ level }) => level)) + 1;

  const pointerPosition = (event: ReactPointerEvent<SVGGElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return { x: event.clientX, y: event.clientY };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  };
  const startMove = (event: ReactPointerEvent<SVGGElement>, card: Card) => {
    if (!editable || wireSource) return;
    const point = pointerPosition(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: card.node.id, offsetX: point.x - card.x, offsetY: point.y - card.y });
  };
  const moveCard = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return;
    const point = pointerPosition(event);
    setDraftPositions((current) => ({ ...current, [drag.id]: { x: Math.max(0, point.x - drag.offsetX), y: Math.max(0, point.y - drag.offsetY) } }));
  };
  const finishMove = (event: ReactPointerEvent<SVGGElement>) => {
    if (!drag) return;
    const point = pointerPosition(event);
    const position = { x: Math.max(0, point.x - drag.offsetX), y: Math.max(0, point.y - drag.offsetY) };
    const levelAxis = orientation === "top_to_bottom" ? position.y : position.x;
    const level = Math.max(0, Math.round((levelAxis - PADDING) / (CARD_HEIGHT + LEVEL_GAP)));
    onPositionChange?.(drag.id, position, level);
    setDrag(null);
  };
  const startWire = (event: ReactPointerEvent<SVGCircleElement>, sourceId: string) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setWireSource(sourceId);
  };
  const finishWire = (event: ReactPointerEvent<SVGCircleElement>) => {
    if (!wireSource) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGGElement>("[data-node-id]")?.dataset.nodeId;
    if (target && target !== wireSource) onConnect?.(wireSource, target);
    setWireSource(null);
  };
  return (
    <div className="relationship-tree-viewport">
      <div className="relationship-tree-key" aria-hidden="true"><span>Hierarchy</span><span><i /> defines levels</span><span><i className="context" /> cross-link</span></div>
      <svg className="relationship-tree" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="tree" aria-label="Relationship hierarchy">
        <defs>
          <filter id="relationship-card-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="8" floodColor="#020b0f" floodOpacity=".42" /></filter>
        </defs>
        {showLevelLabels && (
          <g className="relationship-tree-levels" aria-hidden="true">
            {Array.from({ length: levelCount }, (_, level) => {
              const card = cards.find((candidate) => candidate.level === level);
              if (!card) return null;
              const label = levelLabel(level, levelLabels);
              return orientation === "top_to_bottom"
                ? <text key={level} x={22} y={card.y + CARD_HEIGHT / 2}>{label}</text>
                : <text key={level} x={card.x + CARD_WIDTH / 2} y={32} textAnchor="middle">{label}</text>;
            })}
          </g>
        )}
        <g className="relationship-tree-connectors" aria-hidden="true">
          {connectors.map(({ edge, source, target, structural }) => <path key={edge.id} className={structural ? "structural" : "context"} d={connectorPath(source, target, orientation, structural)} />)}
        </g>
        <g className="relationship-tree-cards">
          {cards.map(({ node, x, y, level }) => {
            const selected = node.id === selectedId;
            const root = node.id === rootId;
            return (
              <g key={node.id} data-node-id={node.id} className={`relationship-tree-card${selected ? " selected" : ""}${root ? " root" : ""}${editable ? " editable" : ""}`} role="treeitem" aria-level={level + 1} aria-selected={selected} tabIndex={0} transform={`translate(${x} ${y})`} onPointerDown={(event) => startMove(event, { node, x, y, level })} onPointerMove={moveCard} onPointerUp={finishMove} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
                <title>{node.title} · {node.kind} · {node.status}</title>
                <rect width={CARD_WIDTH} height={CARD_HEIGHT} rx="8" filter="url(#relationship-card-shadow)" />
                <rect className="accent" width="5" height={CARD_HEIGHT} rx="3" />
                <text className="title" x="20" y="32">{truncate(node.title, 27)}</text>
                <text className="meta" x="20" y="55">{truncate(`${node.kind} · ${node.status}`, 31)}</text>
                {root && <text className="root-label" x={CARD_WIDTH - 14} y="18" textAnchor="end">ROOT</text>}
                {editable && <circle className="relationship-connect-handle" cx={CARD_WIDTH} cy={CARD_HEIGHT / 2} r="8" aria-label={`Connect ${node.title}`} onPointerDown={(event) => startWire(event, node.id)} onPointerUp={finishWire} />}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function treeGeometry(nodes: readonly GraphNode[], positions: Readonly<Record<string, RelationshipPosition>>, orientation: RelationshipOrientation, manualPositions: Readonly<Record<string, { x: number; y: number }>> = {}) {
  const levels = new Map<number, GraphNode[]>();
  nodes.forEach((node) => {
    const level = positions[node.id]?.level ?? 0;
    levels.set(level, [...(levels.get(level) ?? []), node]);
  });
  levels.forEach((levelNodes) => levelNodes.sort((left, right) => {
    const order = (positions[left.id]?.order ?? 0) - (positions[right.id]?.order ?? 0);
    return order || left.title.localeCompare(right.title);
  }));
  const orderedLevels = Array.from(levels).sort(([left], [right]) => left - right);
  const maxAcross = Math.max(1, ...orderedLevels.map(([, levelNodes]) => levelNodes.length));
  const levelCount = Math.max(1, ...orderedLevels.map(([level]) => level + 1));
  const acrossSize = maxAcross * CARD_WIDTH + (maxAcross - 1) * NODE_GAP;
  const downSize = levelCount * CARD_HEIGHT + (levelCount - 1) * LEVEL_GAP;
  let width = (orientation === "top_to_bottom" ? acrossSize : downSize) + PADDING * 2;
  let height = (orientation === "top_to_bottom" ? downSize : acrossSize) + PADDING * 2;
  const cards: Card[] = [];

  orderedLevels.forEach(([level, levelNodes]) => {
    const usedAcross = levelNodes.length * CARD_WIDTH + (levelNodes.length - 1) * NODE_GAP;
    const offset = PADDING + (acrossSize - usedAcross) / 2;
    levelNodes.forEach((node, order) => {
      const across = offset + order * (CARD_WIDTH + NODE_GAP);
      const down = PADDING + level * (CARD_HEIGHT + LEVEL_GAP);
      cards.push(orientation === "top_to_bottom" ? { node, level, x: across, y: down } : { node, level, x: down, y: across });
    });
  });
  cards.forEach((card) => {
    const manual = manualPositions[card.node.id];
    if (!manual) return;
    card.x = manual.x;
    card.y = manual.y;
    width = Math.max(width, card.x + CARD_WIDTH + PADDING);
    height = Math.max(height, card.y + CARD_HEIGHT + PADDING);
  });
  return { cards, width, height };
}

function connectorPath(source: Card, target: Card, orientation: RelationshipOrientation, structural: boolean) {
  if (!structural) {
    const startX = source.x + CARD_WIDTH / 2;
    const startY = source.y + CARD_HEIGHT / 2;
    const endX = target.x + CARD_WIDTH / 2;
    const endY = target.y + CARD_HEIGHT / 2;
    const curve = orientation === "top_to_bottom" ? Math.max(38, Math.abs(endX - startX) * .22) : Math.max(38, Math.abs(endY - startY) * .22);
    return orientation === "top_to_bottom"
      ? `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX + curve} ${endY}, ${endX} ${endY}`
      : `M ${startX} ${startY} C ${startX} ${startY + curve}, ${endX} ${endY + curve}, ${endX} ${endY}`;
  }
  const first = source.level < target.level ? source : target;
  const second = first === source ? target : source;
  if (orientation === "top_to_bottom") {
    const startX = first.x + CARD_WIDTH / 2;
    const startY = first.y + CARD_HEIGHT;
    const endX = second.x + CARD_WIDTH / 2;
    const endY = second.y;
    const middleY = (startY + endY) / 2;
    return `M ${startX} ${startY} V ${middleY} H ${endX} V ${endY}`;
  }
  const startX = first.x + CARD_WIDTH;
  const startY = first.y + CARD_HEIGHT / 2;
  const endX = second.x;
  const endY = second.y + CARD_HEIGHT / 2;
  const middleX = (startX + endX) / 2;
  return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
}

function levelLabel(level: number, labels: readonly string[]) { return labels[level]?.trim() || `Level ${level + 1}`; }

function truncate(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
