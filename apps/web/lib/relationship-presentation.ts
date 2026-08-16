import type { GraphEdge, GraphNode } from "@dm-hq/api-client";

export type RelationshipLayoutMode = "network" | "hierarchy";
export type RelationshipOrientation = "top_to_bottom" | "left_to_right";
export type RelationshipLayoutDirection = "outgoing" | "incoming";

export type RelationshipPosition = { x: number; y: number; level: number; order: number };

export type RelationshipPresentationOptions = {
  layout_mode?: RelationshipLayoutMode;
  orientation?: RelationshipOrientation;
  root_id?: string | null;
  visible_relationship_kinds?: readonly string[];
  layout_relationship_kinds?: readonly string[];
  layout_direction?: RelationshipLayoutDirection;
  level_overrides?: Readonly<Record<string, number | null | undefined>>;
};

export type RelationshipPresentation = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  structural_edge_ids: Set<string>;
  positions: Readonly<Record<string, RelationshipPosition>> | null;
};

export type RelationshipFact = {
  edge: GraphEdge;
  node: GraphNode;
  neighbor: GraphNode | null;
  direction: "outgoing" | "incoming" | "self";
  phrase: string;
};

/**
 * Creates the relationship-specific input for the shared Sigma renderer. Edges
 * are never inferred or rewritten: visibility only filters the canonical facts,
 * and structural kinds only influence hierarchy coordinates.
 */
export function buildRelationshipPresentation(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  options: RelationshipPresentationOptions = {},
): RelationshipPresentation {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const visibleKinds = normalizedKindSet(options.visible_relationship_kinds);
  const visibleEdges = edges.filter((edge) =>
    edge.edge_class === "relationship"
    && nodeIds.has(edge.source_id)
    && nodeIds.has(edge.target_id)
    && (!visibleKinds.size || visibleKinds.has(normalizeKind(edge.kind))),
  );
  const structuralKinds = normalizedKindSet(options.layout_relationship_kinds);
  const structuralEdges = visibleEdges.filter((edge) =>
    !structuralKinds.size || structuralKinds.has(normalizeKind(edge.kind)),
  );

  return {
    nodes: nodes.slice(),
    edges: visibleEdges,
    structural_edge_ids: new Set(structuralEdges.map((edge) => edge.id)),
    positions: options.layout_mode === "hierarchy"
      ? buildHierarchyPositions(nodes, structuralEdges, options)
      : null,
  };
}

/** Returns every visible relationship as a concise phrase from one node's point of view. */
export function relationshipFactsForNode(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  nodeId: string,
): RelationshipFact[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node) return [];

  return edges
    .filter((edge) => edge.source_id === nodeId || edge.target_id === nodeId)
    .slice()
    .sort(compareEdges)
    .map((edge) => {
      const self = edge.source_id === nodeId && edge.target_id === nodeId;
      const outgoing = edge.source_id === nodeId;
      const neighbor = self ? node : byId.get(outgoing ? edge.target_id : edge.source_id) ?? null;
      const label = outgoing ? edge.label : edge.inverse_label;
      const phrase = !self && !outgoing && !label.trim()
        ? incomingRelationshipPhrase(edge.kind, neighbor?.title)
        : relationshipPhrase(label, edge.kind, neighbor?.title);
      return {
        edge,
        node,
        neighbor,
        direction: self ? "self" : outgoing ? "outgoing" : "incoming",
        phrase,
      };
    });
}

function incomingRelationshipPhrase(kind: string, neighborTitle?: string): string {
  const relation = kind.replaceAll("_", " ").trim() || "relationship";
  return neighborTitle ? `incoming ${relation} from ${neighborTitle}` : `incoming ${relation}`;
}

export function relationshipPhrase(label: string, kind: string, neighborTitle?: string): string {
  const relation = label.trim() || kind.replaceAll("_", " ").trim() || "related to";
  return neighborTitle ? `${relation} ${neighborTitle}` : relation;
}

export function buildHierarchyPositions(
  nodes: readonly GraphNode[],
  structuralEdges: readonly GraphEdge[],
  options: Pick<RelationshipPresentationOptions, "orientation" | "root_id" | "layout_direction" | "level_overrides"> = {},
): Readonly<Record<string, RelationshipPosition>> {
  const ids = nodes.map((node) => node.id).sort(compareStrings);
  const idSet = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));

  for (const edge of structuralEdges.slice().sort(compareEdges)) {
    if (!idSet.has(edge.source_id) || !idSet.has(edge.target_id)) continue;
    const source = options.layout_direction === "incoming" ? edge.target_id : edge.source_id;
    const target = options.layout_direction === "incoming" ? edge.source_id : edge.target_id;
    const targets = outgoing.get(source);
    if (targets && !targets.includes(target)) targets.push(target);
  }
  outgoing.forEach((targets) => targets.sort(compareStrings));

  // Collapse cycles before assigning levels. Members of a cycle intentionally
  // share a rank; all original edges remain available for rendering as cross-links.
  const components = stronglyConnectedComponents(ids, outgoing);
  const componentByNode = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentByNode.set(id, index)));
  const componentOutgoing = new Map(components.map((_, index) => [index, new Set<number>()]));
  const indegree = new Map(components.map((_, index) => [index, 0]));
  for (const [source, targets] of outgoing) {
    const from = componentByNode.get(source);
    if (from == null) continue;
    for (const target of targets) {
      const to = componentByNode.get(target);
      if (to == null || to === from || componentOutgoing.get(from)?.has(to)) continue;
      componentOutgoing.get(from)?.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }

  const componentKey = (index: number) => components[index]?.[0] ?? "";
  const roots = components.map((_, index) => index).filter((index) => indegree.get(index) === 0);
  roots.sort((left, right) => compareStrings(componentKey(left), componentKey(right)));
  const requestedRoot = options.root_id ? componentByNode.get(options.root_id) : undefined;
  if (requestedRoot != null) {
    const at = roots.indexOf(requestedRoot);
    if (at >= 0) roots.splice(at, 1);
    roots.unshift(requestedRoot);
  }

  const levels = new Map<number, number>();
  const queue = [...roots];
  roots.forEach((root) => levels.set(root, 0));
  while (queue.length) {
    const current = queue.shift()!;
    const next = Array.from(componentOutgoing.get(current) ?? []).sort((left, right) => compareStrings(componentKey(left), componentKey(right)));
    for (const target of next) {
      const candidate = (levels.get(current) ?? 0) + 1;
      const previous = levels.get(target);
      if (previous == null) queue.push(target);
      levels.set(target, Math.max(previous ?? 0, candidate));
    }
  }
  components.forEach((_, index) => { if (!levels.has(index)) levels.set(index, 0); });

  const byLevel = new Map<number, string[]>();
  components.forEach((component, index) => {
    const level = levels.get(index) ?? 0;
    byLevel.set(level, [...(byLevel.get(level) ?? []), ...component]);
  });

  const positions: Record<string, RelationshipPosition> = {};
  const orientation = options.orientation ?? "top_to_bottom";
  for (const [level, levelIds] of Array.from(byLevel).sort(([left], [right]) => left - right)) {
    levelIds.sort((left, right) => {
      if (left === options.root_id) return -1;
      if (right === options.root_id) return 1;
      return compareStrings(left, right);
    });
    const center = (levelIds.length - 1) / 2;
    levelIds.forEach((id, order) => {
      const across = (order - center) * 2.4;
      const down = -level * 2.5;
      positions[id] = orientation === "left_to_right"
        ? { x: -down, y: -across, level, order }
        : { x: across, y: down, level, order };
    });
  }
  for (const [id, override] of Object.entries(options.level_overrides ?? {})) {
    const current = positions[id];
    if (!current || override == null || !Number.isInteger(override) || override < 0) continue;
    positions[id] = orientation === "left_to_right"
      ? { ...current, x: override * 2.5, level: override }
      : { ...current, y: -override * 2.5, level: override };
  }
  return positions;
}

function stronglyConnectedComponents(ids: readonly string[], outgoing: ReadonlyMap<string, readonly string[]>): string[][] {
  let nextIndex = 0;
  const indexById = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  function visit(id: string) {
    indexById.set(id, nextIndex);
    lowLink.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    onStack.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (!indexById.has(target)) {
        visit(target);
        lowLink.set(id, Math.min(lowLink.get(id)!, lowLink.get(target)!));
      } else if (onStack.has(target)) {
        lowLink.set(id, Math.min(lowLink.get(id)!, indexById.get(target)!));
      }
    }
    if (lowLink.get(id) !== indexById.get(id)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(component.sort(compareStrings));
  }

  ids.forEach((id) => { if (!indexById.has(id)) visit(id); });
  return components.sort((left, right) => compareStrings(left[0] ?? "", right[0] ?? ""));
}

function normalizedKindSet(kinds: readonly string[] | undefined): Set<string> {
  return new Set((kinds ?? []).map(normalizeKind).filter(Boolean));
}

function normalizeKind(kind: string): string {
  return kind.trim().toLowerCase();
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
  return compareStrings([left.source_id, left.target_id, left.kind, left.id].join("\u0000"), [right.source_id, right.target_id, right.kind, right.id].join("\u0000"));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
