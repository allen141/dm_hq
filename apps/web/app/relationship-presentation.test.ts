import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { describe, expect, test } from "vitest";
import {
  buildRelationshipPresentation,
  relationshipFactsForNode,
} from "@/lib/relationship-presentation";

const nodes: GraphNode[] = [
  { id: "mara", node_type: "item", title: "Mara", kind: "entity", status: "canon" },
  { id: "selka", node_type: "item", title: "Selka", kind: "entity", status: "canon" },
  { id: "brann", node_type: "item", title: "Brann", kind: "entity", status: "canon" },
  { id: "wardens", node_type: "item", title: "Harbor Wardens", kind: "entity", status: "canon" },
];

const edges: GraphEdge[] = [
  edge("commands", "mara", "selka", "commands", "commands", "commanded by"),
  edge("commands-2", "selka", "brann", "commands", "commands", "commanded by"),
  edge("cycle", "brann", "mara", "commands", "commands", "commanded by"),
  edge("ally", "mara", "selka", "allied_with", "allied with", "allied with"),
  edge("member", "mara", "wardens", "member_of", "member of", "has member"),
];

describe("buildRelationshipPresentation", () => {
  test("separates visible relationship facts from structural layout edges", () => {
    const presentation = buildRelationshipPresentation(nodes, edges, {
      layout_mode: "hierarchy",
      visible_relationship_kinds: ["commands", "allied_with"],
      layout_relationship_kinds: ["commands"],
    });

    expect(presentation.edges.map(({ id }) => id)).toEqual(["commands", "commands-2", "cycle", "ally"]);
    expect([...presentation.structural_edge_ids]).toEqual(["commands", "commands-2", "cycle"]);
    expect(presentation.positions).not.toBeNull();
  });

  test("produces deterministic layered coordinates across reordering and preserves cycles", () => {
    const options = { layout_mode: "hierarchy" as const, layout_relationship_kinds: ["commands"], root_id: "mara" };
    const first = buildRelationshipPresentation(nodes, edges, options);
    const reordered = buildRelationshipPresentation([...nodes].reverse(), [...edges].reverse(), options);

    expect(first.positions).toEqual(reordered.positions);
    expect(first.positions?.mara.level).toBe(first.positions?.selka.level);
    expect(first.positions?.selka.level).toBe(first.positions?.brann.level);
    expect(first.edges).toHaveLength(edges.length);
  });

  test("supports incoming direction, both orientations, forests, and disconnected members", () => {
    const noCycle = edges.filter(({ id }) => id !== "cycle");
    const topDown = buildRelationshipPresentation(nodes, noCycle, {
      layout_mode: "hierarchy", layout_relationship_kinds: ["commands"], root_id: "mara",
    }).positions!;
    const incoming = buildRelationshipPresentation(nodes, noCycle, {
      layout_mode: "hierarchy", layout_relationship_kinds: ["commands"], layout_direction: "incoming",
    }).positions!;
    const leftRight = buildRelationshipPresentation(nodes, noCycle, {
      layout_mode: "hierarchy", layout_relationship_kinds: ["commands"], orientation: "left_to_right",
    }).positions!;

    expect(topDown.mara.level).toBeLessThan(topDown.brann.level);
    expect(incoming.brann.level).toBeLessThan(incoming.mara.level);
    expect(Math.abs(leftRight.brann.x)).toBeGreaterThan(Math.abs(leftRight.brann.y));
    expect(topDown.wardens).toEqual(expect.objectContaining({ level: 0 }));
  });
});

describe("relationshipFactsForNode", () => {
  test("uses forward and inverse wording and retains parallel facts", () => {
    const facts = relationshipFactsForNode(nodes, edges, "selka");
    expect(facts.map(({ phrase }) => phrase)).toEqual([
      "allied with Mara",
      "commanded by Mara",
      "commands Brann",
    ]);
  });
});

function edge(id: string, source_id: string, target_id: string, kind: string, label: string, inverse_label: string): GraphEdge {
  return { id, edge_class: "relationship", source_id, target_id, kind, label, inverse_label };
}
