import { fireEvent, render, screen } from "@testing-library/react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { expect, test, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("next/dynamic", () => ({
  default: () => function MockRelationshipWebgl() { return <div data-testid="relationship-webgl" />; },
}));

import RelationshipGraphCanvas from "@/components/relationships/relationship-graph-canvas";
import { ThemeProvider } from "@/components/theme-provider";

const nodes: GraphNode[] = [
  { id: "mara", node_type: "item", title: "Mara", kind: "entity", status: "canon", summary: "Captain of the watch." },
  { id: "selka", node_type: "item", title: "Selka", kind: "entity", status: "canon" },
];
function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const edges: GraphEdge[] = [
  { id: "command", edge_class: "relationship", source_id: "mara", target_id: "selka", kind: "commands", label: "commands", inverse_label: "commanded by" },
  { id: "ally", edge_class: "relationship", source_id: "mara", target_id: "selka", kind: "allied_with", label: "allied with", inverse_label: "allied with" },
];

test("keeps root emphasis separate from selection and shows relationship wording", () => {
  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" rootId="mara" />);

  expect(screen.getByRole("tree", { name: "Relationship hierarchy" })).toBeInTheDocument();
  expect(screen.queryByTestId("relationship-webgl")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("treeitem", { name: /Selka/ }));
  expect(screen.getByRole("dialog", { name: "Selka" })).toHaveTextContent("commanded by Mara");
  expect(screen.getByRole("dialog", { name: "Selka" })).toHaveTextContent("allied with Mara");
});

test("does not open the inspector after dragging an editable card", () => {
  const onPositionChange = vi.fn();
  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" editable onPositionChange={onPositionChange} />);

  const tree = screen.getByRole("tree", { name: "Relationship hierarchy" });
  Object.defineProperty(tree, "createSVGPoint", {
    value: () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) };
      return point;
    },
  });
  Object.defineProperty(tree, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
  const card = screen.getByRole("treeitem", { name: /Mara/ });
  Object.defineProperty(card, "setPointerCapture", { value: vi.fn() });

  fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(card, { pointerId: 1, clientX: 140, clientY: 130 });
  fireEvent.pointerUp(card, { pointerId: 1, clientX: 140, clientY: 130 });
  fireEvent.click(card);

  expect(onPositionChange).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("keeps Sigma available for non-hierarchical relationship networks", () => {
  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="network" />);
  expect(screen.getByTestId("relationship-webgl")).toBeInTheDocument();
  expect(screen.queryByRole("tree", { name: "Relationship hierarchy" })).not.toBeInTheDocument();
});

test("prefers the semantic list in forced-colors mode", () => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query === "(forced-colors: active)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));

  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="network" />);

  expect(screen.queryByTestId("relationship-webgl")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Visual" })).toBeDisabled();
  expect(screen.getByText("Relationship knowledge")).toBeInTheDocument();
  vi.unstubAllGlobals();
});

test("semantic view reflects visible kinds and hierarchy levels", () => {
  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" visibleRelationshipKinds={["commands"]} layoutRelationshipKinds={["commands"]} levelLabels={["Founders", "Captains"]} />);
  fireEvent.click(screen.getByRole("button", { name: "List" }));

  expect(screen.getByText("Founders")).toBeInTheDocument();
  expect(screen.getByText("Captains")).toBeInTheDocument();
  expect(screen.getByText("commands Selka")).toBeInTheDocument();
  expect(screen.queryByText("allied with Selka")).not.toBeInTheDocument();
});

test("can hide hierarchy level labels in visual and semantic modes", () => {
  renderWithTheme(<RelationshipGraphCanvas campaignId="campaign" nodes={nodes} edges={edges} layoutMode="hierarchy" visibleRelationshipKinds={["commands"]} layoutRelationshipKinds={["commands"]} showLevelLabels={false} />);

  expect(screen.queryByText("Level 1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  expect(screen.queryByText("Level 1")).not.toBeInTheDocument();
  expect(screen.getByText("commands Selka")).toBeInTheDocument();
});
