import { fireEvent, render, screen } from "@testing-library/react";
import type { GraphEdge, GraphNode } from "@dm-hq/api-client";
import { expect, test, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => function MockWebglGraph() {
    return <div data-testid="webgl-graph" />;
  },
}));

import GraphCanvas from "@/components/graph-canvas";

const nodes: GraphNode[] = [
  { id: "campaign", node_type: "campaign", title: "Lantern Harbor", kind: "campaign", status: "canon", summary: "A port city watched by an old lighthouse." },
  { id: "captain", node_type: "item", title: "Captain Vey", kind: "entity", status: "canon", summary: "Harbormaster and reluctant ally." },
];

const edges: GraphEdge[] = [
  { id: "edge", edge_class: "relationship", source_id: "campaign", target_id: "captain", kind: "protected_by", label: "protected by", inverse_label: "protects" },
];

test("keeps the semantic graph usable while presenting node summaries", () => {
  render(<GraphCanvas campaignId="campaign" nodes={nodes} edges={edges} focusId="campaign" />);

  expect(screen.getByRole("img", { name: /2 pages and 1 connections/ })).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "Lantern Harbor" })).toHaveTextContent("A port city watched by an old lighthouse.");
  expect(screen.getByRole("link", { name: "Open page" })).toHaveAttribute("href", "/campaigns/campaign/archive");

  fireEvent.click(screen.getByRole("button", { name: "Select Captain Vey" }));
  expect(screen.getByRole("dialog", { name: "Captain Vey" })).toHaveTextContent("Harbormaster and reluctant ally.");
  expect(screen.getByRole("link", { name: "Open page" })).toHaveAttribute("href", "/campaigns/campaign/archive/items/captain");

  fireEvent.keyDown(screen.getByRole("dialog", { name: "Captain Vey" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("offers an explicit non-WebGL list presentation", () => {
  render(<GraphCanvas campaignId="campaign" nodes={nodes} edges={edges} />);

  fireEvent.click(screen.getAllByRole("button", { name: "List" })[0]);
  expect(screen.getByText(/All graph navigation remains available without WebGL/)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /Captain Vey/ })[0]);
  expect(screen.getByRole("dialog", { name: "Captain Vey" })).toBeInTheDocument();
});
