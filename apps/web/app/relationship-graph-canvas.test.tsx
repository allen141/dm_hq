import { fireEvent, render, screen } from "@testing-library/react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { expect, test, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => function MockRelationshipWebgl() { return <div data-testid="relationship-webgl" />; },
}));

import RelationshipGraphCanvas from "@/components/relationships/relationship-graph-canvas";

const nodes: GraphNode[] = [
  { id: "mara", node_type: "item", title: "Mara", kind: "entity", status: "canon", summary: "Captain of the watch." },
  { id: "selka", node_type: "item", title: "Selka", kind: "entity", status: "canon" },
];
const edges: GraphEdge[] = [
  { id: "command", edge_class: "relationship", source_id: "mara", target_id: "selka", kind: "commands", label: "commands", inverse_label: "commanded by" },
  { id: "ally", edge_class: "relationship", source_id: "mara", target_id: "selka", kind: "allied_with", label: "allied with", inverse_label: "allied with" },
];

test("keeps root emphasis separate from selection and shows relationship wording", () => {
  render(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" rootId="mara" />);

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select Selka" }));
  expect(screen.getByRole("dialog", { name: "Selka" })).toHaveTextContent("commanded by Mara");
  expect(screen.getByRole("dialog", { name: "Selka" })).toHaveTextContent("allied with Mara");
});

test("semantic view reflects visible kinds and hierarchy levels", () => {
  render(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" visibleRelationshipKinds={["commands"]} layoutRelationshipKinds={["commands"]} />);
  fireEvent.click(screen.getByRole("button", { name: "List" }));

  expect(screen.getByText("Level 1")).toBeInTheDocument();
  expect(screen.getByText("Level 2")).toBeInTheDocument();
  expect(screen.getByText("commands Selka")).toBeInTheDocument();
  expect(screen.queryByText("allied with Selka")).not.toBeInTheDocument();
});
