import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import ArchiveGraphPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ campaignId: "campaign-1" }), useSearchParams: () => new URLSearchParams() }));

beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ focus_id: "a", depth: 1, nodes: [{ id: "a", node_type: "item", title: "Marra", kind: "entity", status: "canon" }, { id: "b", node_type: "item", title: "Harbor", kind: "entity", status: "canon" }], edges: [{ id: "edge-1", edge_class: "relationship", source_id: "a", target_id: "b", kind: "works_at", label: "works at", inverse_label: "employs" }], limits: { max_nodes: 100, max_edges: 250 }, truncated: { nodes: false, edges: false } }) })));

test("pairs the graph with an accessible relationship table", async () => {
  render(<ArchiveGraphPage />);
  expect(screen.getByRole("heading", { name: "Knowledge graph" })).toBeInTheDocument();
  expect(await screen.findByRole("cell", { name: "works at" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /2 pages and 1 connections/ })).toBeInTheDocument();
});
